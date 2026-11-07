from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from . import database, mattermost
from .config import (
    ALLOWED_EXTENSIONS,
    API_HOST,
    API_PORT,
    APP_NAME,
    APP_VERSION,
    MARKET_AGENT_NAME,
    MAX_UPLOAD_BYTES,
    RISK_AGENT_NAME,
    UPLOAD_DIR,
    WORKSPACE_ROOT,
)

app = FastAPI(title=APP_NAME, version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EvaluationCreate(BaseModel):
    company_name: str = Field(min_length=2, max_length=100)
    industry: str = Field(default="", max_length=120)
    geography: str = Field(default="India", max_length=100)
    stage: str = Field(default="", max_length=80)
    website: str = Field(default="", max_length=250)
    funding_ask: str = Field(default="", max_length=100)
    description: str = Field(default="", max_length=5000)
    room_name: str = Field(default="venturelens-diligence", max_length=100)
    founder_metrics: dict[str, Any] = Field(default_factory=dict)


@app.on_event("startup")
def startup() -> None:
    database.init_db()
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    database.seed_ledgerleaf()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "name": APP_NAME, "version": APP_VERSION, "workspace_root": str(WORKSPACE_ROOT)}


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    return {
        **mattermost.public_settings(),
        "market_agent_name": MARKET_AGENT_NAME,
        "risk_agent_name": RISK_AGENT_NAME,
        "workspace_root": str(WORKSPACE_ROOT),
        "workspace_exists": WORKSPACE_ROOT.exists(),
    }


