// Run: node demo/tests/keyboard.test.js
// The keyboard on a phone. iOS zooms the whole page into a text field whose text is under 16 px when it is tapped, and then
// the header ends up under the status bar: every field in the app (index.html, patient.html and the forms their scripts
// build) is 16 px or more in the stylesheets those pages load. The form accessory bar (⌃ ⌄ ✓) is switched off at start
// on iOS through @capacitor/keyboard, Return closes the keyboard (which saves), a tap outside closes it, and the field
// being typed in stays above the keyboard by moving its own scroller, never the page (js/keyboard.js).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeDocument, El } = require('./fakedom');

const DEMO = path.join(__dirname, '..');
const ROOT = path.join(DEMO, '..');
const read = f => fs.readFileSync(f, 'utf8');
let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log('ok  ', name); } catch (e) { failures++; console.log('FAIL', name, '\n     ', e.message); }
};

// ---------------------------------------------------------------- the fields and the stylesheets, read as text

// Fields that bring up a keyboard or a picker. Checkboxes, switches and sliders are not typed into and are left out.
const NOT_TYPED = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'hidden', 'color', 'file', 'image']);
const KEYBOARD = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

// Markup to elements with their ancestors, by a tag stack: enough for the app's own templates. ${...} in a template
// becomes \u0001, so an attribute built from it is known to be unknown.
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'col', 'wbr']);
const ATTR = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const parseMarkup = (src, where, base = []) => {
  const out = [], stack = [...base];
  for (const m of src.matchAll(/<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g)) {
    if (m[1]) { const t = m[1].toLowerCase(); const i = stack.map(s => s.tag).lastIndexOf(t); if (i >= base.length) stack.length = i; continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase(), attrs = {};
    for (const a of (m[3] || '').matchAll(ATTR)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const node = { tag, attrs, ancestors: stack.slice().reverse(), where };
    if (['input', 'select', 'textarea'].includes(tag)) out.push(node);
    if (!VOID.has(tag)) stack.push(node);
  }
  return out;
};

// The template literals of a script, with ${...} replaced, nested templates included.
const templates = src => {
  const out = [];
  const scan = (i, sink) => {   // i just after an opening backtick; returns the index after the closing one
    let text = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { text += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { sink.push(text); return i + 1; }
      if (c === '$' && src[i + 1] === '{') {
        let depth = 1; i += 2;
        while (i < src.length && depth) {
          const d = src[i];
          if (d === '`') { i = scan(i + 1, out); continue; }
          if (d === "'" || d === '"') { const q = d; i++; while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1; i++; continue; }
          if (d === '{') depth++; else if (d === '}') depth--;
          i++;
        }
        text += '\u0001';
        continue;
      }
      text += c; i++;
    }
    return i;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1; continue; }
    if (c === '`') i = scan(i + 1, out) - 1;
  }
  return out;
};

// h('input', { id: 'qsIni', class: 'qf-in', ... }) in qrshow.js and the like.
const hCalls = (src, where) => [...src.matchAll(/\bh\(\s*'(input|select|textarea)'\s*,\s*\{([^}]*)\}/g)].map(m => {
  const attrs = {};
  for (const a of m[2].matchAll(/['"]?([\w-]+)['"]?\s*:\s*'([^']*)'/g)) attrs[a[1] === 'class' ? 'class' : a[1].toLowerCase()] = a[2];
  return { tag: m[1], attrs, ancestors: [], where, built: true };
});

const typedField = f => f.tag !== 'input' || !NOT_TYPED.has((f.attrs.type || 'text').toLowerCase());
const keyboardField = f => f.tag === 'textarea' || (f.tag === 'input' && KEYBOARD.has((f.attrs.type || 'text').toLowerCase()));

// A page: its fields (its own markup and the templates of the scripts it loads) and its stylesheets.
const page = name => {
  const html = read(path.join(DEMO, name));
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]).filter(s => s.startsWith('js/'));
  const sheets = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^https?:/.test(h));
  const css = sheets.map(h => {
    const f = h.startsWith('design/') ? path.join(ROOT, h) : path.join(DEMO, h);
    return { file: h, text: read(f) };
  });
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) css.push({ file: `${name} <style>`, text: m[1] });
  const fields = parseMarkup(html, name);
  for (const s of scripts) {
    const src = read(path.join(DEMO, s));
    for (const t of templates(src)) if (/<(input|select|textarea)\b/.test(t)) fields.push(...parseMarkup(t, s).map(f => ({ ...f, fragment: true })));
    fields.push(...hCalls(src, s));
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  return { name, scripts, css, ids, fields: fields.filter(typedField) };
};

// CSS: rules with their selectors and declarations, inside @media and @supports too; @keyframes and @font-face skipped.
const rules = text => {
  const out = [], src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const walk = s => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
      const body = s.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(head)) walk(body);
      else if (!head.startsWith('@')) out.push({ selectors: head.split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean), body });
      i = j;
    }
  };
  walk(src);
  return out;
};

