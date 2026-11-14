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
    bound_patient: str = "anna"
    team_fhir: bool = True
    team_fhir_vitals: bool = False
    team_report: bool = False
    team_ask_url: str = ""
    team_guard: bool = False
    data_manager_url: str = ""
    data_manager_token: str | None = None
    transcripts_dir: str = str(HUB / "data" / "transcripts")
    transcript_file_mb: float = 10.0
    transcript_total_mb: float = 500.0

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.environ
        return cls(
            db=e.get("AFFERENT_DB") or cls.db,
            bedside=e.get("AFFERENT_BEDSIDE") or cls.bedside,
            sim_pulse=e.get("AFFERENT_SIM_PULSE", "0") == "1",
            sim_speed=float(e.get("AFFERENT_SIM_SPEED") or cls.sim_speed),
            seed=int(e.get("AFFERENT_SEED") or cls.seed),
            validation=e.get("AFFERENT_VALIDATION", "1") != "0",
            validation_seeds=int(e.get("AFFERENT_VALIDATION_SEEDS") or cls.validation_seeds),
            bound_patient=e.get("AFFERENT_BEDSIDE_PATIENT") or cls.bound_patient,
            team_fhir=e.get("AFFERENT_TEAM_FHIR", "1") != "0",
            team_fhir_vitals=e.get("AFFERENT_TEAM_FHIR_VITALS", "0") == "1",
            team_report=e.get("AFFERENT_TEAM_REPORT", "0") == "1",
            team_ask_url=e.get("AFFERENT_TEAM_ASK_URL") or cls.team_ask_url,
            team_guard=e.get("AFFERENT_TEAM_GUARD", "0") == "1",
            data_manager_url=e.get("AFFERENT_DATA_MANAGER_URL") or cls.data_manager_url,
            data_manager_token=e.get("AFFERENT_DATA_MANAGER_TOKEN") or None,
            transcripts_dir=e.get("AFFERENT_TRANSCRIPTS_DIR") or cls.transcripts_dir,
            transcript_file_mb=float(e.get("AFFERENT_TRANSCRIPT_FILE_MB") or cls.transcript_file_mb),
            transcript_total_mb=float(e.get("AFFERENT_TRANSCRIPT_TOTAL_MB") or cls.transcript_total_mb),
        )
