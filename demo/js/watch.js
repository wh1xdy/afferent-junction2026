// A watch or chest strap as a pulse source, over the standard Bluetooth Heart Rate Service (180D / 2A37): a Garmin
// watch with "Broadcast heart rate" (or Virtual HR) on, a Polar or Wahoo strap, any other device that sends it.
// The patient picks one device by name in Settings, Sensors, "Heart rate from a watch or strap". The choice is kept on
// this phone and the plugin reconnects to that device, and only that one, whenever it is in range. Nothing is ever
// connected without that choice. The finger clips always come first (A.Sensors.pulse, physioFrame).
//
// Plugin AfferentWatch (ios/App/App/AfferentWatch.swift, android AfferentWatchPlugin.kt):
//   scan()               -> {state}  lists heart-rate devices nearby (event "device"); stops by itself after 30 s
//   stopScan()           -> {}
//   connect({id, name})  -> {state}  connects to that device and keeps reconnecting until disconnect()
//   disconnect()         -> {}       lets go of the device (and of Bluetooth when nothing else runs)
//   status()             -> {state, name, id, scanning}
//   event "state":   {state: 'off'|'unauthorized'|'unsupported'|'idle'|'connecting'|'connected', name, id, scanning}
//   event "device":  {id, name, rssi}           a heart-rate device seen by scan(); never the Afferent finger box
//   event "reading": {kind: 'hr', bpm, contact, energy_kj, rr_ms, t_ms}   one 2A37 notification, parsed in full
(() => {
  const S = A.Sensors, KEY = 'afferent.watch';
  // The finger box advertises the Heart Rate Service too; it is the box, not a watch (AfferentFinger connects to it).
  const BOX_NAMES = ['Afferent Finger', 'wendyos-uno-q'];
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} },
  };
  const valid = c => c && typeof c.id === 'string' && c.id && typeof c.name === 'string' ? { id: c.id, name: c.name, on: c.on !== false } : null;

  // ── which devices may be listed and connected (also tested without a phone) ─────────────────────────────────────
  // Listed: a heart-rate device with an id and a name, that is not the finger box. A device without a name cannot be
  // told apart from a neighbour's, so it is not offered.
  const pickable = d => !!d && typeof d.id === 'string' && !!d.id && typeof d.name === 'string' && !!d.name.trim() && !BOX_NAMES.includes(d.name.trim());
  // The list as shown: strongest signal first, then by name; the chosen device marked.
  const ranked = (devices, chosen) => [...devices].filter(pickable)
    .sort((a, b) => (Number.isFinite(b.rssi) ? b.rssi : -999) - (Number.isFinite(a.rssi) ? a.rssi : -999) || a.name.localeCompare(b.name))
    .map(d => ({ id: d.id, name: d.name.trim(), rssi: Number.isFinite(d.rssi) ? d.rssi : null, chosen: !!chosen && chosen.id === d.id }));
  // The only device the app connects to by itself: the one the patient chose, while it is switched on.
  const target = chosen => chosen && chosen.on ? { id: chosen.id, name: chosen.name } : null;
  const near = rssi => rssi == null ? '' : rssi >= -65 ? 'Close by' : rssi >= -80 ? 'In the room' : 'Further away';

  let chosen = valid(store.get());

  const Watch = A.Watch = {
    plugin: null, listeners: null, starting: null, devices: new Map(), scanning: false, link: { state: 'unavailable', name: null, id: null },
    BOX_NAMES, pickable, ranked, target, near,

    available() { return !!(this.plugin || (this.plugin = A.plug('AfferentWatch') ?? null)); },
    chosen() { return chosen ? { ...chosen } : null; },
    list() { return ranked(this.devices.values(), chosen); },

    async listen() {
      if (this.listeners) return true;
      if (!this.available()) return false;
      if (this.starting) return this.starting;
      this.starting = (async () => {
        const added = [];
        try {
          added.push(await this.plugin.addListener('state', d => this.onState(d)));
          added.push(await this.plugin.addListener('device', d => this.onDevice(d)));
          added.push(await this.plugin.addListener('reading', d => this.onReading(d)));
          this.listeners = added;
          return true;
        } catch (e) {
          for (const l of added) { try { l?.remove?.(); } catch {} }
          console.warn('watch: listeners failed', e);
          return false;
        } finally { this.starting = null; }
      })();
      return this.starting;
    },

    // Connect to the chosen device while it is switched on, let go otherwise. Called at start and after every change.
    async sync() {
      const t = target(chosen);
      S.enabled.watch = !!t;
      if (!this.available()) { this.onState({ state: 'unavailable' }); return; }
      try {
        if (t) {
          if (!(await this.listen())) return;
          const r = await this.plugin.connect({ id: t.id, name: t.name });
          if (r?.state) this.onState({ ...r, name: r.name ?? t.name, id: r.id ?? t.id });
        } else {
          if (this.listeners) await this.plugin.disconnect();
          this.onState({ state: 'off' });
        }
      } catch (e) {
        console.warn('watch: sync failed', e);
        this.onState({ state: 'unavailable' });
      }
    },

    // List nearby devices for the patient to choose from (Settings). The first call shows the Bluetooth prompt.
    async scan() {
      if (!this.available() || !(await this.listen())) return false;
      this.devices.clear();
      try { await this.plugin.scan(); this.scanning = true; } catch (e) { console.warn('watch: scan failed', e); this.scanning = false; }
      Watch.render();
      return this.scanning;
    },
    async stopScan() {
      this.scanning = false;
      try { if (this.listeners) await this.plugin.stopScan(); } catch {}
    },

    // The patient chose a device from the list: remembered, switched on, connected.
    async choose(d) {
      if (!pickable(d)) return false;
      chosen = { id: d.id, name: d.name.trim(), on: true };
      store.set(chosen);
      await this.stopScan();
      await this.sync();
      Watch.render();
      return true;
    },
    async setOn(on) {
      if (!chosen) return false;
      chosen = { ...chosen, on: !!on };
      store.set(chosen);
      await this.sync();
      Watch.render();
      return true;
    },
    async forget() {
      chosen = null;
      store.set(null);
      await this.sync();
      Watch.render();
    },

    onState(d) {
      const state = d?.state || 'unavailable';
      this.link = { state, name: d?.name ?? null, id: d?.id ?? null };
      if (typeof d?.scanning === 'boolean') this.scanning = d.scanning;
      // Readings count only from the chosen device while it is connected (sensors.js drops anything else).
      const mine = !!chosen && (!d?.id || d.id === chosen.id);
      S.setWatchLink(state === 'connected' && !mine ? 'connecting' : state, d?.name ?? chosen?.name ?? null);
      Watch.render();
    },
    onDevice(d) {
      if (!pickable(d)) return;
      this.devices.set(d.id, { id: d.id, name: d.name, rssi: Number.isFinite(d.rssi) ? d.rssi : null });
      Watch.render();
    },
    onReading(d) { if (d?.kind === 'hr') S.feedWatch(d); },

    // One line for Settings: what the watch does right now.
    stateText(at = null) {
      if (!this.available()) return 'Needs the Afferent app on a phone';
      if (!chosen) return 'Off. Choose a device below';
      if (!chosen.on) return `Off. ${chosen.name} is remembered`;
      const st = this.link.state;
      if (st === 'unauthorized') return 'Bluetooth is off for Afferent in Settings';
      if (st === 'unsupported') return 'No Bluetooth on this phone';
      if (st === 'off') return 'Bluetooth is off';
      if (st !== 'connected') return `Looking for ${chosen.name}`;
      const now = at ?? (typeof A.now === 'function' ? A.now() : 0);   // the clock (main.js) comes after this script
      const w = S.watchFrame(now), clips = S.fingerFrame(now)?.pulse_bpm != null;
      if (!w) return `${chosen.name} connected. Waiting for a pulse`;
      if (w.contact === false) return `${chosen.name} connected. Not on the skin`;
      if (w.pulse_bpm == null) return `${chosen.name} connected. Waiting for a steady pulse`;
      return `${chosen.name} · ${Math.round(w.pulse_bpm)} bpm${clips ? ' · the finger clips come first' : ''}`;
    },

    render() {},
  };

  // ── Settings, Sensors: "Heart rate from a watch or strap" ───────────────────────────────────────────────────────
  const $ = id => typeof document === 'undefined' ? null : document.getElementById(id);
  const ui = {};
  const show = (el, on) => { if (el) el.hidden = !on; };
  const listEl = item => {
    const b = document.createElement('button'), icon = document.createElement('span'), txt = document.createElement('span');
    const hl = document.createElement('span'), sup = document.createElement('span');
    b.type = 'button'; b.className = 'li state two'; b.dataset.watchId = item.id;
    icon.className = 'ms'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = item.chosen ? 'check' : 'devices';
    txt.className = 'txt'; hl.className = 'hl'; sup.className = 'sup';
    hl.textContent = item.name;
    sup.textContent = [item.chosen ? 'Chosen' : '', near(item.rssi)].filter(Boolean).join(' · ') || 'Heart rate device';
    txt.append(hl, sup); b.append(icon, txt);
    b.onclick = () => Watch.choose(item);
    return b;
  };
  let drawn = '';
  Watch.render = () => {
    if (!ui.sw) return;
    const c = chosen, items = Watch.list();
    ui.sw.checked = !!c?.on;
    ui.sw.disabled = !Watch.available();
    const text = Watch.stateText();
    if (ui.state.textContent !== text) ui.state.textContent = text;
    ui.chosen.textContent = Watch.scanning ? 'Looking for devices nearby…' : c ? c.name : 'None chosen';
    show(ui.forget, !!c);
    const key = JSON.stringify([Watch.scanning, items]);
    if (key === drawn) return;
    drawn = key;
    const open = Watch.scanning || (ui.list.dataset.open === '1');
    show(ui.list, open);
    if (!open) return;
    const rows = items.map(listEl);
    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 't-body-s muted watch-empty';
      p.textContent = Watch.scanning ? 'Looking… On a Garmin watch, turn on Broadcast heart rate first.' : 'Nothing found. On a Garmin watch, turn on Broadcast heart rate, then search again.';
      rows.push(p);
    }
    ui.list.replaceChildren(...rows);
  };

  const mount = () => {
    const body = $('settingsBody'), sensors = $('sensorsGroup');
    if (!body || !A.Shell?.group) return;
    const html = A.Shell.group({
      id: 'watchGroup', title: 'Heart rate from a watch or strap',
      hint: 'For a Garmin watch, turn on Broadcast heart rate (on some models: Virtual HR) on the watch. Polar and Wahoo chest straps send it by themselves. Afferent connects only to the device you choose here, and the finger clips come first when both give a pulse.',
      rows: [
        { icon: 'devices', label: 'Use a watch or strap', sup: '', supId: 'watchState', sw: 'id="watchSw"' },
        { icon: 'search', label: 'Choose a device', sup: '', supId: 'watchChosen', attrs: 'id="watchPickBtn"', chevron: true },
        { html: '<div id="watchList" class="watch-list" hidden></div>' },
        { icon: 'close', label: 'Forget this device', attrs: 'id="watchForgetBtn"' },
      ],
    });
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    sensors ? sensors.after(t.content) : body.prepend(t.content);
    Object.assign(ui, { sw: $('watchSw'), state: $('watchState'), chosen: $('watchChosen'), pick: $('watchPickBtn'), list: $('watchList'), forget: $('watchForgetBtn') });
    const info = $('watchGroup')?.querySelector('[data-hint]');   // shell.js wired its own hints before this group existed
    if (info) info.onclick = () => A.Shell?.toast?.(info.getAttribute('aria-label'));
    ui.sw.onchange = () => {
      if (chosen) { Watch.setOn(ui.sw.checked); return; }
      ui.sw.checked = false;                     // nothing chosen yet: switching on opens the list
      ui.list.dataset.open = '1'; drawn = ''; Watch.scan();
    };
    ui.pick.onclick = () => {
      if (Watch.scanning) { Watch.stopScan(); ui.list.dataset.open = '0'; drawn = ''; Watch.render(); return; }
      ui.list.dataset.open = '1'; drawn = ''; Watch.scan();
    };
    ui.forget.onclick = () => { ui.list.dataset.open = '0'; drawn = ''; Watch.forget(); };
    // The Sensors line on the Settings list also says whether the watch is connected.
    const summary = A.Shell.settings?.summary, base = summary?.sensors;
    if (summary && base) summary.sensors = () => [base(), chosen?.on ? (Watch.link.state === 'connected' ? 'Watch connected' : 'Watch not connected') : ''].filter(Boolean).join(' · ');
    A.Shell.settings?.hook?.(() => Watch.render());
    Watch.render();
  };

  if (typeof document !== 'undefined' && document.getElementById) mount();
  if (typeof addEventListener === 'function') addEventListener('load', () => { if (chosen) Watch.sync(); });
})();