// The font size a rule gives, from its last font or font-size declaration: px (rem as 16 px), or a word for anything
// this check cannot read (inherit, em, %, var(...)), or null when the rule says nothing about it.
const ruleSize = body => {
  let size = null;
  for (const d of body.split(';')) {
    const m = d.match(/^\s*(font-size|font)\s*:\s*(.+?)\s*(!important)?\s*$/i);
    if (!m) continue;
    const v = m[2];
    if (m[1].toLowerCase() === 'font-size') {
      const n = v.match(/^(\d+(?:\.\d+)?)(px|rem)$/);
      size = n ? Number(n[1]) * (n[2] === 'rem' ? 16 : 1) : v;
    } else {
      const n = v.match(/(?:^|\s)(\d+(?:\.\d+)?)(px|rem)(?:\s*\/\s*\S+)?(?=\s)/);
      size = n ? Number(n[1]) * (n[2] === 'rem' ? 16 : 1) : v;
    }
  }
  return size;
};

// Matching a compound selector against a field, or one of its ancestors: 'yes', 'no' or 'maybe' (a state such as
// :focus, or an attribute built at run time).
const UNKNOWN = '\u0001';
let takenIds = new Set();   // ids of the page's own markup: a field with an id built at run time is none of them
const compound = (node, c) => {
  let result = 'yes';
  const re = /^\*|^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([~|^$*]?=)["']?([^"'\]]*)["']?)?\]|:not\(([^()]*)\)|::?[\w-]+(?:\([^()]*\))?/g;
  let m, at = 0;
  while ((m = re.exec(c)) && m.index === at && m[0]) {
    at = re.lastIndex;
    const cls = (node.attrs.class || '').split(/\s+/), id = node.attrs.id ?? '';
    const unknown = v => v.includes(UNKNOWN);
    let r = 'yes';
    if (m[1]) r = node.tag === m[1].toLowerCase() ? 'yes' : 'no';
    else if (m[2]) r = id === m[2] ? 'yes' : unknown(id) && !takenIds.has(m[2]) ? 'maybe' : 'no';
    else if (m[3]) r = cls.includes(m[3]) ? 'yes' : unknown(node.attrs.class || '') ? 'maybe' : 'no';
    else if (m[4]) {
      const v = node.attrs[m[4].toLowerCase()];
      if (v === undefined) r = m[4] === 'type' && m[6] === 'text' && node.tag === 'input' ? 'yes' : (m[4].startsWith('data-') || m[4].startsWith('aria-')) ? 'maybe' : 'no';
      else if (!m[5]) r = 'yes';
      else if (unknown(v)) r = 'maybe';
      else r = m[5] === '=' ? (v === m[6] ? 'yes' : 'no') : 'maybe';
    } else if (m[7] !== undefined) {
      const inner = compound(node, m[7]);
      r = inner === 'yes' ? 'no' : inner === 'no' ? 'yes' : 'maybe';
    } else if (m[0].startsWith('::')) r = 'pseudo';
    else if (m[0] !== '*') r = 'maybe';   // :focus, :hover, :placeholder-shown, :root ...
    if (r === 'pseudo') return 'pseudo';
    if (r === 'no') return 'no';
    if (r === 'maybe') result = 'maybe';
  }
  if (at !== c.length) return 'maybe';
  return result;
};
// The whole selector: the subject must match the field; the parts before it are its ancestors (or siblings, which are
// always a maybe). 'yes' only when every part is known to match.
const select = (field, sel) => {
  const parts = sel.replace(/\s*([>+~])\s*/g, ' $1 ').trim().split(/\s+/);
  const subject = compound(field, parts.pop());
  if (subject === 'no' || subject === 'pseudo') return 'no';
  let result = subject, i = field.ancestors.length ? 0 : -1;
  while (parts.length) {
    const comb = ['>', '+', '~'].includes(parts[parts.length - 1]) ? parts.pop() : ' ';
    const c = parts.pop();
    if (comb === '+' || comb === '~') { result = 'maybe'; continue; }
    let found = 'no';
    for (; i >= 0 && i < field.ancestors.length; i++) {
      const r = compound(field.ancestors[i], c);
      if (r !== 'no') { found = r; i++; break; }
      if (comb === '>') break;
    }
    if (found === 'no') result = 'maybe';   // the page around it, or classes set at run time
    else if (found === 'maybe') result = 'maybe';
  }
  return result;
};

