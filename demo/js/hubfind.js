// Settings › Home hub › Find on this Wi-Fi. The home hub's LAN door on the Jetson (jetson/home_hub/door) announces
// the hub with Bonjour (_afferent-hub._tcp); the iPhone app asks its own plugin (ios/App/App/AfferentHubFinder.swift)
// what answers on this Wi-Fi and gets an IPv4 address and a port back. The advert never carries the hub's key, so
// the key the phone already has (the /k/<code> part of the address) is kept: a phone paired through the Mac bridge
// moves to the direct address without pasting anything. Without a key the address still needs one pasted.
// Only on a phone with the plugin (not Android yet, not the browser demo): elsewhere the button stays hidden.
(() => {
  const PLUGIN = 'AfferentHubFinder';
  const plugin = () => {
    const C = window.Capacitor;
    if (!C?.isNativePlatform?.()) return null;
    if (typeof C.isPluginAvailable === 'function' && !C.isPluginAvailable(PLUGIN)) return null;
    return C.Plugins?.[PLUGIN] || null;
  };
  const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

  // the /k/<code> part of an address, '' without one
  const keyOf = addr => (String(addr || '').match(/\/k\/[^/?#\s]+/) || [''])[0];
  // the host of an address as typed or saved: '10.0.32.31:8800/k/…', 'http://10.0.33.66:8000/k/…'
  const hostOf = addr => (String(addr || '').trim().match(/^(?:[a-z]+:\/\/)?([^/:?#\s]+)/i) || [])[1] || '';
  const withKey = (hub, current) => `${hub.host}:${hub.port}${keyOf(current) || '/k/'}`;
  // the hub the phone already knows when it is among those found, else the first
  const pick = (hubs, current) => hubs.find(h => h.host === hostOf(current)) || hubs[0] || null;
  const valid = h => !!h && IPV4.test(String(h.host)) && Number.isInteger(h.port) && h.port > 0 && h.port < 65536;

  const SAY = {
    keyed: 'Found the hub on this Wi-Fi. Tap Connect.',
    unkeyed: 'Found the hub. Paste its address with the key from the hub.',
    none: 'No hub found on this Wi-Fi. Some networks keep devices apart: paste the address instead.',
    denied: 'Afferent may not look on this Wi-Fi. Turn on Local Network for Afferent in iPhone Settings, Privacy.',
    failed: 'Could not look on this Wi-Fi. Paste the address instead.',
  };

  A.HubFind = {
    SAY, keyOf, hostOf, withKey, pick,
    available: () => !!plugin(),
    // {state: 'found' | 'none' | 'denied' | 'failed' | 'unavailable', address, keyed, hubs, say}
    async find(current, timeoutMs = 4000) {
      const p = plugin();
      if (!p) return { state: 'unavailable', address: null, keyed: false, hubs: [], say: SAY.failed };
      let r;
      try { r = await p.find({ timeoutMs }); } catch { r = { state: 'failed', hubs: [] }; }
      const hubs = (Array.isArray(r?.hubs) ? r.hubs : []).filter(valid);
      const hub = pick(hubs, current);
      if (hub) {
        const keyed = !!keyOf(current);
        return { state: 'found', address: withKey(hub, current), keyed, hubs, say: keyed ? SAY.keyed : SAY.unkeyed };
      }
      const state = r?.state === 'denied' ? 'denied' : r?.state === 'failed' ? 'failed' : 'none';
      return { state, address: null, keyed: false, hubs, say: SAY[state] };
    },
  };
})();
