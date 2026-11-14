// A small fake DOM for the node tests: enough of document and elements for the clip check's sheet (demo/js/clipcheck.js).
// Selectors: tag, #id, .class, [attr="value"], :not(...), comma lists and descendant chains. innerHTML is stored, not parsed.
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class Text {
  constructor(t) { this.nodeType = 3; this.parentNode = null; this.data = String(t); }
  get textContent() { return this.data; }
}

class El {
  constructor(tag, doc) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.parentNode = null;
    this.childNodes = []; this.attrs = {}; this.dataset = {}; this.className = ''; this.listeners = {}; this.html = '';
    this.style = { setProperty(k, v) { this[k] = v; } };
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get classList() {
    const list = () => this.className.split(/\s+/).filter(Boolean), set = l => { this.className = l.join(' '); };
    return {
      add: (...c) => set([...new Set([...list(), ...c])]),
      remove: (...c) => set(list().filter(x => !c.includes(x))),
      toggle: (c, on) => { const has = list().includes(c), want = on === undefined ? !has : !!on; if (want !== has) (want ? set([...list(), c]) : set(list().filter(x => x !== c))); return want; },
      contains: c => list().includes(c),
    };
  }
  setAttribute(k, v) {
    if (k === 'class') this.className = String(v);
    else if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = String(v);
    else this.attrs[k] = String(v);
  }
  getAttribute(k) {
    if (k === 'class') return this.className;
    if (k.startsWith('data-')) return this.dataset[camel(k.slice(5))] ?? null;
    return this.attrs[k] ?? null;
  }
  adopt(nodes) {
    const out = [];
    for (const n of nodes) {
      if (n == null) continue;
      if (n instanceof El && n.tagName === '#FRAGMENT') { out.push(...n.childNodes); n.childNodes = []; continue; }
      out.push(typeof n === 'object' ? n : new Text(n));
    }
    for (const n of out) { n.parentNode?.removeChild?.(n); n.parentNode = this; }
    return out;
  }
  removeChild(n) { this.childNodes = this.childNodes.filter(c => c !== n); n.parentNode = null; }
  append(...nodes) { this.childNodes.push(...this.adopt(nodes)); }
  prepend(...nodes) { this.childNodes.unshift(...this.adopt(nodes)); }
  after(...nodes) { const p = this.parentNode; if (!p) return; const add = p.adopt(nodes), i = p.childNodes.indexOf(this); p.childNodes.splice(i + 1, 0, ...add); }
  remove() { this.parentNode?.removeChild(this); }
  replaceChildren(...nodes) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...nodes); }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (v !== '' && v != null) this.append(String(v)); }
  get innerHTML() { return this.html; }
  set innerHTML(v) { this.replaceChildren(); this.html = String(v); }
  insertAdjacentHTML() {}
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  dispatchEvent(e) { for (const f of this.listeners[e.type] || []) f(e); this[`on${e.type}`]?.(e); return true; }
  click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); }
  scrollTo() {}
  descendants() { const out = []; for (const c of this.children) out.push(c, ...c.descendants()); return out; }
  querySelectorAll(sel) { return this.descendants().filter(e => matches(e, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) { for (let e = this; e && e.nodeType === 1; e = e.parentNode) if (matches(e, sel)) return e; return null; }
}

const compound = (e, c) => {
  const re = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]|:not\(([^)]*)\)/g;
  let m, at = 0;
  while ((m = re.exec(c)) && m.index === at) {
    at = re.lastIndex;
    if (m[1] && e.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && e.id !== m[2]) return false;
    if (m[3] && !e.classList.contains(m[3])) return false;
    if (m[4] && (m[5] === undefined ? e.getAttribute(m[4]) == null : e.getAttribute(m[4]) !== m[5])) return false;
    if (m[6] && compound(e, m[6])) return false;
  }
  if (at !== c.length) throw new Error(`fakedom: selector not supported: ${c}`);
  return true;
};
const chain = (e, parts) => {
  if (!compound(e, parts[parts.length - 1])) return false;
  let i = parts.length - 2;
  for (let p = e.parentNode; p && p.nodeType === 1 && i >= 0; p = p.parentNode) if (compound(p, parts[i])) i--;
  return i < 0;
};
const matches = (e, sel) => sel.split(',').map(s => s.trim().split(/\s+/)).some(parts => chain(e, parts));

const makeDocument = () => {
  const doc = { readyState: 'complete', hidden: false, listeners: {} };
  doc.createElement = tag => new El(tag, doc);
  doc.createDocumentFragment = () => new El('#fragment', doc);
  doc.createTextNode = t => new Text(t);
  doc.documentElement = new El('html', doc);
  doc.body = new El('body', doc);
  doc.documentElement.append(doc.body);
  doc.getElementById = id => doc.documentElement.descendants().find(e => e.id === id) ?? null;
  doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel);
  doc.addEventListener = (t, f) => { (doc.listeners[t] = doc.listeners[t] || []).push(f); };
  doc.fire = t => Promise.all((doc.listeners[t] || []).map(f => f({ type: t })));
  // the bits of index.html and of the Settings rows (gui/shell.js) the check attaches to
  const make = (tag, id, cls) => { const e = doc.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; };
  const phone = make('section', 'phone'), start = make('div', 'start', 'screen start'), dock = make('div', null, 'dock');
  dock.append(make('button', 'begin', 'kindle'));
  start.append(dock);
  const settings = make('div', 'settings', 'screen settings hidden'), body = make('div', 'settingsBody');
  const stone = make('input'); stone.type = 'checkbox'; stone.checked = true; stone.setAttribute('data-sensor', 'pulse_stone');
  const row = make('button', 'clipCheckRow', 'li state two'), state = make('span', 'clipState', 'sup'), ask = make('input', 'clipAskSw');
  ask.type = 'checkbox';
  row.append(state);
  body.append(stone, row, ask);
  settings.append(body);
  const open = make('button'); open.setAttribute('data-open', 'settings');
  phone.append(start, settings, make('div', 'crisis', 'screen talk hidden'), open);
  doc.body.append(phone);
  return doc;
};

// All text under a node, and whether a node with a class is anywhere under it.
const text = node => node?.textContent ?? '';
module.exports = { makeDocument, text, El };