@app.post("/api/integrations/mattermost/settings")
async def update_mattermost_settings(request: Request) -> dict[str, Any]:
    """Accept credentials without Pydantic echoing request values in validation errors."""
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Mattermost settings payload.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid Mattermost settings payload.")
    server_url = payload.get("server_url")
    username = payload.get("username", "")
    password = payload.get("password")
    pat = payload.get("pat")
    if (
        not isinstance(server_url, str) or len(server_url) > 500
        or not isinstance(username, str) or len(username) > 200
        or (password is not None and (not isinstance(password, str) or len(password) > 1000))
        or (pat is not None and (not isinstance(pat, str) or len(pat) > 1000))
    ):
        raise HTTPException(status_code=400, detail="Mattermost settings are invalid or too long.")
    try:
        return mattermost.save_settings(
            server_url=server_url,
            username=username,
            password=password,
            pat=pat,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

def _report_paths(evaluation: dict[str, Any]) -> dict[str, Path]:
    base = database.workspace_for(evaluation)
    return {
        "market": base / "reports" / "market" / "market-analysis.md",
        "risk": base / "reports" / "risk" / "risk-review.md",
        "final": base / "reports" / "final-investment-memo.md",
    }


def _report_status(evaluation: dict[str, Any]) -> str:
    paths = _report_paths(evaluation)
    market_exists = paths["market"].is_file()
    risk_exists = paths["risk"].is_file()
    final_exists = paths["final"].is_file()
    if final_exists and risk_exists:
        try:
            risk_text = paths["risk"].read_text(encoding="utf-8", errors="replace").lower()
        except OSError:
            risk_text = ""
        if "second-pass validation" in risk_text or "no material" in risk_text or "independent validation" in risk_text:
            return "validated"
        return "complete"
    if market_exists or risk_exists:
        return "in_review"
    return evaluation.get("status", "draft")


def _with_live_status(item: dict[str, Any]) -> dict[str, Any]:
    result = dict(item)
    result["status"] = _report_status(item)
    paths = _report_paths(item)
    result["reports_ready"] = sum(path.is_file() for path in paths.values())
    result["report_availability"] = {key: path.is_file() for key, path in paths.items()}
    return result


@app.get("/api/evaluations")
def evaluations() -> dict[str, Any]:
    items = [_with_live_status(item) for item in database.list_evaluations()]
    return {
        "items": items,
        "summary": {
            "total": len(items),
            "in_progress": sum(item["status"] in {"in_progress", "in_review"} for item in items),
            "validated": sum(item["status"] == "validated" for item in items),
            "reports_ready": sum(item["reports_ready"] for item in items),
        },
    }


@app.post("/api/evaluations")
def create_evaluation(payload: EvaluationCreate) -> dict[str, Any]:
    slug = database.slugify(payload.company_name)
    # Keep existing project reports untouched; each new company gets an isolated folder.
    relative = str(Path("companies") / slug)
    folder = (WORKSPACE_ROOT / relative).resolve()
    if WORKSPACE_ROOT.resolve() not in folder.parents:
        raise HTTPException(status_code=400, detail="Invalid company folder")
    if folder.exists():
        raise HTTPException(status_code=409, detail="A workspace folder for this company already exists")
    (folder / "input").mkdir(parents=True, exist_ok=True)
    (folder / "reports" / "market").mkdir(parents=True, exist_ok=True)
    (folder / "reports" / "risk").mkdir(parents=True, exist_ok=True)
    brief = _render_brief(payload.model_dump())
    (folder / "input" / "startup-brief.md").write_text(brief, encoding="utf-8")
    item = database.create_evaluation({**payload.model_dump(), "slug": slug}, relative)
    return _with_live_status(item)


def _render_brief(data: dict[str, Any]) -> str:
    metrics = data.get("founder_metrics") or {}
    lines = [
        f"# Startup brief: {data['company_name']}",
        "",
        "> Treat founder-provided claims as unverified until independently evidenced.",
        "",
        f"- Industry: {data.get('industry') or 'Not provided'}",
        f"- Geography: {data.get('geography') or 'Not provided'}",
        f"- Stage: {data.get('stage') or 'Not provided'}",
        f"- Website: {data.get('website') or 'Not provided'}",
        f"- Funding sought: {data.get('funding_ask') or 'Not provided'}",
        "",
        "## Description",
        data.get("description") or "No description provided.",
        "",
        "## Founder-provided metrics (unverified)",
    ]
    lines.extend([f"- {key.replace('_', ' ').title()}: {value}" for key, value in metrics.items()])
    lines.extend(["", "## Evidence rules", "- Separate founder claims, independently sourced facts, estimates and unknowns.", "- Cite sources with URLs and dates.", "- Do not invent market statistics, competitors or evidence.", "- Explain all calculations and assumptions.", ""])
    return "\n".join(lines)


@app.post("/api/evaluations/{evaluation_id}/upload")
async def upload_pitch_deck(evaluation_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    evaluation = database.get_evaluation(evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Supported formats: PDF, DOCX, PPTX, TXT and MD")
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 20 MB upload limit")
    base = database.workspace_for(evaluation) / "input"
    base.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(file.filename or "pitch-deck").name)
    destination = base / safe_name
    destination.write_bytes(contents)
    extracted = _extract_text(destination)
    if extracted.strip():
        (base / "pitch-deck-extracted.md").write_text(
            f"# Extracted text from {safe_name}\n\n{extracted[:150000]}\n", encoding="utf-8"
        )
    return {"filename": safe_name, "bytes": len(contents), "extracted_characters": len(extracted), "stored": True}


def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            import fitz
            with fitz.open(path) as document:
                return "\n\n".join(page.get_text("text") for page in document)
        if suffix == ".docx":
            from docx import Document
            doc = Document(path)
            return "\n".join(p.text for p in doc.paragraphs)
        if suffix == ".pptx":
            from pptx import Presentation
            presentation = Presentation(path)
            return "\n\n".join(
                "\n".join(shape.text for shape in slide.shapes if getattr(shape, "has_text_frame", False))
                for slide in presentation.slides
            )
        if suffix in {".txt", ".md"}:
            return path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not extract text from file: {exc}") from exc
    return ""


def _launch_prompt(evaluation: dict[str, Any]) -> str:
    base = evaluation["workspace_relpath"].replace("\\", "/")
    brief_path = f"{base}/input/startup-brief.md" if base != "." else "input/startup-brief.md"
    market_path = f"{base}/reports/market/market-analysis.md" if base != "." else "reports/market/market-analysis.md"
    risk_path = f"{base}/reports/risk/risk-review.md" if base != "." else "reports/risk/risk-review.md"
    return (
        f"@{MARKET_AGENT_NAME}\n\n"
        f"Start a due diligence evaluation for {evaluation['company_name']}. "
        f"Read the startup brief at `{brief_path}` and any extracted pitch deck text in the same input folder.\n\n"
        "Research the market, customer segments, competitors, business model and market sizing. "
        "Separate founder-provided claims, independently sourced facts, estimates and unknowns. "
        f"Save your findings to `{market_path}`. Then ask @{RISK_AGENT_NAME} to independently challenge "
        f"your findings and save its assessment to `{risk_path}`. Discuss material disagreements in this room. "
        "Do not make an automatic investment decision; the human reviewer has final approval."
    )


@app.post("/api/evaluations/{evaluation_id}/launch")
async def launch_evaluation(evaluation_id: str) -> dict[str, Any]:
    """Prepare a prompt for manual handoff; never posts to Mattermost."""
    evaluation = database.get_evaluation(evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return {
        "sent": False,
        "launch_prompt": _launch_prompt(evaluation),
        "message": "Prompt prepared. Copy it into the Switch room manually; this integration is read-only.",
    }

@app.get("/api/evaluations/{evaluation_id}/reports")
def reports(evaluation_id: str) -> dict[str, Any]:
    evaluation = database.get_evaluation(evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    paths = _report_paths(evaluation)
    names = {"market": "Market analysis", "risk": "Independent risk review", "final": "Final investment memo"}
    items = []
    for key, path in paths.items():
        available = path.is_file()
        items.append({"key": key, "title": names[key], "available": available, "filename": path.name if available else None, "bytes": path.stat().st_size if available else 0})
    return {"items": items, "status": _report_status(evaluation)}


@app.get("/api/evaluations/{evaluation_id}/reports/{report_key}", response_class=PlainTextResponse)
def read_report(evaluation_id: str, report_key: str) -> str:
    evaluation = database.get_evaluation(evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    paths = _report_paths(evaluation)
    if report_key not in paths:
        raise HTTPException(status_code=404, detail="Report not found")
    path = paths[report_key]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Report has not been generated yet")
    if path.stat().st_size > 2_000_000:
        raise HTTPException(status_code=413, detail="Report is too large to preview")
    return path.read_text(encoding="utf-8", errors="replace")


@app.get("/api/evaluations/{evaluation_id}/activity")
async def activity(evaluation_id: str) -> dict[str, Any]:
    evaluation = database.get_evaluation(evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    if not mattermost.is_configured():
        return {"connected": False, "items": [], "message": "Configure Mattermost username/password in Settings to read the venturelens-diligence channel."}
    try:
        posts = await mattermost.get_posts()
    except (httpx.HTTPError, mattermost.MattermostNotConfigured) as exc:
        return {"connected": False, "items": [], "message": f"Mattermost activity could not be loaded. Check the saved connection settings."}
    return {"connected": True, "items": posts, "room_name": evaluation["room_name"]}


@app.post("/api/integrations/mattermost/test")
async def mattermost_test() -> dict[str, Any]:
    try:
        result = await mattermost.test_connection()
    except mattermost.MattermostNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Mattermost connection failed. Check the server URL and saved credentials.") from exc
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=API_HOST, port=API_PORT, reload=True)





