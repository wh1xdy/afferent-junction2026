// Afferent Live: reads the sanitized snapshot of the demo table and shows it.
// Where the data comes from: endpoint.json next to this page. On the published site it names the tunnel to the
// server on the demo Mac ({"live": "https://….trycloudflare.com", "sse": false}); served by live/server.py itself it
// says the same origin ({"live": ""}). Server-Sent Events when the endpoint allows them, else /live.json every 2 s
// (every second while a pulse is live, so the heart keeps in step). The page only ever reads.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const TZ = 'Europe/Helsinki';
  const OK_BASE = /^(https:\/\/[a-z0-9-]+\.trycloudflare\.com|http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?)$/;
  const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const put = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  const attr = (el, k, v) => { if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); };

  // ── times, in Espoo ─────────────────────────────────────────────────────
  const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
  const at = iso => { const t = iso ? new Date(iso) : null; return t && !isNaN(t) ? t : null; };
  const clock = iso => { const t = at(iso); return t ? hm.format(t) : null; };
  const when = iso => {
    const t = at(iso);
    if (!t) return null;
    const d = day.format(t), today = day.format(new Date()), yest = day.format(new Date(Date.now() - 864e5));
    return d === today ? `today ${hm.format(t)}` : d === yest ? `yesterday ${hm.format(t)}` : `${d}, ${hm.format(t)}`;
  };

  // ── the heart: beats on the beats the box saw ───────────────────────────
  // A real beat comes at most once a second (the server reads the box once a second, and only its newest beat is
  // there). Between two real beats the heart keeps the live rate from the last one; each real beat sets it right
  // again, and without one for 4 beats it stops.
  const Heart = {
    bpm: null, anchor: null, lastReal: -1e9, lastFired: -1e9, timer: 0,
    setBpm(b) {
      this.bpm = b;
      if (!b) { clearTimeout(this.timer); this.anchor = null; return; }
      this.schedule();
    },
    real(ageMs) {
      const now = performance.now(), t = now - Math.max(0, ageMs || 0);
      this.lastReal = t;
      if (!this.bpm) return;
      const ibi = 60000 / this.bpm;
      if (Math.abs(this.lastFired - t) >= 0.35 * ibi && now - t < 0.35 * ibi) this.fire();
      this.anchor = t;
      this.schedule();
    },
    schedule() {
      clearTimeout(this.timer);
      if (!this.bpm || this.anchor == null) return;
      const ibi = 60000 / this.bpm, now = performance.now();
      if (now - this.lastReal > Math.max(4 * ibi, 4000)) return;
      let next = this.anchor + ibi;
      while (next < now - 40) next += ibi;
      this.timer = setTimeout(() => { this.fire(); this.anchor = next; this.schedule(); }, next - now);
    },
    fire() {
      this.lastFired = performance.now();
      if (still()) return;
      for (const el of [$('heart'), $('ring')]) {
        if (!el) continue;
        el.classList.remove('beat');
        void el.getBoundingClientRect();
        el.classList.add('beat');
      }
    },
  };

  // The pulse, said aloud at most every 15 s and only when it moved by 3 bpm or more, appeared or went.
  const Say = {
    said: null, at: 0,
    pulse(bpm) {
      const now = Date.now(), el = $('pulseSay');
      if (bpm == null) {
        if (this.said != null) { put(el, 'The pulse reading ended.'); this.said = null; this.at = now; }
        return;
      }
      if (this.said != null && (Math.abs(bpm - this.said) < 3 || now - this.at < 15000)) return;
      put(el, `Pulse at the table: ${bpm} beats per minute.`);
      this.said = bpm; this.at = now;
    },
  };

  // ── what each light means (demo/js/engine.js MODES and livevitals.js wording) ──
  const MODE = {
    calm: ['Calm', 'slower games that settle: the sauna'],
    flow: ['Flow', 'the usual mix of games: the forest'],
    wake: ['Wake', 'livelier games, brighter light: the lake'],
    fatigue: ['Tired', 'gentle wake-up games: the shore'],
    rest: ['Rest', 'winding down for sleep: the harbour'],
  };
  const lightText = l => {
    if (!l) return ['–', ''];
    const m = MODE[l.mode];
    switch (l.reason) {
      case 'mode': return [m ? `Game mode: ${m[0]}` : 'Game mode', m ? m[1] : ''];
      case 'dawn': return ['Dawn', ''];
      case 'asleep': return ['Off: asleep', ''];
      case 'knob': return ['Knob turned', ''];
      case 'camera': return ['Camera switched', ''];
      case 'idle': return [l.level > 0 ? 'No session: time of day' : 'No session: off',
        ''];
      default: return ['Set by the hub', ''];
    }
  };

  // ── rendering ───────────────────────────────────────────────────────────
  let last = null, lastSeq = null;
  const clipText = c => c.bpm != null ? `${c.bpm} bpm` : c.on ? 'finger on' : 'no finger';

  const render = s => {
    last = s;
    const box = !!s.box?.online, hub = !!s.hub?.online, p = s.pulse || {};
    const anyOn = (s.clips || []).some(c => c.on), live = p.bpm != null;
    // status and offline line
    const st = $('status');
    attr(st, 'data-state', box || hub ? 'live' : 'off');
    put($('statusText'), box || hub ? 'Live' : 'Offline');
    const seen = [s.box?.last_seen, s.hub?.last_seen].map(at).filter(Boolean).sort((a, b) => b - a)[0];
    offline(!box && !hub, seen ? hm.format(seen) : null);

    // finger clips
    const card = $('cardPulse');
    card.classList.toggle('live', live);
    card.classList.toggle('is-off', !box);
    put($('bpm'), live ? String(p.bpm) : '–');
    const tag = $('pulseTag');
    attr(tag, 'data-state', live ? 'live' : '');
    put(tag, !box ? 'offline' : live ? 'live' : p.two_people ? 'two hearts' : anyOn ? 'settling' : 'waiting');
    const from = (s.clips || []).map((c, i) => c.bpm != null ? i + 1 : null).filter(Boolean);
    put($('pulseNote'), !box ? 'Box offline'
      : p.two_people ? 'Two hearts'
      : live ? `Live, ${from.length === 2 ? 'both clips' : from.length ? `clip ${from[0]}` : 'the clips'}`
      : anyOn ? 'Settling…'
      : '');
    const lis = $('clips').children;
    (s.clips || []).forEach((c, i) => {
      const li = lis[i];
      if (!li) return;
      attr(li, 'data-on', String(!!c.on));
      put(li.querySelector('.clip-val'), box ? clipText(c) : '–');
    });
    const phys = p.hrv_ms != null || p.breaths_per_min != null;
    $('physio').hidden = !phys;
    if (phys) {
      put($('hrv'), p.hrv_ms != null ? `${p.hrv_ms} ms${p.hrv_own_ms ? ` (own ${p.hrv_own_ms})` : ''}` : '–');
      put($('breath'), p.breaths_per_min != null ? `${p.breaths_per_min} /min` : '–');
    }
    Heart.setBpm(live ? p.bpm : null);
    if (live && p.beat_age_ms != null && p.beat_seq !== lastSeq && Conn.polling) Heart.real(p.beat_age_ms + Conn.rtt / 2);
    lastSeq = p.beat_seq;
    Say.pulse(live ? p.bpm : null);

    // bedroom
    const room = s.room;
    document.querySelector('.room').classList.toggle('is-off', !room);
    put($('temp'), room ? room.celsius.toFixed(1) : '–');
    put($('hum'), room && room.humidity != null ? String(room.humidity) : '–');
    put($('roomTag'), room ? 'live' : box ? 'no reading' : 'offline');
    attr($('roomTag'), 'data-state', room ? 'live' : '');

    // bedside light
    const l = s.light, sw = $('swatch');
    document.querySelector('.light').classList.toggle('is-off', !l);
    sw.style.setProperty('--c', l ? l.rgb : '#000000');
    sw.style.setProperty('--k', l ? String(Math.max(0, Math.min(1, l.level / 60))) : '0');
    attr(sw, 'data-dark', String(!l || l.rgb === '#000000' || l.level === 0));
    const [what, why] = lightText(l);
    put($('lightWhat'), what);
    put($('lightWhy'), why);
    put($('lightTag'), !hub ? 'offline' : s.hub?.simulated ? 'simulated' : l ? `${l.level} %` : '–');
    attr($('lightTag'), 'data-state', s.hub?.simulated ? 'sim' : '');

    // home hub
    document.querySelector('.hub').classList.toggle('is-off', !hub);
    put($('hubTag'), hub ? 'online' : 'offline');
    attr($('hubTag'), 'data-state', hub ? 'live' : '');
    const se = s.session || {};
    put($('session'), !hub ? '–' : se.running ? (se.phase === 'dawn' ? 'running, at dawn' : `running, ${MODE[se.mode]?.[0].toLowerCase() || 'in play'}`) : 'none right now');
    put($('mornings'), s.patient ? String(s.patient.mornings) : '–');
    put($('lastMorning'), s.patient?.last_morning ? when(s.patient.last_morning) : '–');
    put($('inBed'), s.presence?.in_bed == null ? 'not measured' : s.presence.in_bed ? 'yes' : 'no');

    // the chain
    const chain = {
      clips: !box ? ['off', 'offline'] : anyOn ? ['live', live ? 'reading a pulse' : 'finger on'] : ['idle', 'waiting for a finger'],
      box: box ? ['live', s.box.sensors === 'on' ? 'online, sensors on' : 'online'] : ['off', 'offline'],
      phone: !hub ? ['off', 'not known'] : se.running ? ['live', 'in a session'] : ['idle', 'no session now'],
      hub: hub ? ['live', s.hub.box_linked ? 'online, linked to the box' : 'online'] : ['off', 'offline'],
      clinic: ['idle', 'by QR handover only'],
    };
    for (const li of $('chain').children) {
      const [state, text] = chain[li.dataset.k];
      attr(li, 'data-state', state);
      put(li.querySelector('.state'), text);
    }
    window.dispatchEvent(new CustomEvent('afferent:snapshot', { detail: s }));
  };

  const offline = (on, seen) => {
    const el = $('offline');
    el.hidden = !on;
    if (on) put(el, `The demo table is offline right now.${seen ? ` Last seen ${seen}.` : ''}`);
  };

  const unreachable = () => {
    attr($('status'), 'data-state', 'off');
    put($('statusText'), Conn.everOk ? 'Reconnecting…' : 'Offline');
    const seen = last ? [last.box?.last_seen, last.hub?.last_seen, last.time].map(at).filter(Boolean).sort((a, b) => b - a)[0] : null;
    offline(true, seen ? hm.format(seen) : null);
    Heart.setBpm(null);
  };

  // ── connection ──────────────────────────────────────────────────────────
  const Conn = {
    base: null, sse: true, es: null, timer: 0, polling: false, everOk: false, failSince: null, rtt: 0, gen: 0,

    async discover() {
      let cfg = null;
      try {
        const r = await fetch(`endpoint.json?t=${Date.now()}`, { cache: 'no-store' });
        if (r.ok) cfg = await r.json();
      } catch { cfg = null; }
      const v = cfg && typeof cfg.live === 'string' ? cfg.live.trim().replace(/\/+$/, '') : null;
      this.base = v === '' ? '' : v && OK_BASE.test(v) ? v : null;
      this.sse = !!cfg && cfg.sse !== false;
      return this.base !== null;
    },

    async start() {
      const gen = ++this.gen;
      this.stop();
      if (!(await this.discover())) {
        unreachable();
        this.timer = setTimeout(() => gen === this.gen && this.start(), 30000);
        return;
      }
      if (gen !== this.gen) return;
      if (this.sse && 'EventSource' in window) this.stream(gen); else this.poll(gen);
    },

    stop() {
      clearTimeout(this.timer);
      if (this.es) { this.es.close(); this.es = null; }
      this.polling = false;
    },

    ok() { this.everOk = true; this.failSince = null; },

    failed(gen) {
      this.failSince ??= Date.now();
      unreachable();
      if (Date.now() - this.failSince > 10000) { this.failSince = Date.now(); this.start(); return true; }
      return false;
    },

    stream(gen) {
      let got = false;
      const es = this.es = new EventSource(`${this.base}/stream`);
      // A stream that opens but never delivers (a proxy that buffers it): poll instead.
      const watch = setTimeout(() => { if (!got && gen === this.gen) { es.close(); this.es = null; this.poll(gen); } }, 5000);
      es.addEventListener('snapshot', e => {
        got = true;
        try { render(JSON.parse(e.data)); this.ok(); } catch { /* a bad frame is skipped */ }
      });
      es.addEventListener('beat', e => {
        try { Heart.real(JSON.parse(e.data).age_ms); } catch { /* skipped */ }
      });
      es.onerror = () => {
        if (gen !== this.gen) return;
        if (es.readyState === EventSource.CLOSED || !got) {
          clearTimeout(watch);
          es.close(); this.es = null;
          if (!this.failed(gen)) this.poll(gen);
        } else if (!this.failed(gen)) { /* EventSource retries by itself */ }
      };
    },

    poll(gen) {
      this.polling = true;
      const once = async () => {
        if (gen !== this.gen) return;
        const t0 = performance.now();
        let live = false;
        try {
          const r = await fetch(`${this.base}/live.json`, { cache: 'no-store' });
          if (!r.ok) throw new Error(String(r.status));
          const s = await r.json();
          this.rtt = performance.now() - t0;
          if (gen !== this.gen) return;
          this.ok();
          render(s);
          live = s.pulse?.bpm != null;
        } catch {
          if (gen !== this.gen || this.failed(gen)) return;
        }
        this.timer = setTimeout(once, live ? 1000 : 2000);
      };
      once();
    },
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!Conn.es && !Conn.polling) Conn.start();
  });
  Conn.start();
})();