// Every font size that could reach the field, and whether one known to apply is 16 px or more.
const sizesFor = (field, css, taken = new Set()) => {
  takenIds = taken;
  const could = [], sure = [];
  for (const sheet of css) for (const rule of rules(sheet.text)) {
    const size = ruleSize(rule.body);
    if (size === null) continue;
    for (const sel of rule.selectors) {
      const r = select(field, sel);
      if (r === 'no') continue;
      could.push({ size, sel, file: sheet.file });
      if (r === 'yes') sure.push({ size, sel, file: sheet.file });
    }
  }
  const inline = ruleSize((field.attrs.style || '').replace(UNKNOWN, ''));
  if (inline !== null) { could.push({ size: inline, sel: 'style=""', file: field.where }); sure.push({ size: inline, sel: 'style=""', file: field.where }); }
  return { could, sure };
};
const label = f => `${f.tag}${f.attrs.type ? `[type=${f.attrs.type}]` : ''}${f.attrs.id ? '#' + f.attrs.id.replace(/\u0001/g, '*') : ''}${f.attrs.class ? '.' + f.attrs.class.trim().split(/\s+/).join('.') : ''} (${f.where})`;

const PAGES = ['index.html', 'patient.html'].map(page);

test('the scan finds the app\'s fields: Mornings, the onboarding, the wake time and pause date, the hub, the voice relay, the initial for the code', () => {
  const all = PAGES.flatMap(p => p.fields);
  const has = (what, f) => assert.ok(all.some(f), `not found: ${what}`);
  has('the three small steps (onboard.js)', f => /\bstep-in\b/.test(f.attrs.class || '') && f.where === 'js/onboard.js');
  has('the cue in the onboarding', f => f.attrs.id === 'obCue');
  has('the wake time', f => f.attrs.id === 'wakeIn' && f.attrs.type === 'time');
  has('the pause date', f => f.attrs.id === 'pauseDate' && f.attrs.type === 'date');
  has('the Home hub address', f => f.attrs.id === 'hubAddr');
  has('the voice relay address and code', f => f.attrs.id === 'voiceUrl');
  has('the voice relay code', f => f.attrs.id === 'voiceCode');
  has('the initial for the code to the doctor (qrshow.js)', f => f.attrs.id === 'qsIni' && f.where === 'js/qrshow.js');
  for (const p of PAGES) for (const f of p.fields) assert.ok(f.tag !== 'input' || !NOT_TYPED.has(f.attrs.type), label(f));
});

test('every field is 16 px or more in every stylesheet that could reach it, so iOS does not zoom when it is tapped', () => {
  const bad = [];
  for (const p of PAGES) for (const f of p.fields) {
    const { could, sure } = sizesFor(f, p.css, p.ids);
    for (const c of could) if (typeof c.size !== 'number' || c.size < 16) bad.push(`${label(f)} on ${p.name}: ${c.file} "${c.sel}" gives ${c.size}`);
    if (!sure.some(s => typeof s.size === 'number' && s.size >= 16)) bad.push(`${label(f)} on ${p.name}: no rule sets its size, so it is the browser's small default`);
  }
  assert.deepStrictEqual(bad, []);
});

