

"""
Supply Chain Risk Agent — FastAPI backend.

Endpoints:
  GET  /chokepoints                 -> list all chokepoints with current status
  GET  /chokepoints/{id}            -> detail + recent events + score history
  GET  /routes                      -> list routes with rolled-up route-level status
  GET  /routes/{id}/alternatives    -> suggested alternate routes if status is yellow/red
  POST /ask                         -> natural-language Q&A over current risk state
  POST /procurement/route-risk      -> purpose-built endpoint for procurement integration
"""
from dotenv import load_dotenv
load_dotenv()

import os
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.agent import answer_question
from app.services.procurement_bridge import assess_shipment_risk

DB_DSN = os.environ["DATABASE_URL"]

app = FastAPI(title="Supply Chain Risk Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this for production
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    return psycopg2.connect(DB_DSN, cursor_factory=psycopg2.extras.RealDictCursor)


@app.get("/chokepoints")
def list_chokepoints(mode: Optional[str] = None):
    """List all chokepoints with their most recent risk score/status."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT c.id, c.name, c.mode, c.region,
                       ST_X(c.location::geometry) AS lon,
                       ST_Y(c.location::geometry) AS lat,
                       rs.score, rs.status, rs.computed_at
                FROM chokepoints c
                LEFT JOIN LATERAL (
                    SELECT score, status, computed_at
                    FROM risk_scores
                    WHERE chokepoint_id = c.id
                    ORDER BY computed_at DESC
                    LIMIT 1
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


@app.get("/chokepoints/{chokepoint_id}")
def get_chokepoint(chokepoint_id: str):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM chokepoints WHERE id = %s", (chokepoint_id,))
            cp = cur.fetchone()
            if not cp:
                raise HTTPException(status_code=404, detail="Chokepoint not found")

            cur.execute(
                """
                SELECT score, status, computed_at FROM risk_scores
                WHERE chokepoint_id = %s ORDER BY computed_at DESC LIMIT 50
                """,
                (chokepoint_id,),
            )
            cp["score_history"] = cur.fetchall()

            cur.execute(
                """
                SELECT e.id, e.headline, e.summary, e.event_type, e.severity,
                       e.confidence, e.event_time, e.source
                FROM events e
                JOIN event_chokepoints ec ON ec.event_id = e.id
                WHERE ec.chokepoint_id = %s
                ORDER BY e.event_time DESC LIMIT 20
                """,
                (chokepoint_id,),
            )
            cp["recent_events"] = cur.fetchall()
            return cp
    finally:
        conn.close()


@app.get("/routes")
def list_routes():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, r.name, r.mode, r.origin_region, r.destination_region,
                       MAX(rs.status) AS worst_status
                FROM routes r
                LEFT JOIN route_chokepoints rc ON rc.route_id = r.id
                LEFT JOIN LATERAL (
                    SELECT status FROM risk_scores
                    WHERE chokepoint_id = rc.chokepoint_id
                    ORDER BY computed_at DESC LIMIT 1
                ) rs ON true
                GROUP BY r.id, r.name, r.mode, r.origin_region, r.destination_region
                """
            )
            return cur.fetchall()
    finally:
        conn.close()


@app.get("/routes/{route_id}/alternatives")
def get_alternatives(route_id: str):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, mode, origin_region, destination_region
                FROM routes WHERE is_alternate_for = %s
                """,
                (route_id,),
            )
            return cur.fetchall()
    finally:
        conn.close()


class AskRequest(BaseModel):
    question: str


@app.post("/ask")
def ask(req: AskRequest):
    answer = answer_question(req.question)
    return {"question": req.question, "answer": answer}


class ShipmentRiskRequest(BaseModel):
    supplier_region: str
    destination_region: Optional[str] = None
    order_id: Optional[str] = None


@app.post("/procurement/route-risk")
def procurement_route_risk(req: ShipmentRiskRequest):
    """
    Purpose-built endpoint for the procurement agent's "Use risk analysis"
    toggle. Given a supplier region, returns the current risk status of the
    chokepoints that shipment would transit, plus a plain-language
    recommendation.
    """
    result = assess_shipment_risk(req.supplier_region, req.destination_region)
    if req.order_id:
        result["order_id"] = req.order_id
    return result


@app.get("/health")
def health():
    return {"status": "ok"}