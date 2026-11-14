import os
from dataclasses import dataclass
from pathlib import Path

HUB = Path(__file__).resolve().parents[1]
ROOT = HUB.parent


@dataclass
class Settings:
    db: str = str(HUB / "data" / "afferent.db")
    bedside: str = "sim"
    sim_pulse: bool = False
    sim_speed: float = 1.0
    seed: int = 7
    validation: bool = True
    validation_seeds: int = 50
    ollama_url: str = "http://127.0.0.1:11434"
    gemma_model: str | None = None
    bound_patient: str = "anna"
    team_fhir: bool = True
    team_fhir_vitals: bool = False
    team_report: bool = False
    team_ask_url: str = ""
    team_guard: bool = False
    data_manager_url: str = ""
    data_manager_token: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.environ
        return cls(
            db=e.get("AFFERENT_DB") or cls.db,
            bedside=e.get("AFFERENT_BEDSIDE") or "sim",
            sim_pulse=e.get("AFFERENT_SIM_PULSE", "0") == "1",
            sim_speed=float(e.get("AFFERENT_SIM_SPEED") or 1.0),
            seed=int(e.get("AFFERENT_SEED") or 7),
            validation=e.get("AFFERENT_VALIDATION", "1") != "0",
            validation_seeds=int(e.get("AFFERENT_VALIDATION_SEEDS") or 50),
            ollama_url=e.get("AFFERENT_OLLAMA_URL") or cls.ollama_url,
            gemma_model=e.get("AFFERENT_GEMMA_MODEL") or None,
            bound_patient=e.get("AFFERENT_BEDSIDE_PATIENT") or "anna",
            team_fhir=e.get("AFFERENT_TEAM_FHIR", "1") != "0",
            team_fhir_vitals=e.get("AFFERENT_TEAM_FHIR_VITALS", "0") == "1",
            team_report=e.get("AFFERENT_TEAM_REPORT", "0") == "1",
            team_ask_url=e.get("AFFERENT_TEAM_ASK_URL") or "",
            team_guard=e.get("AFFERENT_TEAM_GUARD", "0") == "1",
            data_manager_url=e.get("AFFERENT_DATA_MANAGER_URL") or "",
            data_manager_token=e.get("AFFERENT_DATA_MANAGER_TOKEN") or None,
        )
