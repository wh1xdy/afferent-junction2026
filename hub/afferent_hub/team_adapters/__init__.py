from .. import summary
from ..settings import Settings
from .alex import guard_check
from .data_manager import SensorSource

class Team:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.sensors = SensorSource(settings.data_manager_url, settings.data_manager_token)
        summary.checks[:] = [guard_check] if settings.team_guard else []

    def close(self):
        self.sensors.close()
        summary.checks.clear()

    def status(self) -> dict:
        s, dm = self.settings, self.sensors.enabled
        rows = [
            ("fhir", s.team_fhir, "AFFERENT_TEAM_FHIR", "alex_hub/fhir.py"),
            ("fhir_vitals", s.team_fhir and s.team_fhir_vitals and dm, "AFFERENT_TEAM_FHIR_VITALS",
             "alex_hub/fhir.py + data_manager"),
            ("clinician_report", s.team_report, "AFFERENT_TEAM_REPORT", "alex_hub/report.py"),
            ("ask", bool(s.team_ask_url), "AFFERENT_TEAM_ASK_URL", "alex_hub/grounding.py"),
            ("summary_guard", s.team_guard, "AFFERENT_TEAM_GUARD", "alex_hub/grounding.py"),
            ("sensors", dm, "AFFERENT_DATA_MANAGER_URL", "data_manager"),
        ]
        return {"modules": [{"module": m, "enabled": bool(on), "setting": env, "source": src}
                            for m, on, env, src in rows]}
