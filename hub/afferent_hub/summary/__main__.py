import json
import sys
from pathlib import Path

from . import ollama, weekly_summary

fixture = Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "analytics_anna.json"
path = Path(sys.argv[1]) if len(sys.argv) > 1 else fixture
analytics = json.loads(path.read_text())
patient = {"id": analytics.get("patient_id"), "display_name": str(analytics.get("patient_id", "patient")).title(),
           "simulated": analytics.get("simulated", True)}
print(f"ollama: {ollama.base_url()}  model: {ollama.discover() or 'none'}", file=sys.stderr)
result = weekly_summary(analytics, patient, refresh=True)
print(json.dumps({k: result[k] for k in ("source", "model", "fallback_reason", "text")}, indent=1))
