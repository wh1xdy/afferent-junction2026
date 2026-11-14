"""The node tests for the clinic pages and the phone's QR codec, run as part of the hub suite.

They load the real web files (hub/afferent_hub/web/clinic, demo/js/qrpayload.js) and exit non-zero
on the first failed check. Skipped when node is not installed.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SUITES = ["hub/tests/clinic_signals.test.js", "hub/tests/clinic_imported_state.test.js",
          "demo/tests/qrpayload.test.js"]


@pytest.mark.parametrize("suite", SUITES)
def test_node_suite(suite):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")
    r = subprocess.run([node, str(ROOT / suite)], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, f"{suite} failed:\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}"