test('the check itself catches a small field: 15 px, a field with no size, and a size this check cannot read', () => {
  const field = { tag: 'input', attrs: { type: 'text', class: 'time-val' }, ancestors: [{ tag: 'label', attrs: { class: 'li state' } }], where: 't' };
  const css = t => [{ file: 't.css', text: t }];
  assert.strictEqual(sizesFor(field, css('.time-val { font: 400 15px/20px var(--f); }')).could[0].size, 15);
  assert.strictEqual(sizesFor(field, css('.time-val { font: 400 16px/20px var(--f); }')).sure[0].size, 16);
  assert.strictEqual(sizesFor(field, css('.li .time-val:focus { font-size: 14px }')).could[0].size, 14, 'a state rule counts');
  assert.strictEqual(sizesFor(field, css('.li .time-val:focus { font-size: 14px }')).sure.length, 0, 'but is not sure to apply');
  assert.strictEqual(sizesFor(field, css('.other input { font-size: 12px }')).could[0].size, 12, 'an ancestor this check cannot see is a maybe');
  assert.strictEqual(sizesFor(field, css('input[type=range] { font-size: 12px } .time-val::placeholder { font-size: 10px }')).could.length, 0);
  assert.strictEqual(sizesFor(field, css('.time-val { font: inherit; font-size: 17px }')).sure[0].size, 17, 'the last declaration counts');
  assert.strictEqual(sizesFor(field, css('.time-val { font-size: 1em }')).could[0].size, '1em');
  assert.strictEqual(sizesFor(field, css('@media (max-width: 760px) { .time-val { font-size: 13px } }')).could[0].size, 13, 'inside @media');
  assert.strictEqual(sizesFor(field, css('.switch { font-size: 10px }')).could.length, 0);
});

test('the rows keep their height: the Mornings fields stay on a 20 px line, the step fields keep their width', () => {
  const shell = read(path.join(DEMO, 'css/gui/shell.css')), ba = read(path.join(DEMO, 'css/ba.css'));
  assert.match(shell, /\.time-val \{[^}]*font: 400 16px\/20px/);
  assert.match(shell, /\.pause-menu input\[type="date"\] \{[^}]*font: 400 16px\/20px/);
  assert.match(ba, /\.step-row \.step-in \{ width: 142px;/, '9.5em at the old 15 px');
});

test('pinch zoom is left alone: no maximum-scale or user-scalable=no in the viewport', () => {
  for (const name of ['index.html', 'patient.html']) {
    const vp = read(path.join(DEMO, name)).match(/<meta name="viewport" content="([^"]+)"/)[1];
    assert.ok(!/maximum-scale|user-scalable\s*=\s*(no|0)/.test(vp), `${name}: ${vp}`);
  }
});

test('every field typed into says what Return does (enterkeyhint), and keyboard.js gives one to the fields built in code', () => {
  for (const p of PAGES) for (const f of p.fields.filter(keyboardField)) {
    if (f.built) continue;   // h(...) fields get "done" from keyboard.js when focused (tested below)
    assert.ok(['done', 'next', 'go', 'send', 'search'].includes(f.attrs.enterkeyhint), `${label(f)}: enterkeyhint="${f.attrs.enterkeyhint}"`);
  }
  const all = PAGES.flatMap(p => p.fields);
  assert.strictEqual(all.find(f => f.attrs.id === 'voiceUrl').attrs.enterkeyhint, 'next', 'the relay address goes on to the code');
  assert.strictEqual(all.find(f => f.attrs.id === 'hubAddr').attrs.enterkeyhint, 'go', 'Return connects the hub');
  assert.ok(all.filter(f => /\bstep-in\b/.test(f.attrs.class || '')).every(f => f.attrs.enterkeyhint === 'done'));
});

