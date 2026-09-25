"""
Procurement integration bridge.

Answers: "given a shipment from region A to region B, what's the route
risk -- broken down by transport mode (sea / air / road)?"

Backed by the `routes` / `route_chokepoints` tables rather than a hardcoded
origin-only lookup, so new lanes can be added by inserting rows in the
database instead of editing code (see seed_routes.sql for an example).
"""

import os
from typing import Optional

import psycopg2
import psycopg2.extras

DB_DSN = os.environ["DATABASE_URL"]

MODE_LABELS = {
    "maritime": "sea",
    "air": "air",
    "land": "road",
    "rail": "rail",
}

# Every mode we always want to report on, even when no route is mapped for
# it, so the caller gets an explicit "no road route" rather than a silently
# missing key. Rail is intentionally excluded -- it's only relevant for a
# handful of specific corridors (e.g. China-Europe), not a default expectation.
ALWAYS_REPORT_MODES = ["maritime", "air", "land"]

STATUS_RANK = {"green": 0, "yellow": 1, "red": 2}


def _get_conn():
    return psycopg2.connect(DB_DSN, cursor_factory=psycopg2.extras.RealDictCursor)


def _status_rank(status: str) -> int:
    return STATUS_RANK.get(status, 0)


def _recommendation_for_status(status: str) -> str:
    return {
        "green": "No significant route disruption detected. Proceed as planned.",
        "yellow": "Elevated risk on part of this route. Consider buffer lead time or a secondary supplier as backup.",
        "red": "Active disruption likely affecting this route. Recommend reviewing alternate suppliers/routes before confirming order timeline.",
    }.get(status, "Route risk data not available for this lane.")


def assess_shipment_risk(
    origin_region: str, destination_region: str, mode: Optional[str] = None
) -> dict:
    """
    Returns a per-mode risk breakdown for the origin -> destination lane.

    If `mode` is given, only routes of that mode are considered; otherwise
    every mode with a mapped route for this lane is included, so callers
    can show "by sea: X, by air: Y" side by side.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT id, name, mode
                FROM routes
                WHERE origin_region ILIKE %s AND destination_region ILIKE %s
            """
            params = [origin_region.strip(), destination_region.strip()]
            if mode:
                query += " AND mode = %s"
                params.append(mode.strip().lower())
            cur.execute(query, params)
            routes = cur.fetchall()

            if not routes:
                return {
                    "origin_region": origin_region,
                    "destination_region": destination_region,
                    "known_route": False,
                    "by_mode": {},
                    "message": (
                        f"No mapped route from '{origin_region}' to '{destination_region}'"
                        + (f" for mode '{mode}'" if mode else "")
                        + ". Add it to the routes table (see seed_routes.sql)."
                    ),
                }

            by_mode: dict = {}
            for route in routes:
                cur.execute(
                    """
                    SELECT c.id, c.name, rs.score, rs.status, rs.computed_at
                    FROM route_chokepoints rc
                    JOIN chokepoints c ON c.id = rc.chokepoint_id
                    LEFT JOIN LATERAL (
                        SELECT score, status, computed_at FROM risk_scores
                        WHERE chokepoint_id = c.id ORDER BY computed_at DESC LIMIT 1
                    ) rs ON true
                    WHERE rc.route_id = %s
                    """,
                    (route["id"],),
                )
                chokepoints = cur.fetchall()

                if chokepoints:
                    overall_status = max(
                        (cp["status"] or "green" for cp in chokepoints),
                        key=_status_rank,
                    )
                    cp_names = [cp["name"] for cp in chokepoints]
                    cur.execute(
                        """
                        SELECT e.headline, e.summary, e.severity, e.event_time,
                               c.name AS chokepoint_name
                        FROM events e
                        JOIN event_chokepoints ec ON ec.event_id = e.id
                        JOIN chokepoints c ON c.id = ec.chokepoint_id
                        WHERE c.name = ANY(%s)
                        ORDER BY e.event_time DESC LIMIT 5
                        """,
                        (cp_names,),
                    )
                    driving_events = cur.fetchall()
                else:
                    # A route with no tracked chokepoints (e.g. direct
                    # trans-Pacific air/sea) defaults to green rather than
                    # unknown -- absence of a monitored chokepoint is itself
                    # meaningful signal, not missing data.
                    overall_status = "green"
                    driving_events = []

                entry = {
                    "route_name": route["name"],
                    "status": overall_status,
                    "chokepoints": chokepoints,
                    "driving_events": driving_events,
                    "recommendation": _recommendation_for_status(overall_status),
                }

                mode_key = route["mode"]
                if mode_key not in by_mode:
                    by_mode[mode_key] = {
                        "label": MODE_LABELS.get(mode_key, mode_key),
                        "options": [entry],
                    }
                else:
                    # Some lanes have more than one named route for the same
                    # mode (e.g. direct trans-Pacific vs. via Panama Canal).
                    # List both; the mode-level status is the worse of the two,
                    # since a procurement decision needs the pessimistic case
                    # unless the caller specifies which option they'll use.
                    by_mode[mode_key]["options"].append(entry)

            for mode_key, data in by_mode.items():
                statuses = [opt["status"] for opt in data["options"]]
                data["status"] = max(statuses, key=_status_rank, default="green")
                data["recommendation"] = _recommendation_for_status(data["status"])

            # Explicitly report modes with no mapped route for this lane,
            # rather than silently omitting them -- "no road route exists"
            # is a meaningful, distinct answer from "we don't have data".
            # Skipped entirely when the caller already filtered to one mode.
            if not mode:
                for mode_key in ALWAYS_REPORT_MODES:
                    if mode_key not in by_mode:
                        by_mode[mode_key] = {
                            "label": MODE_LABELS.get(mode_key, mode_key),
                            "status": "not_applicable",
                            "options": [],
                            "message": (
                                f"No {MODE_LABELS.get(mode_key, mode_key)} route mapped "
                                f"from {origin_region} to {destination_region}."
                            ),
                        }

            return {
                "origin_region": origin_region,
                "destination_region": destination_region,
                "known_route": True,
                "by_mode": by_mode,
            }
    finally:
        conn.close()