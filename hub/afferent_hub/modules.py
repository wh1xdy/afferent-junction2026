from .analytics.bandit import task_weights
from .analytics.engine import analyze_patient
from .analytics.validation import run_validation
from .summary import summary_numbers, weekly_summary
from .synthetic import demo_roster, generate_patient
from .team_adapters import alex as team_alex

fn = {
    "analyze_patient": analyze_patient,
    "task_weights": task_weights,
    "run_validation": run_validation,
    "summary_numbers": summary_numbers,
    "weekly_summary": weekly_summary,
    "demo_roster": demo_roster,
    "generate_patient": generate_patient,
    "team_fhir_bundle": team_alex.fhir_bundle,
    "team_clinician_report": team_alex.clinician_report,
    "team_ask": team_alex.ask,
}