test('both pages load keyboard.js after util.js', () => {
  for (const p of PAGES) {
    const i = p.scripts.indexOf('js/keyboard.js');
    assert.ok(i > p.scripts.indexOf('js/util.js') && p.scripts.indexOf('js/util.js') >= 0, `${p.name}: ${p.scripts.slice(0, 5)}`);
  }
});

test('@capacitor/keyboard is in the app: package.json, the iOS Swift package, Android, and its config', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  assert.match(pkg.dependencies['@capacitor/keyboard'] || '', /^\^?8\./, 'a Capacitor 8 version');
  assert.match(read(path.join(ROOT, 'ios/App/CapApp-SPM/Package.swift')), /\.product\(name: "CapacitorKeyboard", package: "CapacitorKeyboard"\)/);
  assert.match(read(path.join(ROOT, 'android/capacitor.settings.gradle')), /capacitor-keyboard/);
  assert.match(read(path.join(ROOT, 'android/app/capacitor.build.gradle')), /project\(':capacitor-keyboard'\)/);
  const cfg = JSON.parse(read(path.join(ROOT, 'capacitor.config.json')));
  assert.strictEqual(cfg.plugins?.Keyboard?.resize, 'native', 'the web view shrinks above the keyboard');
  assert.ok(!('resizeOnFullScreen' in cfg.plugins.Keyboard), 'Capacitor 8 SystemBars handles Android; the plugin warns against it');
  assert.notStrictEqual(cfg.zoomEnabled ?? cfg.ios?.zoomEnabled, true, 'zoomEnabled stays at its default');
  const manifest = read(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'));
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/, 'Android resizes, it does not pan the page under the status bar');
});

// ---------------------------------------------------------------- keyboard.js on the fake DOM

const SRC = read(path.join(DEMO, 'js/keyboard.js'));
const load = ({ platform = 'ios', native = true, innerHeight = 874 } = {}) => {
  const doc = makeDocument(), calls = [], win = {};
  const frames = [];
  Object.assign(El.prototype, {
    matches(sel) { return this.closest(sel) === this; },
    hasAttribute(k) { return this.getAttribute(k) != null; },
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; },
    focus() { const was = doc.activeElement; doc.activeElement = this; if (was !== this) for (const f of doc.listeners.focusin || []) f({ type: 'focusin', target: this }); },
    blur() { if (doc.activeElement === this) { doc.activeElement = doc.body; this.blurred = (this.blurred || 0) + 1; this.onchange?.(); } },
    getClientRects() { return [1]; },
    getBoundingClientRect() { const y = this.scrollParent()?.scrollTop || 0; return this.rect ? { top: this.rect.top - y, bottom: this.rect.bottom - y } : { top: 0, bottom: 0 }; },
    scrollParent() { for (let n = this.parentNode; n && n.nodeType === 1; n = n.parentNode) if (n.overflow) return n; return null; },
  });
  Object.defineProperty(El.prototype, 'parentElement', { configurable: true, get() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; } });
  Object.defineProperty(El.prototype, 'form', { configurable: true, get() { return this.closest('form'); } });
  doc.activeElement = doc.body;
  doc.listeners = {};
  const fire = (type, target, extra = {}) => {
    const e = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const f of doc.listeners[type] || []) f(e);
    return e;
  };
  const winListeners = {};
  Object.assign(win, {
    innerHeight,
    addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); },
    requestAnimationFrame: f => frames.push(f),
    getComputedStyle: el => ({ overflowY: el.overflow ? 'auto' : 'visible', paddingBottom: el.padBottom || '0px' }),
    matchMedia: () => ({ matches: false }),
    scrollTo: () => calls.push(['window.scrollTo']),
    A: {},
    Capacitor: native ? {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: { Keyboard: { setAccessoryBarVisible: o => { calls.push(['setAccessoryBarVisible', o]); return Promise.resolve(); } } },
    } : undefined,
  });
  win.window = win; win.document = doc; win.console = console;
  vm.runInNewContext(SRC, win);
  const flush = () => { while (frames.length) frames.shift()(); };
  const emit = (type, extra = {}) => { for (const f of winListeners[type] || []) f({ type, ...extra }); flush(); };
  return { doc, win, calls, fire, emit, flush, A: win.A };
};

