from .analytics.bandit import task_weights
from .analytics.engine import analyze_patient
from .analytics.validation import run_validation
from .summary import weekly_summary
from .synthetic import demo_roster
from .team_adapters import alex as team_alex

fn = {
    "analyze_patient": analyze_patient,
    "task_weights": task_weights,
    "run_validation": run_validation,
    "weekly_summary": weekly_summary,
    "demo_roster": demo_roster,
    "team_fhir_bundle": team_alex.fhir_bundle,
    "team_clinician_report": team_alex.clinician_report,
    "team_ask": team_alex.ask,
}
