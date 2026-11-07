import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .config import DATABASE_PATH, WORKSPACE_ROOT


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS evaluations (
                id TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                slug TEXT NOT NULL,
                industry TEXT NOT NULL DEFAULT '',
                geography TEXT NOT NULL DEFAULT 'India',
                stage TEXT NOT NULL DEFAULT '',
                website TEXT NOT NULL DEFAULT '',
                funding_ask TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                founder_metrics TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'draft',
                workspace_relpath TEXT NOT NULL,
                room_name TEXT NOT NULL DEFAULT 'venturelens-diligence',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        db.commit()


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    try:
        item["founder_metrics"] = json.loads(item.get("founder_metrics") or "{}")
    except json.JSONDecodeError:
        item["founder_metrics"] = {}
    return item


def list_evaluations() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM evaluations ORDER BY created_at DESC").fetchall()
    return [row_to_dict(row) for row in rows]


def get_evaluation(evaluation_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM evaluations WHERE id = ?", (evaluation_id,)).fetchone()
    return row_to_dict(row) if row else None


def create_evaluation(payload: dict[str, Any], workspace_relpath: str) -> dict[str, Any]:
    evaluation_id = str(uuid4())
    created = now_iso()
    metrics = payload.get("founder_metrics") or {}
    with connect() as db:
        db.execute(
            """INSERT INTO evaluations (
                id, company_name, slug, industry, geography, stage, website,
                funding_ask, description, founder_metrics, status,
                workspace_relpath, room_name, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                evaluation_id,
                payload["company_name"],
                payload["slug"],
                payload.get("industry", ""),
                payload.get("geography", "India"),
                payload.get("stage", ""),
                payload.get("website", ""),
                payload.get("funding_ask", ""),
                payload.get("description", ""),
                json.dumps(metrics, ensure_ascii=False),
                "draft",
                workspace_relpath,
                payload.get("room_name", "venturelens-diligence"),
                created,
                created,
            ),
        )
        db.commit()
    return get_evaluation(evaluation_id)  # type: ignore[return-value]


def update_status(evaluation_id: str, status: str) -> None:
    with connect() as db:
        db.execute(
            "UPDATE evaluations SET status = ?, updated_at = ? WHERE id = ?",
            (status, now_iso(), evaluation_id),
        )
        db.commit()


def slugify(value: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "startup"


def workspace_for(evaluation: dict[str, Any]) -> Path:
    # Resolve and enforce containment so a malformed DB path cannot escape the
    # configured agent workspace.
    root = WORKSPACE_ROOT.resolve()
    candidate = (root / evaluation["workspace_relpath"]).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("Evaluation workspace is outside the configured agent workspace")
    return candidate


def seed_ledgerleaf() -> None:
    """Register the existing fictional LedgerLeaf exercise without copying or
    overwriting the reports already produced by the user's Switch agents."""
    with connect() as db:
        count = db.execute("SELECT COUNT(*) AS n FROM evaluations").fetchone()["n"]
        if count:
            return
    brief = WORKSPACE_ROOT / "input" / "startup-brief.md"
    # Only seed when the existing project workspace is present. The user can
    # create LedgerLeaf manually from the UI if they extracted elsewhere.
    if not WORKSPACE_ROOT.exists():
        return
    if not brief.exists():
        brief.parent.mkdir(parents=True, exist_ok=True)
        brief.write_text(
            "# LedgerLeaf — fictional demo startup\n\n"
            "B2B SaaS for expense management, invoice processing and financial reporting.\n"
            "Founder-provided, unverified demo claims: 250 paying businesses; ₹1.2 crore ARR; "
            "8% monthly logo churn; 78% gross margin; ₹18,000 CAC; 14-month runway; "
            "₹5 crore funding sought.\n\n"
            "All figures are fictional and must not be treated as verified company data.\n",
            encoding="utf-8",
        )
    market = WORKSPACE_ROOT / "reports" / "market" / "market-analysis.md"
    risk = WORKSPACE_ROOT / "reports" / "risk" / "risk-review.md"
    memo = WORKSPACE_ROOT / "reports" / "final-investment-memo.md"
    status = "validated" if memo.exists() and risk.exists() else "in_progress" if market.exists() else "draft"
    create_evaluation(
        {
            "company_name": "LedgerLeaf",
            "slug": "ledgerleaf",
            "industry": "FinTech · B2B SaaS",
            "geography": "India",
            "stage": "Demo evaluation",
            "funding_ask": "₹5 crore (fictional claim)",
            "description": "Fictional B2B SaaS startup for expense management, invoice processing and financial reporting.",
            "founder_metrics": {
                "paying_businesses": 250,
                "arr_inr": 12000000,
                "monthly_logo_churn_pct": 8,
                "gross_margin_pct": 78,
                "cac_inr": 18000,
                "runway_months": 14,
                "funding_ask_inr": 50000000,
                "data_status": "Fictional founder-provided claims; unverified",
            },
        },
        ".",
    )
    with connect() as db:
        db.execute(
            "UPDATE evaluations SET status = ? WHERE slug = 'ledgerleaf'",
            (status,),
        )
        db.commit()