// The Mornings page: a header, then a scroller (118 px down, to the bottom of the screen) with rows of 68 px.
const morningsPage = t => {
  const { doc } = t;
  const pageEl = doc.createElement('section'); pageEl.className = 'screen set-page';
  const header = doc.createElement('header'); header.className = 'top-bar app-bar'; header.rect = { top: 54, bottom: 118 };
  const body = doc.createElement('div'); body.className = 'settings-body'; body.overflow = true; body.padBottom = '58px';
  body.scrollTop = 0; body.clientHeight = 756; body.scrollHeight = 722; body.rect = { top: 118, bottom: 874 };
  Object.defineProperty(body, 'rect', { value: { top: 118, bottom: 874 }, writable: true });
  body.getBoundingClientRect = () => ({ ...body.rect });
  const rows = ['person', 'place', 'task'].map((k, i) => {
    const row = doc.createElement('label'); row.className = 'li state step-row';
    row.rect = { top: 418 + i * 68, bottom: 486 + i * 68 };
    const input = doc.createElement('input');
    for (const [a, v] of Object.entries({ type: 'text', id: 'set_' + k, class: 'time-val step-in', enterkeyhint: 'done' })) input.setAttribute(a, v);
    input.rect = { top: 434 + i * 68, bottom: 466 + i * 68 };
    row.append(input);
    body.append(row);
    return input;
  });
  pageEl.append(header, body);
  doc.body.append(pageEl);
  // padding at the end adds to how far it scrolls
  Object.defineProperty(body.style, 'paddingBottom', { configurable: true, get() { return this._pb || ''; }, set(v) { this._pb = v; } });
  const natural = 722;
  Object.defineProperty(body, 'scrollHeight', { configurable: true, get() { return natural + (body.style._pb ? parseFloat(body.style._pb) - 58 : 0); } });
  Object.defineProperty(body, 'scrollTop', { configurable: true, get() { return this._st || 0; }, set(v) { this._st = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight)); } });
  return { header, body, rows };
};

test('iOS: the form accessory bar is switched off once, at start', () => {
  const t = load({ platform: 'ios' });
  assert.strictEqual(JSON.stringify(t.calls), JSON.stringify([['setAccessoryBarVisible', { isVisible: false }]]));
  assert.strictEqual(t.A.Keyboard.ios, true);
});

test('Android and the browser: no accessory bar call (iOS only), and nothing throws without Capacitor', () => {
  assert.deepStrictEqual(load({ platform: 'android' }).calls, []);
  const web = load({ native: false });
  assert.deepStrictEqual(web.calls, []);
  assert.strictEqual(web.A.Keyboard.ios, false);
});

test('Return in a Mornings field closes the keyboard, and closing saves it (change)', () => {
  const t = load(), { rows } = morningsPage(t);
  let saved = 0;
  rows[0].onchange = () => saved++;
  rows[0].focus();
  const e = t.fire('keydown', rows[0], { key: 'Enter' });
  assert.ok(e.defaultPrevented);
  assert.strictEqual(t.doc.activeElement, t.doc.body);
  assert.strictEqual(saved, 1);
  // other keys, and Return while composing a word, are left alone
  rows[1].focus();
  assert.ok(!t.fire('keydown', rows[1], { key: 'a' }).defaultPrevented);
  assert.ok(!t.fire('keydown', rows[1], { key: 'Enter', isComposing: true }).defaultPrevented);
  assert.strictEqual(t.doc.activeElement, rows[1]);
});

test('Return in a form sends it (the hub connects) and the keyboard closes on submit; "next" moves to the next field', () => {
  const t = load(), { doc } = t;
  const form = doc.createElement('form');
  const url = doc.createElement('input'), code = doc.createElement('input'), send = doc.createElement('button');
  url.setAttribute('type', 'url'); url.setAttribute('enterkeyhint', 'next');
  code.setAttribute('type', 'password'); code.setAttribute('enterkeyhint', 'go');
  send.setAttribute('type', 'submit');
  form.append(url, code, send);
  doc.body.append(form);
  url.focus();
  assert.ok(t.fire('keydown', url, { key: 'Enter' }).defaultPrevented);
  assert.strictEqual(doc.activeElement, code, 'on to the access code');
  const e = t.fire('keydown', code, { key: 'Enter' });
  assert.ok(!e.defaultPrevented, 'the form sends itself');
  assert.strictEqual(doc.activeElement, code);
  t.fire('submit', form);
  assert.strictEqual(doc.activeElement, doc.body, 'and then the keyboard closes');
});

