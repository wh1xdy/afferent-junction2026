// The haptic router (demo/js/haptics.js): one vocabulary for every game event, one place that vibrates.
// The router runs in a vm context with a manual clock and fake plugins, the same plain scripts the app loads.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const JS = path.join(__dirname, '..', 'js');
const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

// Every script of the app (vendor libraries aside), relative to demo/js.
const scripts = (dir = JS) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'vendor' ? [] : scripts(p);
  return e.name.endsWith('.js') ? [path.relative(JS, p)] : [];
});

// The text inside the parentheses that open at s[i] (strings are skipped over).
const parens = (s, i) => {
  let depth = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (!depth) return s.slice(i + 1, j); }
  }
  return '';
};
// The first argument of an argument list (up to a comma outside brackets).
const first = args => {
  let depth = 0, q = null;
  for (let j = 0; j < args.length; j++) {
    const c = args[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"') q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && !depth) return args.slice(0, j);
  }
  return args;
};
// Quoted words that are played, not compared: `g === 'rough' ? 'miss' : 'land'` gives miss and land.
const words = text => [...text.matchAll(/(===|!==|==|!=)?\s*'([a-z]+)'/g)].filter(m => !m[1]).map(m => m[2]);

// Every haptic word the code plays, with where.
const CALLS = [
  { re: /\bhap\.seq\(/g, all: true }, { re: /\bHaptics\??\.seq\(/g, all: true },
  { re: /\bhap\(/g }, { re: /\bhap\.play\(/g }, { re: /\bHaptics\??\.play\(/g }, { re: /\bHaptics\??\.lit\(/g },
  { re: /\bthis\.haptic\(/g }, { re: /\bbuzz\(/g },
];
const used = () => {
  const out = [];
  for (const f of scripts()) {
    if (f === 'haptics.js') continue;
    const s = read(JS, f);
    for (const { re, all } of CALLS) {
      for (const m of s.matchAll(re)) {
        const args = parens(s, m.index + m[0].length - 1);
        for (const w of words(all ? args : first(args))) out.push({ w, at: `${f}:${s.slice(0, m.index).split('\n').length}` });
      }
    }
    // Tables of words, such as the bells (low to high): { hap: 'land' }.
    for (const m of s.matchAll(/\bhap: '([a-z]+)'/g)) out.push({ w: m[1], at: `${f}:${s.slice(0, m.index).split('\n').length}` });
  }
  return out;
};

// A vm context with the router, a manual clock and timers that run when the clock passes them.
const load = ({ cap = null, vibrate = false, storage = null, config = {} } = {}) => {
  let now = 0, timers = [], seq = 0;
  const ctx = {
    console, Math, Date, JSON, Set, Map, Object, Array, Number, String, Promise,
    setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: id => { timers = timers.filter(t => t.id !== id); },
    performance: { now: () => now },
  };
  ctx.window = ctx;
  ctx.navigator = vibrate ? { vibrate: p => { (ctx.vibrated = ctx.vibrated || []).push(p); return true; } } : {};
  if (storage) ctx.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, String(v)); } };
  if (cap) ctx.Capacitor = cap;
  vm.createContext(ctx);
  vm.runInContext(read(JS, 'util.js'), ctx, { filename: 'util.js' });
  vm.runInContext(`A.config = ${JSON.stringify(config)};`, ctx);
  vm.runInContext(read(JS, 'haptics.js'), ctx, { filename: 'haptics.js' });
  const A = ctx.A, heard = [];
  A.bus.on('haptic', n => heard.push(n));
  const at = ms => {
    now = ms;
    for (;;) {
      const due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter(t => t !== due);
      due.fn();
    }
  };
  return { A, H: A.Haptics, ctx, heard, at, settle: () => new Promise(r => setImmediate(r)) };
};

// The app's own plugin as the native side exports it, recording every call.
const fakeOwn = ({ haptics = true, continuous = true, beat = true, played = true } = {}) => {
  const calls = [];
  const rec = name => (o = {}) => { calls.push([name, o]); return Promise.resolve(['play', 'dragStart', 'breath', 'beat', 'holdStart', 'success'].includes(name) ? { played } : {}); };
  const P = { calls, count: n => calls.filter(c => c[0] === n).length, last: n => [...calls].reverse().find(c => c[0] === n)?.[1] };
  for (const m of ['play', 'holdStart', 'holdStop', 'success', 'dragStart', 'dragMove', 'dragStop', 'breath', 'stopAll', 'warm']) P[m] = rec(m);
  P.available = () => { calls.push(['available', {}]); return Promise.resolve({ haptics, continuous }); };
  if (beat) P.beat = rec('beat');
  return P;
};
const fakeCapHaptics = () => {
  const calls = [];
  const rec = name => o => { calls.push([name, o]); return Promise.resolve(); };
  return { calls, impact: rec('impact'), notification: rec('notification'), selectionStart: rec('selectionStart'), selectionChanged: rec('selectionChanged'), selectionEnd: rec('selectionEnd') };
};
const native = plugins => ({ isNativePlatform: () => true, Plugins: plugins });

const tests = {
  'vocabulary: every haptic word the code plays is one of the vocabulary, none of the old names'() {
    const { H } = load(), all = used();
    assert.ok(all.length > 120, `only ${all.length} haptic calls were found; the scan has lost them`);
    const unknown = all.filter(u => !H.VOCAB[u.w]);
    assert.deepStrictEqual(unknown.map(u => `${u.w} at ${u.at}`), [], 'words outside the vocabulary (old names are light, medium, heavy: use touch, hit, land)');
    const words = new Set(all.map(u => u.w));
    for (const w of Object.keys(H.VOCAB)) if (w !== 'heart') assert.ok(words.has(w), `${w} is never played`);
    for (const [w, v] of Object.entries(H.VOCAB)) {
      assert.ok(v.feel && v.lane in H.GAP && Number.isFinite(v.prio), `${w} is described, has a lane and a priority`);
      assert.ok(v.cap.length && v.vib.length % 2 === 1, `${w} has a Capacitor and a navigator.vibrate form`);
    }
    for (const [old, now] of Object.entries(H.ALIAS)) assert.ok(H.VOCAB[now], `${old} still plays as ${now}`);
  },

  'vocabulary: each game ends on complete, misses are soft, and the answer-free task never judges'() {
    for (const f of scripts().filter(f => f.startsWith('tasks/') && f !== 'tasks/kit.js')) {
      const s = read(JS, f);
      if (/\bfinish\(this|J\.finish\(this/.test(s)) assert.ok(s.includes("'complete'"), `${f} finishes without the complete touch`);
    }
    const fog = read(JS, 'tasks/fog.js');
    assert.ok(!/'hit'|'miss'|'success'/.test(fog.replace(/'complete'/g, '')), 'fog has no right answer, so both answers are the same touch');
    // Measures: the touch must not steer the choice or cue the reaction.
    const fork = read(JS, 'tasks/fork.js');
    assert.ok(/ev === 'choose'[\s\S]{0,400}hap\('hit'\)/.test(fork), 'both fork paths feel the same when chosen');
    const reaction = read(JS, 'tasks/reaction.js');
    assert.ok(!/onset\([^)]*\)\s*\{[^}]*hap/.test(reaction), 'nothing is felt at the bite');
  },

  'one place vibrates: no file but the router calls navigator.vibrate or a haptics plugin'() {
    const direct = /navigator\.vibrate|Plugins\??\.(Haptics|AfferentHaptics)\b|registerPlugin\(\s*['"](Haptics|AfferentHaptics)/;
    const bad = scripts().filter(f => f !== 'haptics.js' && direct.test(read(JS, f)));
    assert.deepStrictEqual(bad, [], 'route these through A.Haptics (play, breath, drag, hold; the heartbeat: A.Haptics.play(\'heart\'))');
    for (const page of ['index.html', 'patient.html']) assert.ok(!direct.test(read(JS, '..', page)), page);
    const html = read(JS, '..', 'index.html');
    assert.ok(html.indexOf('js/haptics.js') > html.indexOf('js/util.js') && html.indexOf('js/haptics.js') < html.indexOf('js/gui/shell.js'), 'the router loads right after util.js, before anything that plays');
  },

  async 'backend: the app plugin first, then Capacitor Haptics, then navigator.vibrate, then nothing'() {
    const own = fakeOwn(), cap = fakeCapHaptics();
    let r = load({ cap: native({ AfferentHaptics: own, Haptics: cap }), vibrate: true });
    assert.strictEqual(r.H.backend(), 'afferent');
    assert.strictEqual(r.H.play('hit'), true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(own.last('play'))), { name: 'hit', gain: 0.9, sharp: 0 });
    await r.settle();
    assert.deepStrictEqual(cap.calls, [], 'Capacitor Haptics only when the own plugin is missing');
    assert.strictEqual(r.ctx.vibrated, undefined);

    const cap2 = fakeCapHaptics();
    r = load({ cap: native({ Haptics: cap2 }), vibrate: true });
    assert.strictEqual(r.H.backend(), 'capacitor');
    r.H.play('hit'); r.at(100); r.H.play('success'); r.at(600); r.H.play('tick');
    assert.deepStrictEqual(cap2.calls.map(c => [c[0], c[1]?.style ?? c[1]?.type ?? null]), [['impact', 'MEDIUM'], ['notification', 'SUCCESS'], ['selectionStart', null], ['selectionChanged', null]]);

    r = load({ vibrate: true });
    assert.strictEqual(r.H.backend(), 'vibrate');
    r.H.play('land');
    assert.deepStrictEqual(r.ctx.vibrated.map(p => [...p]), [[19]], 'a land is one pulse, a little shorter at the default strength');

    r = load({ cap: { isNativePlatform: () => false, Plugins: { AfferentHaptics: fakeOwn(), Haptics: fakeCapHaptics() } } });
    assert.strictEqual(r.H.backend(), 'none', 'in a browser the plugin proxies are not used');
    assert.strictEqual(r.H.play('touch'), true, 'nothing to play on, but the dev panel still sees the touch');
    assert.deepStrictEqual(r.heard, ['touch']);
  },

  async 'backend: hardware without haptics, and a pattern the plugin could not play, fall back to Capacitor Haptics'() {
    const own = fakeOwn({ haptics: false }), cap = fakeCapHaptics();
    let r = load({ cap: native({ AfferentHaptics: own, Haptics: cap }) });
    assert.strictEqual(r.H.backend(), 'afferent', 'asked, not yet answered');
    await r.settle();
    assert.strictEqual(r.H.backend(), 'capacitor', 'an iPad without Core Haptics');
    assert.strictEqual(own.count('available'), 1, 'asked once');

    const own2 = fakeOwn({ played: false }), cap2 = fakeCapHaptics();
    r = load({ cap: native({ AfferentHaptics: own2, Haptics: cap2 }) });
    r.H.play('land');
    await r.settle(); await r.settle();
    assert.deepStrictEqual(cap2.calls.map(c => c[1].style), ['HEAVY'], 'played:false from the plugin is played by Capacitor instead');
  },

  async 'heart: the heartbeat plays the plugin\'s beat, two light impacts without one'() {
    const own = fakeOwn();
    let r = load({ cap: native({ AfferentHaptics: own }) });
    r.H.play('heart');
    assert.strictEqual(own.count('beat'), 1);
    assert.strictEqual(own.count('play'), 0);
    assert.strictEqual(own.last('beat').strength, 0.6, 'as heartbeat.js tuned it');
    r.A.session = { mode: 'calm', night: true }; r.at(1000); r.H.play('heart');
    assert.ok(own.last('beat').strength < 0.6, 'softer at night');
    const cap = fakeCapHaptics();
    r = load({ cap: native({ AfferentHaptics: fakeOwn({ beat: false }), Haptics: cap }) });
    r.H.play('heart'); r.at(200);
    assert.deepStrictEqual(cap.calls.map(c => c[1].style), ['LIGHT', 'LIGHT']);
  },

  'rate limits: one lane at a time, a burst cap, and a reward is not muddied'() {
    const own = fakeOwn(), r = load({ cap: native({ AfferentHaptics: own }) }), { H, at } = r;
    assert.strictEqual(H.play('tick'), true);
    at(20); assert.strictEqual(H.play('tick'), false, 'ticks closer than 55 ms are one');
    at(60); assert.strictEqual(H.play('tick'), true);
    assert.strictEqual(H.play('hit'), true, 'another lane plays at the same moment');
    at(100); assert.strictEqual(H.play('miss'), false, 'hits and misses share a lane');
    // A fast drag over many cells: never more than 8 in half a second, whatever the lanes.
    H.reset(); let n = 0;
    for (let t = 1000; t < 1500; t += 20) { at(t); n += H.play(t % 40 ? 'tick' : 'touch') ? 1 : 0; }
    assert.ok(n <= 8, `${n} one-shots in 0.5 s`);
    // A complete hushes everything smaller for a moment; a later hit plays again.
    H.reset(); at(3000);
    assert.strictEqual(H.play('complete'), true);
    at(3300); assert.strictEqual(H.play('hit'), false, 'no hit over the end of a game');
    assert.strictEqual(H.play('success'), false, 'nor a smaller reward');
    at(4200); assert.strictEqual(H.play('hit'), true);
    assert.strictEqual(H.play('nonsense'), false, 'an unknown word plays nothing');
    assert.strictEqual(H.play('light'), true, 'an old name still plays, as touch');
    assert.strictEqual(own.last('play').name, 'touch');
  },

  'rate limits: a drag hum follows progress without flooding the bridge, and ticks where there is no hum'() {
    const own = fakeOwn(), r = load({ cap: native({ AfferentHaptics: own }) });
    r.H.drag(0);
    for (let i = 1; i <= 100; i++) { r.at(i * 10); r.H.drag(i / 100); }
    assert.strictEqual(own.count('dragStart'), 1);
    assert.ok(own.count('dragMove') <= 20 && own.count('dragMove') >= 10, `${own.count('dragMove')} moves in a second`);
    assert.ok(own.last('dragMove').level > 0.9, 'the last move is near the end');
    r.H.drag(null);
    assert.strictEqual(own.count('dragStop'), 1);
    r.H.drag(null);
    assert.strictEqual(own.count('dragStop'), 1, 'ending twice ends once');

    const cap = fakeCapHaptics(), b = load({ cap: native({ Haptics: cap }) });
    b.H.drag(0);
    for (let i = 1; i <= 100; i++) { b.at(i * 10); b.H.drag(i / 100); }
    assert.strictEqual(cap.calls.filter(c => c[0] === 'selectionChanged').length, 8, 'a tick at every eighth of the way');

    const rm = load({ cap: native({ AfferentHaptics: fakeOwn() }), config: { reducedMotion: true } });
    rm.H.drag(0);
    for (let i = 1; i <= 100; i++) { rm.at(i * 200); rm.H.drag(i / 100); }
    assert.ok(rm.heard.filter(n => n === 'tick').length === 4 && !rm.heard.includes('drag'), 'reduced motion: no hum, a tick every quarter');
  },

  async 'context: calm and night are softer and rounder, wake a little crisper, reduced motion softer'() {
    const gainOf = (session, config = {}) => {
      const own = fakeOwn(), r = load({ cap: native({ AfferentHaptics: own }), config });
      r.A.session = session;
      r.H.play('hit');
      return own.last('play');
    };
    const day = gainOf(null), calm = gainOf({ mode: 'calm', night: false }), wake = gainOf({ mode: 'flow', gameMode: 'wake', night: false });
    const night = gainOf({ mode: 'rest', night: true }), still = gainOf(null, { reducedMotion: true });
    assert.ok(calm.gain < day.gain && calm.sharp < day.sharp, 'calm');
    assert.ok(wake.gain > day.gain && wake.sharp > day.sharp, 'wake');
    assert.ok(night.gain < calm.gain && night.sharp < calm.sharp, 'night in rest mode is the softest');
    assert.ok(still.gain < day.gain, 'reduced motion');
    assert.ok(gainOf({ mode: 'calm', night: false, done: true }).gain === day.gain, 'a finished session no longer counts');
    const own = fakeOwn(), r = load({ cap: native({ AfferentHaptics: own }) });
    r.A.session = { mode: 'wake', night: false };
    r.H.play('touch', 0.5);
    assert.ok(own.last('play').gain <= 0.5, 'a strength scales the word');
  },

  async 'continuous: the kindle, the breath and the drag reach the plugin, and a new phase ends them'() {
    const own = fakeOwn(), r = load({ cap: native({ AfferentHaptics: own }) });
    await r.settle();
    assert.strictEqual(r.H.smooth(), true);
    assert.strictEqual(r.H.hold(900, 0.25), true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(own.last('holdStart'))), { durationMs: 900, from: 0.25 }, 'the kindle swell as it was tuned');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(own.last('warm'))), { on: true }, 'the engine is kept warm from the first hold');
    r.H.release(); assert.strictEqual(own.count('holdStop'), 1);
    r.H.lit(); assert.strictEqual(own.count('success'), 1, 'the kindle success, exactly as tuned');

    r.H.breath('in', 4);
    const b = own.last('breath');
    assert.deepStrictEqual([b.phase, b.durationMs], ['in', 4000]);
    assert.ok(b.gain <= 0.7 && b.sharp <= -0.1, 'a breath is always as soft as calm');
    r.H.breath('out', 6);
    assert.strictEqual(own.last('breath').phase, 'out');

    r.H.drag(0.3);
    r.A.bus.emit('segment', 'walk');
    assert.strictEqual(own.count('dragStop'), 1);
    assert.ok(own.count('stopAll') >= 1, 'a new phase ends the breath');
    r.A.bus.emit('home');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(own.last('warm'))), { on: false }, 'home lets the engine sleep');

    // Without the hum (Android without amplitude control): the breath is counted in ticks, the turn a touch.
    const flat = fakeOwn({ continuous: false }), f = load({ cap: native({ AfferentHaptics: flat }) });
    await f.settle();
    assert.strictEqual(f.H.smooth(), false);
    f.H.breath('in', 4);
    for (let t = 0; t <= 4000; t += 100) f.at(t);
    f.H.breath('out', 6);
    assert.deepStrictEqual(flat.calls.filter(c => c[0] === 'play').map(c => c[1].name), ['tick', 'tick', 'tick', 'tick', 'touch']);
  },

  'switch: Vibration off silences every word, ends a hum, and is remembered'() {
    const storage = new Map(), own = fakeOwn();
    let r = load({ cap: native({ AfferentHaptics: own }), storage });
    assert.strictEqual(r.H.on, true, 'on by default');
    r.H.drag(0.5);
    r.H.setEnabled(false);
    const heard = r.heard.length;
    assert.strictEqual(r.H.on, false);
    assert.strictEqual(own.count('dragStop'), 1, 'turning it off ends the hum');
    const before = own.calls.length;
    assert.strictEqual(r.H.play('complete'), false);
    r.H.breath('in', 4); r.H.drag(0.2); assert.strictEqual(r.H.hold(900, 0), false); assert.strictEqual(r.H.lit(), false);
    assert.strictEqual(own.calls.slice(before).filter(c => !['stopAll', 'dragStop'].includes(c[0])).length, 0, 'nothing reaches the plugin');
    assert.deepStrictEqual(r.heard.slice(heard), [], 'and nothing pulses in the dev panel');
    assert.strictEqual(storage.get('afferent.haptics'), 'false');
    r = load({ cap: native({ AfferentHaptics: fakeOwn() }), storage });
    assert.strictEqual(r.H.on, false, 'still off after a restart');
    r.H.setEnabled(true);
    assert.strictEqual(r.H.play('touch'), true);

    const shell = read(JS, 'gui', 'shell.js'), main = read(JS, 'main.js');
    const row = shell.match(/\{ icon: '(\w+)', label: 'Vibration'[^}]*sw: 'id="hapticSw"' \}/);
    assert.ok(row, 'Settings has a Vibration switch');
    const subset = read(JS, '..', 'fonts', 'icon-names.txt').split(',').map(x => x.trim());
    assert.ok(subset.includes(row[1]), `icon ${row[1]} is in the font subset`);
    assert.ok(/\$\('hapticSw'\)\.checked = A\.Haptics\.on/.test(main) && /\$\('hapticSw'\)\.onchange = e => \{ A\.Haptics\.setEnabled\(e\.target\.checked\)/.test(main), 'main.js shows and saves it');
  },

  'J.hap is the router, and the old stinger rises'() {
    const own = fakeOwn(), r = load({ cap: native({ AfferentHaptics: own }) });
    r.ctx.document = { createElement: () => ({ getContext: () => null }) };
    vm.runInContext(read(JS, 'juice.js'), r.ctx, { filename: 'juice.js' });
    assert.strictEqual(r.A.J.hap, r.H.hap);
    r.A.J.stinger();
    assert.strictEqual(own.last('play').name, 'rise');
    r.at(500); r.A.J.hap.ladder(1, 4); assert.strictEqual(own.last('play').name, 'hit');
    r.at(1000); r.A.J.hap.ladder(4, 4); assert.strictEqual(own.last('play').name, 'land');
    r.at(1500); r.A.J.hap.seq([['tick', 0], ['complete', 140]]); r.at(1700);
    assert.deepStrictEqual(own.calls.filter(c => c[0] === 'play').slice(-2).map(c => c[1].name), ['tick', 'complete']);
  },

  'native: iOS and Android carry every word and every method the router calls'() {
    const { H } = load(), words = Object.keys(H.VOCAB).filter(w => w !== 'heart').sort();
    const swift = read(ROOT, 'ios', 'App', 'App', 'AfferentHaptics.swift');
    assert.deepStrictEqual([...swift.matchAll(/v\["(\w+)"\] = HapticShape/g)].map(m => m[1]).sort(), words, 'Core Haptics patterns');
    const kt = read(ROOT, 'android', 'app', 'src', 'main', 'java', 'fi', 'junction', 'afferent', 'HapticShapes.kt');
    assert.deepStrictEqual(JSON.parse(kt.match(/val WORDS = listOf\(([^)]*)\)/)[1].replace(/^/, '[').replace(/$/, ']')).sort(), words, 'Android shapes');
    const router = read(JS, 'haptics.js');
    const calls = new Set([...router.matchAll(/\bP\.(\w+)\(|own\(\)\?\.(\w+)\?\.\(/g)].map(m => m[1] || m[2]));
    const iosMethods = [...swift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map(m => m[1]);
    const android = read(ROOT, 'android', 'app', 'src', 'main', 'java', 'fi', 'junction', 'afferent', 'AfferentHapticsPlugin.kt');
    const androidMethods = [...android.matchAll(/@PluginMethod\s+fun (\w+)\(/g)].map(m => m[1]);
    for (const m of calls) {
      if (m === 'beat') continue; // the heartbeat's own method (heartbeat.js), checked where it is used
      assert.ok(iosMethods.includes(m), `iOS exports ${m}`);
      assert.ok(androidMethods.includes(m), `Android exports ${m}`);
    }
    for (const m of iosMethods) assert.ok(androidMethods.includes(m), `Android has the iOS method ${m}`);
    assert.ok(/AfferentHapticsPlugin::class\.java/.test(read(ROOT, 'android', 'app', 'src', 'main', 'java', 'fi', 'junction', 'afferent', 'AfferentPlugins.kt')), 'registered on Android');
    assert.ok(/android\.permission\.VIBRATE/.test(read(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')), 'Android may vibrate');
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
  }
  process.exit(failed ? 1 : 0);
})();
