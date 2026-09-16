"""
Q&A agent: answers natural-language questions like "Is the Suez route safe
for a container shipment this week?" using tool-calling over the live DB.

Rewritten for Groq's OpenAI-compatible chat completions API. Key difference
from the Anthropic version: Groq's tool-calling loop uses "tool" role
messages keyed by tool_call_id, rather than Anthropic's tool_use/tool_result
content blocks.
"""

import os
import json
from groq import Groq
import psycopg2
import psycopg2.extras

DB_DSN = os.environ["DATABASE_URL"]
GROQ_MODEL = "llama-3.3-70b-versatile"

client = Groq()

# Groq's tool schema follows OpenAI's function-calling format: each tool is
# wrapped in {"type": "function", "function": {...}}, and parameters use
# standard JSON Schema — structurally different from Anthropic's flatter
# {"name", "description", "input_schema"} shape.
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_chokepoint_status",
            "description": "Get the current risk score, status, and recent driving events for a named chokepoint (e.g. 'Strait of Hormuz', 'Suez Canal').",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Chokepoint name or partial match"}
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_all_chokepoint_statuses",
            "description": "List every tracked chokepoint with its current status (green/yellow/red), optionally filtered by transport mode.",
            "parameters": {
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "enum": ["maritime", "air", "land", "rail"],
                        "description": "Optional filter by transport mode",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_alternate_routes",
            "description": "Find alternate routes for a given route name if the primary is degraded.",
            "parameters": {
                "type": "object",
                "properties": {"route_name": {"type": "string"}},
                "required": ["route_name"],
            },
        },
    },
]


def _get_conn():
    return psycopg2.connect(DB_DSN, cursor_factory=psycopg2.extras.RealDictCursor)


def tool_get_chokepoint_status(name: str) -> dict:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.name, c.mode, c.region, rs.score, rs.status, rs.computed_at
                FROM chokepoints c
                LEFT JOIN LATERAL (
                    SELECT score, status, computed_at FROM risk_scores
                    WHERE chokepoint_id = c.id ORDER BY computed_at DESC LIMIT 1
                ) rs ON true
                WHERE c.name ILIKE %s LIMIT 1
                """,
                (f"%{name}%",),
            )
            row = cur.fetchone()
            if not row:
                return {"error": f"No chokepoint found matching '{name}'"}

            cur.execute(
                """
                SELECT e.headline, e.summary, e.severity, e.event_time
                FROM events e
                JOIN event_chokepoints ec ON ec.event_id = e.id
                JOIN chokepoints c ON c.id = ec.chokepoint_id
                WHERE c.name ILIKE %s
                ORDER BY e.event_time DESC LIMIT 5
                """,
                (f"%{name}%",),
            )
            row["recent_events"] = cur.fetchall()
            return row
    finally:
        conn.close()


def tool_list_all_chokepoint_statuses(mode: str = None) -> list:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT c.name, c.mode, rs.score, rs.status
                FROM chokepoints c
                LEFT JOIN LATERAL (
                    SELECT score, status FROM risk_scores
                    WHERE chokepoint_id = c.id ORDER BY computed_at DESC LIMIT 1
                ) rs ON true
            """
            params = ()
            if mode:
                query += " WHERE c.mode = %s"
                params = (mode,)
            cur.execute(query, params)
            return cur.fetchall()
    finally:
        conn.close()


def tool_find_alternate_routes(route_name: str) -> list:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT alt.name, alt.mode
                FROM routes primary_r
                JOIN routes alt ON alt.is_alternate_for = primary_r.id
                WHERE primary_r.name ILIKE %s
                """,
                (f"%{route_name}%",),
            )
            return cur.fetchall()
    finally:
        conn.close()


TOOL_DISPATCH = {
    "get_chokepoint_status": lambda i: tool_get_chokepoint_status(**i),
    "list_all_chokepoint_statuses": lambda i: tool_list_all_chokepoint_statuses(**i),
    "find_alternate_routes": lambda i: tool_find_alternate_routes(**i),
}

SYSTEM_PROMPT = """You are a supply chain risk analyst assistant. You answer questions about \
current geopolitical and logistical risk to global trade routes using ONLY the data returned by \
your tools — never invent or assume a status you haven't looked up. Always cite which chokepoints \
you checked. Be direct about uncertainty: if data is stale or thin, say so. You are supporting a \
human decision-maker, not replacing their judgment — avoid absolute claims like 'guaranteed safe'; \
use 'currently low risk based on available data' instead."""


def _serialize(obj):
    return json.loads(json.dumps(obj, default=str))


def answer_question(question: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]

    while True:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=1024,
        )

        response_message = completion.choices[0].message

        if not response_message.tool_calls:
            return response_message.content or ""

        # Groq requires the assistant message (including its tool_calls) to
        # be appended before any tool results — same requirement as OpenAI.
        messages.append(response_message)

        for tool_call in response_message.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)

            fn = TOOL_DISPATCH.get(fn_name)
            result = fn(fn_args) if fn else {"error": "unknown tool"}

            # Groq's tool results are individual "tool" role messages keyed
            # by tool_call_id — not grouped into one "user" message like
            # Anthropic's tool_result blocks.
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(_serialize(result)),
                }
            )