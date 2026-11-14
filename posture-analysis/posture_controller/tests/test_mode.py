import controller


def _job():
    return {
        "id": "test-job",
        "kind": "transcription",
        "state": "running",
        "step": "starting",
        "started": "now",
        "finished": None,
        "log": [],
        "result": None,
    }


def _stub_transitions(monkeypatch, calls):
    monkeypatch.setattr(controller, "_wendy",
                        lambda *args: calls.append(("wendy", *args)))
    monkeypatch.setattr(
        controller, "_wait_app_state",
        lambda name, running, timeout=300:
        calls.append(("wait", name, running)))
    monkeypatch.setattr(
        controller, "_wait_analyzer_health",
        lambda job, timeout=300: calls.append(("health",)))
    monkeypatch.setattr(
        controller, "_wait_model_ready",
        lambda job, timeout=3600: calls.append(("model_ready",)))
    monkeypatch.setattr(
        controller, "_analyzer_json",
        lambda path, method="GET", body=None:
        (200, {"inbox": {"enabled": False}}))


def test_transcription_job_happy_path_order(monkeypatch):
    calls = []
    _stub_transitions(monkeypatch, calls)
    monkeypatch.setattr(
        controller, "_run_batch",
        lambda job, rescore: calls.append(("batch", rescore)) or {
            "last_result": {"windows_scored": 2, "errors": 0},
            "last_error": None,
        })

    job = _job()
    controller._transcription_job(job, True, True, True)

    assert calls == [
        ("wendy", "device", "apps", "stop", controller.POSTURE_APP),
        ("wait", controller.POSTURE_APP, False),
        ("wendy", "device", "apps", "start", controller.ANALYZER_APP,
         "--detach"),
        ("health",),
        ("model_ready",),
        ("batch", True),
        ("wendy", "device", "apps", "stop", controller.ANALYZER_APP),
        ("wait", controller.ANALYZER_APP, False),
        ("wendy", "device", "apps", "start", controller.POSTURE_APP,
         "--detach"),
        ("wait", controller.POSTURE_APP, True),
    ]
    assert job["state"] == "done"
    assert job["result"]["last_result"]["last_result"]["windows_scored"] == 2
    assert job["finished"] is not None
    assert job["log"]


def test_analyze_409_restores_posture(monkeypatch):
    calls = []
    _stub_transitions(monkeypatch, calls)
    def analyzer_json(path, method="GET", body=None):
        if path == "/status":
            return 200, {"inbox": {"enabled": False}}
        return 409, {"detail": "only 1 GB free, need 999"}

    monkeypatch.setattr(controller, "_analyzer_json", analyzer_json)

    job = _job()
    controller._transcription_job(job, True, False, True)

    assert job["state"] == "error"
    assert "analyze rejected (409)" in job["result"]["last_error"]
    assert any("only 1 GB free" in row["message"] for row in job["log"])
    assert ("wendy", "device", "apps", "stop", controller.ANALYZER_APP) in calls
    assert ("wendy", "device", "apps", "start", controller.POSTURE_APP,
            "--detach") in calls


def test_inbox_flow_finishes_without_posting_analyze(monkeypatch):
    calls = []
    requests = []
    _stub_transitions(monkeypatch, calls)
    inbox = {
        "enabled": True, "state": "done", "detail": "inbox batch finished",
        "claimed": 2, "deleted": 2, "failed": 0, "finished_at": "now",
    }

    def analyzer_json(path, method="GET", body=None):
        requests.append((path, method))
        if path == "/status":
            return 200, {"inbox": inbox}
        raise AssertionError(f"unexpected analyzer request: {path}")

    monkeypatch.setattr(controller, "_analyzer_json", analyzer_json)
    monkeypatch.setattr(
        controller, "_run_batch",
        lambda *args: (_ for _ in ()).throw(
            AssertionError("inbox flow must not POST /analyze")))

    job = _job()
    controller._transcription_job(job, True, False, False)

    assert requests == [("/status", "GET")]
    assert job["state"] == "done"
    assert job["result"]["last_result"] == inbox
    assert any("inbox state=done" in row["message"] for row in job["log"])


def test_midway_failure_still_restores_posture(monkeypatch):
    calls = []
    _stub_transitions(monkeypatch, calls)

    def fail_health(job, timeout=300):
        raise RuntimeError("health probe failed")

    monkeypatch.setattr(controller, "_wait_analyzer_health", fail_health)
    job = _job()
    controller._transcription_job(job, True, False, True)

    assert job["state"] == "error"
    assert job["result"]["last_error"] == "health probe failed"
    assert ("wendy", "device", "apps", "stop", controller.ANALYZER_APP) in calls
    assert ("wendy", "device", "apps", "start", controller.POSTURE_APP,
            "--detach") in calls