test('a tap outside the field closes the keyboard; a tap on another field or on the field\'s own row does not', () => {
  const t = load(), { header, rows } = morningsPage(t);
  rows[0].focus();
  t.fire('pointerdown', rows[1]);
  assert.strictEqual(t.doc.activeElement, rows[0], 'another field: focus moves there by itself');
  t.fire('pointerdown', rows[0].parentNode);
  assert.strictEqual(t.doc.activeElement, rows[0], 'its own row (the label) keeps it');
  t.fire('pointerdown', header);
  assert.strictEqual(t.doc.activeElement, t.doc.body, 'the header closes it');
  assert.strictEqual(rows[0].blurred, 1);
});

test('a field built in code without enterkeyhint gets "done" when focused', () => {
  const t = load(), ini = t.doc.createElement('input');
  ini.setAttribute('type', 'text');
  t.doc.body.append(ini);
  ini.focus();
  assert.strictEqual(ini.getAttribute('enterkeyhint'), 'done');
  const go = t.doc.createElement('input'); go.setAttribute('enterkeyhint', 'go'); t.doc.body.append(go); go.focus();
  assert.strictEqual(go.getAttribute('enterkeyhint'), 'go', 'its own is kept');
});

test('the field under the keyboard moves up into view by its own scroller; the page and the header stay put', () => {
  const t = load(), { header, body, rows } = morningsPage(t);
  const task = rows[2];   // "A small task", 554 to 622: under a 335 px keyboard (its top at 539)
  task.focus();
  t.flush();
  assert.strictEqual(body.scrollTop, 0, 'no keyboard yet, nothing moves');
  t.emit('keyboardWillShow', { keyboardHeight: 335 });
  const rowBottom = task.parentNode.getBoundingClientRect().bottom;
  assert.ok(rowBottom <= 874 - 335 - 16 + 0.5, `the row ends at ${rowBottom}, above the keyboard`);
  assert.ok(body.scrollTop > 0 && body.style.paddingBottom, 'the scroller got room at its end and moved');
  // the web view shrinks: innerHeight first, the layout a moment later
  t.win.innerHeight = 539;
  t.emit('resize');
  assert.ok(task.parentNode.getBoundingClientRect().bottom <= 539 - 16 + 0.5, 'still above the keyboard');
  const kept = body.scrollTop;
  body.clientHeight = 421; body.rect = { top: 118, bottom: 539 };
  t.emit('resize');
  assert.strictEqual(body.style.paddingBottom, '', 'the extra room is gone once the scroller can scroll by itself');
  assert.strictEqual(body.scrollTop, kept, 'and the field stays where it is');
  assert.deepStrictEqual(header.getBoundingClientRect(), { top: 54, bottom: 118 }, 'the header did not move');
  assert.ok(!t.calls.some(c => c[0] === 'window.scrollTo'), 'the page itself never scrolls');
  // Done: the keyboard goes, the extra room too
  t.emit('keyboardWillHide');
  t.win.innerHeight = 874; body.clientHeight = 756; body.rect = { top: 118, bottom: 874 };
  t.emit('keyboardDidHide');
  assert.strictEqual(body.style.paddingBottom, '');
});

test('a field already in view does not move', () => {
  const t = load(), { body, rows } = morningsPage(t);
  rows[0].focus();   // "Someone to message", 418 to 486: above a 335 px keyboard
  t.emit('keyboardWillShow', { keyboardHeight: 335 });
  t.win.innerHeight = 539; body.clientHeight = 421; body.rect = { top: 118, bottom: 539 };
  t.emit('resize');
  assert.strictEqual(body.scrollTop, 0);
  assert.strictEqual(body.style.paddingBottom, '');
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nkeyboard: all passed');
