import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from probes import LIVE_STATES, parse_default_route, parse_neigh  # noqa: E402

NEIGH = """\
192.168.1.1 dev wlan0 lladdr 3c:84:6a:00:00:01 router REACHABLE
192.168.1.23 dev wlan0 lladdr AA:BB:CC:DD:EE:FF STALE
192.168.1.40 dev wlan0 lladdr 11:22:33:44:55:66 DELAY
192.168.1.77 dev wlan0 FAILED
192.168.1.90 dev wlan0 INCOMPLETE
"""

ROUTE = """\
Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT
wlan0\t00000000\t0101A8C0\t0003\t0\t0\t600\t00000000\t0\t0\t0
wlan0\t0001A8C0\t00000000\t0001\t0\t0\t600\t00FFFFFF\t0\t0\t0
"""


class Parse(unittest.TestCase):
    def test_neigh(self):
        n = {e["ip"]: e for e in parse_neigh(NEIGH)}
        self.assertEqual(n["192.168.1.1"]["state"], "REACHABLE")
        self.assertEqual(n["192.168.1.23"]["mac"], "aa:bb:cc:dd:ee:ff")
        self.assertNotIn(n["192.168.1.23"]["state"], LIVE_STATES)  # stale = not proof
        self.assertIn(n["192.168.1.40"]["state"], LIVE_STATES)
        self.assertIsNone(n["192.168.1.77"]["mac"])

    def test_default_route(self):
        self.assertEqual(parse_default_route(ROUTE), ("wlan0", "192.168.1.1"))


if __name__ == "__main__":
    unittest.main()
