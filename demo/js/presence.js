// Home and visitors: Vlad's Jetson presence service (jetson/presence), moved onto the phone.
//
// Off by default; the patient turns it on in Settings. Runs only while the app is open (iOS
// stops unfiltered Bluetooth scans in the background), and every 30 s feeds the ported
// decision logic (presence-core.js) with what the phone can see:
//   ble   the bedside unit ("Afferent Finger", UNO Q) in Bluetooth range: Vlad's "patient token"
//         turned around, the phone sees the home instead of the home seeing the phone
//   wifi  this Wi-Fi is home: the home devices (TV, speakers, printer) that answer on it,
//         stored as hashes. Stands in for Vlad's ARP probe; iOS gives a free-team app no
//         SSID, no ARP table and no Wi-Fi scan
//   hub   the Afferent hub answers on the local network (seen only; silence proves nothing)
// Other phones' Bluetooth adverts go to the guest tracker, as on the Jetson.
//
// Output: `context.home` and `context.visitors_present` of the session document (session.v3,
// fields that were always null), via A.Presence.sessionContext(). Nothing else leaves the
// phone. Sources: the AfferentPresence native plugin (iOS, Android), or with ?presence=sim a
// simulator whose every value is labelled SIMULATED.
(() => {
  const P = A.PresenceCore;
  const q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const KEY = 'afferent.presence', TICKS = 'afferent.presence.ticks', MAX_TICKS = 720;
  const UNIT_NAME = 'Afferent Finger', UNIT_SERVICE = '0000aff0';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const nowS = () => Date.now() / 1000;

  const cap = window.Capacitor;
  const native = !!cap?.isNativePlatform?.();   // iOS and Android: the same AfferentPresence plugin
  const PHONE = cap?.getPlatform?.() === 'ios' ? 'iPhone' : 'phone';   // wording only
  const sim = !native && q.get('presence') === 'sim';
  // The native bridge has no registerPlugin unless @capacitor/core is bundled (this app loads plain
  // scripts); a plugin registered in Swift or Kotlin is at Capacitor.Plugins.<jsName>. Same lookup as A.plug.
  const plugin = native ? (cap.Plugins?.AfferentPresence ?? cap.registerPlugin?.('AfferentPresence') ?? null) : null;
  const available = !!plugin || sim;

  // ── state ─────────────────────────────────────────────────────────────
  const saved = store.get(KEY) || {};
  const st = {
    on: !!saved.on && available,
    profile: P.PROFILES[saved.profile] ? saved.profile : 'home',
    calibratedAt: saved.calibratedAt ?? null,
    unitKnown: !!saved.unitKnown,
    unitIds: saved.unitIds || [],
    wifiLearned: saved.wifiLearned || [],
  };
  const pcfg = P.presenceConfig({ max_tick_gap_s: Math.max(180, P.SCAN_INTERVAL_S * 6) }), gcfg = P.guestConfig();
  P.applyProfile(st.profile, pcfg, gcfg);
  let presence, guests;
  const fresh = () => {
    presence = new P.PresenceTracker(pcfg);
    guests = new P.GuestTracker(gcfg, st.unitIds);
  };
  fresh();
  if (st.on && saved.presence) { presence.load(saved.presence); guests.load(saved.guests || {}); }

  let running = false, timer = 0, lastTickAt = 0, hiddenAt = null;
  let unitAt = null, radio = null, lastEvents = [], stretchStart = null, awayDecidedAt = null;
  let ticks = store.get(TICKS) || [];

  const save = () => store.set(KEY, {
    on: st.on, profile: st.profile, calibratedAt: st.calibratedAt, unitKnown: st.unitKnown, unitIds: st.unitIds,
    wifiLearned: st.wifiLearned, presence: presence.to_dict(), guests: guests.to_dict(),
  });

  // The hub's privacy object can switch this off (`phone_presence`), never on: the radios only
  // run after the patient turned them on here.
  const vetoed = () => A.config?.sensors?.phone_presence === false;
  const active = () => st.on && !vetoed();

  // ── sources ───────────────────────────────────────────────────────────
  const simWorld = { unit: true, guests: 0, n: 0 };   // drive from the console: A.Presence.sim.guests = 2
  const pull = async () => {
    if (sim) {
      const t = nowS(), rot = Math.floor(t / 900), devices = [];
      if (simWorld.unit) devices.push({ id: 'sim-unit', name: UNIT_NAME, uuids: ['180D'], mfg: null, first: t, last: t, rssi: [-60] });
      for (let i = 0; i < simWorld.guests; i++) devices.push({ id: `sim-guest-${i}-${rot}`, name: null, uuids: [], mfg: '4c00100501', first: t, last: t, rssi: [-52] });
      return { devices, status: { bluetooth: 'poweredOn', authorization: 'allowedAlways', scanning: true, wifi: false, lan: 'off', lanDevices: [] } };
    }
    return plugin.drain();
  };

  const isUnit = d => d.name === UNIT_NAME || (d.uuids || []).some(u => P.uuidPrefix(u) === UNIT_SERVICE);

  // Native batches every advert since the last drain per device: first/last time and the last
  // RSSI values (core.py smooths per advert; the batch keeps up to 20 of them in order).
  const toAdverts = devices => {
    const ads = [];
    for (const d of devices) {
      const id = String(d.id).toLowerCase();
      if (isUnit(d)) {
        unitAt = Math.max(unitAt ?? 0, d.last);
        if (!st.unitKnown || !st.unitIds.includes(id)) {
          st.unitKnown = true;
          st.unitIds = [...new Set([...st.unitIds, id])].slice(-4);
          st.unitIds.forEach(u => guests.ignore.add(u));
        }
        continue;
      }
      const [company, kind] = P.classify(P.manufacturerFromHex(d.mfg), d.uuids || []);
      const rs = (d.rssi || []).filter(Number.isFinite);
      rs.forEach((rssi, i) => ads.push({ addr: id, rssi, ts: i === 0 ? d.first : d.last, name: d.name ?? null, company, kind }));
    }
    return ads;
  };

  // ── one scan interval (app.py tick) ───────────────────────────────────
  const tick = async () => {
    if (!running || document.hidden) return;
    let data;
    try { data = await pull(); } catch (e) { radio = { error: String(e?.message || e) }; render(); return; }
    if (!running) return;
    const now = nowS();
    radio = data.status || {};
    const ads = toAdverts(data.devices || []);
    // A connected finger sensor is the bedside unit in range, also while it sends nothing (the
    // firmware on the board today notifies only with a finger on the clip) and no longer advertises.
    if (A.Sensors?.fingerLink?.state === 'connected') unitSeen();
    const btOk = radio.bluetooth === 'poweredOn' && !!radio.scanning;
    const sig = {
      wifi: P.wifiSighting({ learned: st.wifiLearned, visible: radio.lanDevices, onWifi: !!radio.wifi, browse: radio.lan }),
      ble: P.bleSighting({ known: st.unitKnown, ok: btOk, lastAt: unitAt, now }),
      hub: P.hubSighting({ connected: !!A.Hub?.connected, url: A.Hub?.url }),
    };
    const events = [];
    if (presence.last_tick !== null && now - presence.last_tick > pcfg.max_tick_gap_s) {
      events.push(...guests.close_for_gap(presence.last_tick));  // nobody watched in between
      stretchStart = now;
    }
    if (stretchStart === null) stretchStart = now;
    events.push(...P.tick(presence, guests, now, sig, ads));
    if (events.includes('left_home')) awayDecidedAt = now;
    if (events.includes('calibrated')) st.calibratedAt = now;
    if (events.length) lastEvents = events;
    lastTickAt = now;
    ticks.push(P.tickRow(now, presence.state, sig, ads.length, guests.current, events));
    if (ticks.length > MAX_TICKS) ticks = ticks.slice(-MAX_TICKS);
    store.set(TICKS, ticks);
    save();
    render();
    A.bus.emit('presence', { state: presence.state, guests: guests.current, events });
  };

  const schedule = (ms = P.SCAN_INTERVAL_S * 1000) => {
    clearTimeout(timer);
    timer = setTimeout(async () => { await tick(); if (running) schedule(); }, ms);
  };

  const start = async () => {
    if (running || !active()) return;
    running = true;
    try { if (plugin) radio = await plugin.start({ lan: true }); }
    catch (e) { radio = { error: String(e?.message || e) }; }
    render();
    schedule(8000);  // give the radios a few seconds to hear the room first
  };

  const stop = async () => {
    running = false;
    clearTimeout(timer);
    try { await plugin?.stop(); } catch {}
    radio = null;
    render();
  };

  // Closed or locked: nothing is watched, so that time must count neither as absence nor as
  // monitored time (core.py: "don't pretend we watched the door").
  document.addEventListener('visibilitychange', () => {
    if (!running) return;
    if (document.hidden) { hiddenAt = nowS(); clearTimeout(timer); return; }
    const away = hiddenAt === null ? 0 : nowS() - hiddenAt;
    hiddenAt = null;
    if (presence.last_tick !== null) {
      const lastObserved = presence.last_tick;
      presence.last_tick = null;
      if (away > pcfg.max_tick_gap_s) {
        const ev = guests.close_for_gap(lastObserved);
        if (ev.length) lastEvents = ev;
        stretchStart = null;
      }
    }
    schedule(8000);
  });

  // ── actions ───────────────────────────────────────────────────────────
  const enable = async () => {
    if (!available) return;
    st.on = true; save(); render();
    await start();
  };
  // Off forgets everything it learned: outings, visits, calibration, the home Wi-Fi.
  const disable = async () => {
    await stop();
    st.on = false; st.calibratedAt = null; st.unitKnown = false; st.unitIds = []; st.wifiLearned = [];
    fresh(); unitAt = null; stretchStart = null; awayDecidedAt = null; lastEvents = []; ticks = [];
    store.del(TICKS); store.del(KEY);
    render();
  };
  const calibrate = () => {
    if (!running) return A.Shell?.toast?.('Turn on Home and visitors first.');
    guests.start_calibration(nowS(), P.PROFILES[st.profile].calibrate_min * 60);
    st.calibratedAt = null; save(); render();
  };
  const rememberWifi = () => {
    const vis = radio?.lanDevices || [];
    if (!radio?.wifi) return A.Shell?.toast?.('Join your home Wi-Fi first.');
    if (radio.lan === 'denied') return A.Shell?.toast?.(`Local Network is off for Afferent in ${PHONE} Settings.`);
    if (!vis.length) return A.Shell?.toast?.('No TV, speaker or printer answered on this Wi-Fi yet. Try again in a minute.');
    st.wifiLearned = [...vis]; save(); render();
    A.Shell?.toast?.(`Home Wi-Fi saved (${vis.length} home device${vis.length === 1 ? '' : 's'}).`);
  };
  // app.py POST /profile: a baseline learned at another range is meaningless, so it resets.
  const setProfile = name => {
    if (!P.PROFILES[name]) return;
    st.profile = name;
    P.applyProfile(name, pcfg, gcfg);
    guests.baseline = 0; guests.household = new Set(); st.calibratedAt = null;
    save(); render();
  };
  const activity = () => { if (running) presence.activity(nowS()); };
  // For the finger plugin: a live notification from the bedside unit proves it is in range.
  // Whether the unit keeps advertising while a phone is connected is untested (BlueZ may stop),
  // so a connected unit must report here or presence could see it vanish.
  const unitSeen = () => { if (running) { unitAt = nowS(); st.unitKnown = true; } };

  const sessionContext = () => {
    if (!active() || !running || stretchStart === null) return { home: null, visitors_present: null, simulated: false };
    const c = P.sessionContext(presence, guests, nowS(), { stretchStart, awayDecidedAt, calibrated: st.calibratedAt !== null });
    return { ...c, simulated: sim && (c.home !== null || c.visitors_present !== null) };
  };

  // ── settings UI ───────────────────────────────────────────────────────
  const statusText = () => {
    if (!available) return `Needs the ${PHONE} app`;
    if (!st.on) return 'Off';
    if (vetoed()) return 'Paused by your privacy settings';
    const pre = sim ? 'SIMULATED · ' : '';
    if (radio?.error) return pre + 'Not working: ' + radio.error;
    if (radio?.authorization === 'denied' || radio?.authorization === 'restricted') return `Bluetooth not allowed (${PHONE} Settings › Afferent)`;
    if (radio?.bluetooth === 'poweredOff') return 'Bluetooth is off';
    if (!lastTickAt) return pre + 'Looking around…';
    const why = { ble: 'bedside unit nearby', wifi: 'home Wi-Fi', hub: 'hub', activity: 'bedside unit used' };
    const recent = Object.keys(presence.last_seen_by).filter(k => presence.last_seen_by[k] >= lastTickAt - 1).map(k => why[k] || k);
    let s = presence.state === P.HOME ? 'Home' + (recent.length ? ' · ' + recent.join(', ') : '')
      : presence.state === P.AWAY ? 'Away'
      : st.unitKnown || st.wifiLearned.length ? 'Not sure yet' : 'Not sure yet · bedside unit not found';
    if (guests.calibrating()) s += ' · learning';
    else if (guests.current > 0) s += ` · ${guests.current} visitor${guests.current === 1 ? '' : 's'}`;
    return pre + s;
  };

  const ui = {};
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
  const render = () => {
    if (!ui.sw) return;
    ui.sw.checked = st.on;
    ui.sw.disabled = !available;
    ui.state.textContent = statusText();
    const extra = st.on && available;
    show(ui.wifiRow, extra && native);
    show(ui.calRow, extra);
    ui.wifi.textContent = st.wifiLearned.length ? `${st.wifiLearned.length} home device${st.wifiLearned.length === 1 ? '' : 's'} remembered` : 'Tap while you are at home';
    const cal = guests.calibrating() ? guests._cal : null;
    ui.cal.textContent = cal ? `Learning, ${Math.max(1, Math.ceil((cal.until - nowS()) / 60))} min left. Keep Afferent open`
      : st.calibratedAt ? `Learned ${new Date(st.calibratedAt * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      : `Keep Afferent open ${P.PROFILES[st.profile].calibrate_min} min, nobody extra nearby`;
    if (ui.profileVal) ui.profileVal.textContent = st.profile;
    if (ui.nearby) {
      const rows = guests.nearby_devices(nowS(), 50);
      ui.nearby.textContent = running ? `${rows.filter(r => r.counted).length} counted of ${rows.length} heard · baseline ${guests.baseline}` : '-';
    }
  };

  const mount = () => {
    const body = $('settingsBody'), sensors = body?.querySelector('.set-group');
    if (!body || !A.Shell?.group) return;
    const html = A.Shell.group({
      id: 'presenceGroup', title: 'Home and visitors',
      hint: 'Off unless you turn it on, and only while Afferent is open. Your phone looks for your bedside unit, your home Wi-Fi and other phones nearby. Only whether you are home and how many visitors go with your session; nobody is identified. Turning it off deletes what it learned.',
      rows: [
        { icon: 'sensors', label: 'Bluetooth and Wi-Fi', sup: '', supId: 'presenceState', sw: 'id="presenceSw"' },
        { icon: 'wifi', label: 'This Wi-Fi is home', sup: '', supId: 'presenceWifi', attrs: 'id="presenceWifiBtn"' },
        { icon: 'group', label: 'Learn who is usually around', sup: '', supId: 'presenceCal', attrs: 'id="presenceCalBtn"' },
      ],
    });
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    sensors ? sensors.after(t.content) : body.prepend(t.content);
    const devGroup = $('devGroup')?.querySelector('.group');
    if (devGroup && A.Shell.row) {
      devGroup.insertAdjacentHTML('beforeend', [
        A.Shell.row({ icon: 'tune', label: 'Presence tuning', val: '', attrs: 'id="presenceProfileBtn"' }),
        A.Shell.row({ icon: 'devices', label: 'Presence: nearby devices', sup: '-', supId: 'presenceNearby', static: true }),
        A.Shell.row({ icon: 'file_save', label: 'Copy presence log', sup: 'ticks.jsonl for tools/score.py', attrs: 'id="presenceLogBtn"' }),
      ].join(''));
    }
    Object.assign(ui, {
      sw: $('presenceSw'), state: $('presenceState'), wifi: $('presenceWifi'), cal: $('presenceCal'),
      wifiRow: $('presenceWifiBtn'), calRow: $('presenceCalBtn'), nearby: $('presenceNearby'),
      profileVal: $('presenceProfileBtn')?.querySelector('.val'),
    });
    ui.sw.onchange = () => (ui.sw.checked ? enable() : disable());
    ui.wifiRow.onclick = rememberWifi;
    ui.calRow.onclick = calibrate;
    const names = Object.keys(P.PROFILES);
    $('presenceProfileBtn')?.addEventListener('click', () => setProfile(names[(names.indexOf(st.profile) + 1) % names.length]));
    $('presenceLogBtn')?.addEventListener('click', async () => {
      const text = ticks.map(r => JSON.stringify(r)).join('\n') + (ticks.length ? '\n' : '');
      try { await navigator.clipboard.writeText(text); A.Shell?.toast?.(`${ticks.length} presence ticks copied.`); }
      catch { A.Shell?.toast?.('Copy failed.'); }
    });
    if (!available) ui.sw.closest('.li')?.style.setProperty('opacity', '0.6');
    render();
  };

  // A privacy change from the hub may switch it off (or allow it again).
  const sync = () => { if (active()) start(); else if (running) stop(); render(); };
  A.bus.on('hubConfig', () => setTimeout(sync, 0));
  A.Hub?.on?.('privacy', () => setTimeout(sync, 0));

  mount();
  if (st.on) addEventListener('load', sync);  // after main.js has set A.config (privacy switches)

  A.Presence = {
    available, native, sim: sim ? simWorld : null,
    get on() { return st.on; },
    enable, disable, calibrate, rememberWifi, setProfile, activity, unitSeen, sessionContext,
    status: () => ({ on: st.on, running, profile: st.profile, radio, events: lastEvents, presence: presence.status(nowS()), guests: { ...guests.status(nowS()), nearby_devices: guests.nearby_devices(nowS()) } }),
    ticksJsonl: () => ticks.map(r => JSON.stringify(r)).join('\n'),
  };
})();
