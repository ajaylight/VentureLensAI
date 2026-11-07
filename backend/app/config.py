from pathlib import Path
import os

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

APP_NAME = "VentureLens AI"
APP_VERSION = "0.1.0"
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8000"))

# Keep this directory identical to the working directory configured for the
# Market Analyst and Risk Analyst in Switch Console.
WORKSPACE_ROOT = Path(
    os.getenv("VENTURELENS_AGENT_WORKSPACE", str(Path.home() / "VentureLensAI"))
).expanduser().resolve()

DATA_DIR = Path(os.getenv("VENTURELENS_DATA_DIR", str(PROJECT_ROOT / "backend" / "data"))).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
DATABASE_PATH = DATA_DIR / "venturelens.db"

MATTERMOST_URL = os.getenv("MATTERMOST_URL", "http://127.0.0.1:55041").rstrip("/")
MATTERMOST_USERNAME = os.getenv("MATTERMOST_USERNAME", "user").strip()
MATTERMOST_PASSWORD = os.getenv("MATTERMOST_PASSWORD", "")
MATTERMOST_CHANNEL_NAME = os.getenv("MATTERMOST_CHANNEL_NAME", "venturelens-diligence").strip()
MATTERMOST_TOKEN = os.getenv("MATTERMOST_TOKEN", "").strip()
MARKET_AGENT_NAME = os.getenv("MARKET_AGENT_NAME", "market-analyst")
RISK_AGENT_NAME = os.getenv("RISK_AGENT_NAME", "risk-analyst")

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024



