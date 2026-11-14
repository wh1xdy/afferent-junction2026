// Usage: MCU=/path/to/@material/material-color-utilities/index.js node gen-gui-tokens.mjs
// Writes design/gui-tokens.css and design/gui-tokens.json. Deterministic: same seeds.json, same output.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const design = path.resolve(here, '..');
const mcuPath = process.env.MCU || path.resolve(here, 'node_modules/@material/material-color-utilities/index.js');
const { Hct, TonalPalette, hexFromArgb, argbFromHex, Blend } = await import(mcuPath);
const seeds = JSON.parse(fs.readFileSync(path.join(here, 'seeds.json'), 'utf8'));

const hueOf = hex => Hct.fromInt(argbFromHex(hex)).hue;
const pal = (hue, chroma) => TonalPalette.fromHueAndChroma(hue, chroma);
const LANTERN = argbFromHex(seeds.lantern);
const lanternHue = hueOf(seeds.lantern);
const auroraHue = hueOf(seeds.aurora);
const skyHue = k => seeds.skies[k].hue ?? hueOf(seeds.skies[k].hex);
const dawnSkyHue = hueOf('#9FC3E0');

const DARK = { surface: 3, dim: 3, bright: 18, lowest: 1, low: 5, container: 7, high: 10, highest: 14, on: 84, onV: 68, outline: 46, outlineV: 22, p: 80, onP: 18, pc: 28, onPc: 88, s: 78, onS: 18, sc: 24, onSc: 88, inv: 84, invOn: 12, invP: 40, glow: 90 };
const schemes = {
  night:  { dark: true, rond: 100, nHue: skyHue('night'),  nC: 9,  nvC: 14, sHue: skyHue('night'),  sC: 18, t: DARK },
  aurora: { dark: true, rond: 100, nHue: skyHue('aurora'), nC: 10, nvC: 15, sHue: skyHue('aurora'), sC: 22, t: DARK },
  dawn:   { dark: true, rond: 80,  nHue: skyHue('dawn'),   nC: 5,  nvC: 9,  sHue: dawnSkyHue,       sC: 20,
            t: { ...DARK, surface: 6, dim: 6, bright: 24, lowest: 4, low: 9, container: 12, high: 16, highest: 20, on: 90, onV: 74, outline: 54, outlineV: 28, p: 82 } },
  day:    { dark: false, rond: 60, nHue: skyHue('dawn'),   nC: 6,  nvC: 10, sHue: dawnSkyHue,       sC: 18,
            t: { surface: 97, dim: 87, bright: 98, lowest: 100, low: 95, container: 93, high: 91, highest: 89, on: 10, onV: 30, outline: 48, outlineV: 80, p: 40, onP: 100, pc: 88, onPc: 28, s: 40, onS: 100, sc: 88, onSc: 24, inv: 20, invOn: 95, invP: 80, glow: 70 } },
  clinic: { dark: true, rond: 0, nHue: skyHue('clinic'),  nC: 6,  nvC: 9,  sHue: skyHue('clinic'), sC: 12,
            t: { ...DARK, surface: 4, dim: 4, bright: 20, lowest: 2, low: 6, container: 8, high: 11, highest: 15, on: 93, onV: 76, outline: 52, outlineV: 20, p: 82 } },
};
const ROOM = { on: 74, onV: 60, outline: 40, p: 70, onP: 12, pc: 22, onPc: 76, s: 64, onSc: 76, glow: 72 };

const stateHue = (name, hex) => {
  let h = Hct.fromInt(Blend.harmonize(argbFromHex(hex), LANTERN)).hue;
  if (name === 'booster') h = Math.min(Math.max(h, 55), 62);
  return h;
};
const STATE_C = { stable: 36, watch: 16, call: 44, booster: 48, simulated: 36 };

const toHex = a => hexFromArgb(a).toUpperCase();
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };

const out = { color: {}, palettes: {}, contrast: {} };
for (const [k, s] of Object.entries(schemes)) {
  const t = s.t;
  const P = pal(lanternHue, k === 'clinic' ? 40 : 44), S = pal(s.sHue, s.sC), T = pal(auroraHue, 30);
  const N = pal(s.nHue, s.nC), NV = pal(s.nHue, s.nvC);
  const r = {
    'primary': P.tone(t.p), 'on-primary': P.tone(t.onP), 'primary-container': P.tone(t.pc), 'on-primary-container': P.tone(t.onPc),
    'secondary': S.tone(t.s), 'on-secondary': S.tone(t.onS), 'secondary-container': S.tone(t.sc), 'on-secondary-container': S.tone(t.onSc),
    'tertiary': T.tone(t.s), 'on-tertiary': T.tone(t.onS), 'tertiary-container': T.tone(s.dark ? 26 : 88), 'on-tertiary-container': T.tone(s.dark ? 88 : 24),
    'error': pal(58, 40).tone(s.dark ? 80 : 40), 'on-error': pal(58, 40).tone(s.dark ? 18 : 100), 'error-container': pal(58, 40).tone(s.dark ? 26 : 88), 'on-error-container': pal(58, 40).tone(s.dark ? 88 : 24),
    'surface': N.tone(t.surface), 'surface-dim': N.tone(t.dim), 'surface-bright': N.tone(t.bright),
    'surface-container-lowest': N.tone(t.lowest), 'surface-container-low': N.tone(t.low), 'surface-container': N.tone(t.container),
    'surface-container-high': N.tone(t.high), 'surface-container-highest': N.tone(t.highest),
    'on-surface': N.tone(t.on), 'on-surface-variant': NV.tone(t.onV), 'outline': NV.tone(t.outline), 'outline-variant': NV.tone(t.outlineV),
    'inverse-surface': N.tone(t.inv), 'inverse-on-surface': N.tone(t.invOn), 'inverse-primary': P.tone(t.invP),
    'surface-tint': P.tone(t.p), 'scrim': 0xff000000, 'shadow': 0xff000000,
    'lantern-glow': P.tone(t.glow), 'lantern-flame': P.tone(s.dark ? 96 : 60),
  };
  for (const [name, hex] of Object.entries(seeds.states)) {
    const sp = pal(stateHue(name, hex), STATE_C[name]);
    r[`${name}`] = sp.tone(s.dark ? (name === 'watch' || name === 'call' ? 84 : 80) : 40);
    r[`on-${name}`] = sp.tone(s.dark ? 18 : 100);
    r[`${name}-container`] = sp.tone(s.dark ? (name === 'booster' ? 26 : 22) : 90);
    r[`on-${name}-container`] = sp.tone(s.dark ? 90 : 20);
  }
  const hex = Object.fromEntries(Object.entries(r).map(([n, v]) => [n, toHex(v)]));
  out.color[k] = { colorScheme: s.dark ? 'dark' : 'light', rond: s.rond, roles: hex };
  out.palettes[k] = {
    primary: Object.fromEntries([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100].map(x => [x, toHex(P.tone(x))])),
    secondary: Object.fromEntries([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100].map(x => [x, toHex(S.tone(x))])),
    neutral: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 18, 20, 24, 30, 50, 70, 84, 87, 90, 93, 95, 97, 98, 100].map(x => [x, toHex(N.tone(x))])),
  };
  if (s.dark && k !== 'clinic') {
    const room = {
      'on-surface': N.tone(ROOM.on), 'on-surface-variant': NV.tone(ROOM.onV), 'outline': NV.tone(ROOM.outline),
      'primary': P.tone(ROOM.p), 'on-primary': P.tone(ROOM.onP), 'primary-container': P.tone(ROOM.pc), 'on-primary-container': P.tone(ROOM.onPc),
      'secondary': S.tone(ROOM.s), 'on-secondary-container': S.tone(ROOM.onSc), 'lantern-glow': P.tone(ROOM.glow), 'lantern-flame': P.tone(80),
    };
    out.color[k].darkRoom = Object.fromEntries(Object.entries(room).map(([n, v]) => [n, toHex(v)]));
  }
  const c = hex, pairs = {
    'on-surface / surface': [c['on-surface'], c.surface, 4.5],
    'on-surface / surface-container-highest': [c['on-surface'], c['surface-container-highest'], 4.5],
    'on-surface-variant / surface': [c['on-surface-variant'], c.surface, 4.5],
    'on-surface-variant / surface-container-highest': [c['on-surface-variant'], c['surface-container-highest'], 4.5],
    'primary / surface': [c.primary, c.surface, 3],
    'on-primary / primary': [c['on-primary'], c.primary, 4.5],
    'on-primary-container / primary-container': [c['on-primary-container'], c['primary-container'], 4.5],
    'on-secondary-container / secondary-container': [c['on-secondary-container'], c['secondary-container'], 4.5],
    'on-tertiary-container / tertiary-container': [c['on-tertiary-container'], c['tertiary-container'], 4.5],
    'outline / surface (non-text)': [c.outline, c.surface, 3],
    'inverse-on-surface / inverse-surface': [c['inverse-on-surface'], c['inverse-surface'], 4.5],
  };
  for (const n of Object.keys(seeds.states)) {
    pairs[`on-${n}-container / ${n}-container`] = [c[`on-${n}-container`], c[`${n}-container`], 4.5];
    pairs[`${n} / surface`] = [c[n], c.surface, 3];
  }
  if (out.color[k].darkRoom) {
    const d = out.color[k].darkRoom;
    pairs['dark-room on-surface / surface'] = [d['on-surface'], c.surface, 4.5];
    pairs['dark-room on-surface-variant / surface'] = [d['on-surface-variant'], c.surface, 4.5];
    pairs['dark-room on-surface-variant / surface-container-high'] = [d['on-surface-variant'], c['surface-container-high'], 4.5];
    pairs['dark-room on-primary-container / primary-container'] = [d['on-primary-container'], d['primary-container'], 4.5];
    pairs['dark-room on-primary / primary'] = [d['on-primary'], d.primary, 4.5];
  }
  out.contrast[k] = Object.fromEntries(Object.entries(pairs).map(([n, [a, b, min]]) => {
    const v = ratio(a, b); return [n, { ratio: v, min, pass: v >= min }];
  }));
}

const mood = { 1: ['#34476E', 0.35], 2: ['#5A7CA6', 0.5], 3: ['#A9A79A', 0.65], 4: ['#E8B867', 0.82], 5: ['#FFCB5C', 1] };

const type = {
  'display-large':   [57, 64, -0.25, 360, 'expressive'], 'display-medium': [45, 52, 0, 360, 'expressive'], 'display-small': [36, 44, 0, 380, 'expressive'],
  'headline-large':  [32, 40, 0, 400, 'expressive'], 'headline-medium': [28, 36, 0, 400, 'expressive'], 'headline-small': [24, 32, 0, 400, 'expressive'],
  'title-large':     [22, 28, 0, 400, 'expressive'], 'title-medium': [16, 24, 0.15, 500, 'plain'], 'title-small': [14, 20, 0.1, 500, 'plain'],
  'body-large':      [16, 24, 0.5, 400, 'plain'], 'body-medium': [14, 20, 0.25, 400, 'plain'], 'body-small': [12, 16, 0.4, 400, 'plain'],
  'label-large':     [14, 20, 0.1, 500, 'plain'], 'label-medium': [12, 16, 0.5, 500, 'plain'], 'label-small': [11, 16, 0.5, 500, 'plain'],
};
const shape = { none: 0, 'extra-small': 4, small: 8, medium: 12, large: 16, 'large-increased': 20, 'extra-large': 28, 'extra-large-increased': 32, 'extra-extra-large': 48, full: 9999 };
const motion = {
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)', 'standard-decelerate': 'cubic-bezier(0, 0, 0, 1)', 'standard-accelerate': 'cubic-bezier(0.3, 0, 1, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)', 'emphasized-decelerate': 'cubic-bezier(0.05, 0.7, 0.1, 1)', 'emphasized-accelerate': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
    breath: 'cubic-bezier(0.45, 0, 0.55, 1)',
  },
  duration: { short1: 50, short2: 100, short3: 150, short4: 200, medium1: 250, medium2: 300, medium3: 350, medium4: 400, long1: 450, long2: 500, long3: 550, long4: 600, 'extra-long1': 700, 'extra-long2': 800, 'extra-long3': 900, 'extra-long4': 1000 },
  spring: { 'spatial-fast': [0.9, 1400], 'spatial-default': [0.9, 700], 'spatial-slow': [0.9, 300], 'effects-fast': [1, 3800], 'effects-default': [1, 1600], 'effects-slow': [1, 800] },
  afferent: { sky: 4000, 'breath-in': 4000, 'breath-out': 6000, 'glow-loop': 10000, 'question-advance': 600, 'lantern-timeout': 10000, 'sheet-enter': 400, 'sheet-exit': 200 },
};
const state = { hover: 0.08, focus: 0.10, pressed: 0.10, dragged: 0.16, 'disabled-content': 0.38, 'disabled-container': 0.12 };
const size = { 'touch-target': 48, icon: 24, 'icon-button': 48, 'button-height': 56, 'button-height-small': 48, 'list-one-line': 56, 'list-two-line': 72, 'answer-min': 72, 'contact-row': 80, 'call-button': 56, 'begin-lantern': 104, 'top-app-bar': 64, 'nav-rail': 96, 'gutter-phone': 16, 'focus-ring': 3, 'focus-offset': 2 };

const json = {
  name: 'afferent-gui-tokens', version: '1.0.0',
  about: 'Material 3 system tokens for the Afferent GUI, generated by design/tools/gen-gui-tokens.mjs from tools/seeds.json with Material Color Utilities. Do not edit by hand. design/tokens.json stays the source for game, world, mood and bedside colours.',
  seeds, color: out.color, palettes: out.palettes, contrast: out.contrast,
  mood: Object.fromEntries(Object.entries(mood).map(([k, [h, g]]) => [k, { hex: h, glow: g }])),
  typeface: { brand: 'Google Sans Flex', plain: 'Google Sans Flex', mono: 'JetBrains Mono', icons: 'Material Symbols Rounded', axes: 'opsz 6-144, wght 200-700, ROND 0-100 (wdth 100, GRAD 0 pinned)' },
  typescale: Object.fromEntries(Object.entries(type).map(([k, [s, l, ls, w, f]]) => [k, { size: s, lineHeight: l, tracking: ls, weight: w, rond: f === 'expressive' ? 'scheme' : 0 }])),
  shape, state, motion, size,
  elevation: { 'level0': 'surface', 'level1': 'surface-container-low', 'level2': 'surface-container', 'level3': 'surface-container-high', 'level4': 'surface-container-highest', 'level5': 'surface-bright', note: 'Tonal only. No drop shadows. The only light is the lantern glow.' },
};
fs.writeFileSync(path.join(design, 'gui-tokens.json'), JSON.stringify(json, null, 2) + '\n');

const L = [];
L.push('/* Afferent GUI tokens. Generated by design/tools/gen-gui-tokens.mjs (Material Color Utilities, seeds in tools/seeds.json). Do not edit by hand. */');
L.push('');
const roleNames = Object.keys(out.color.night.roles);
for (const n of roleNames) L.push(`@property --md-sys-color-${n} { syntax: "<color>"; inherits: true; initial-value: #000000; }`);
L.push('');
L.push(':root {');
L.push('  --md-ref-typeface-brand: "Google Sans Flex", system-ui, sans-serif;');
L.push('  --md-ref-typeface-plain: "Google Sans Flex", system-ui, sans-serif;');
L.push('  --md-ref-typeface-mono: "JetBrains Mono", ui-monospace, monospace;');
L.push('  --md-ref-typeface-icons: "Material Symbols Rounded";');
for (const [k, [s, l, ls, w, f]] of Object.entries(type)) {
  L.push(`  --md-sys-typescale-${k}-size: ${s}px; --md-sys-typescale-${k}-line-height: ${l}px; --md-sys-typescale-${k}-tracking: ${ls}px; --md-sys-typescale-${k}-weight: ${w}; --md-sys-typescale-${k}-rond: ${f === 'expressive' ? 'var(--af-rond)' : '0'};`);
}
for (const [k, v] of Object.entries(shape)) L.push(`  --md-sys-shape-corner-${k}: ${v}px;`);
for (const [k, v] of Object.entries(state)) L.push(`  --md-sys-state-${k}-opacity: ${v};`);
for (const [k, v] of Object.entries(motion.easing)) L.push(`  --md-sys-motion-easing-${k}: ${v};`);
for (const [k, v] of Object.entries(motion.duration)) L.push(`  --md-sys-motion-duration-${k}: ${v}ms;`);
for (const [k, [d, st]] of Object.entries(motion.spring)) L.push(`  --md-sys-motion-spring-${k}-damping: ${d}; --md-sys-motion-spring-${k}-stiffness: ${st};`);
for (const [k, v] of Object.entries(motion.afferent)) L.push(`  --af-motion-${k}: ${v}ms;`);
for (const [k, v] of Object.entries(size)) L.push(`  --af-size-${k}: ${v}px;`);
for (const [k, { hex, glow }] of Object.entries(json.mood)) L.push(`  --af-mood-${k}: ${hex}; --af-mood-${k}-glow: ${glow};`);
L.push('}');
L.push('');
const block = (sel, k) => {
  const c = out.color[k];
  L.push(`${sel} {`);
  L.push(`  color-scheme: ${c.colorScheme};`);
  L.push(`  --af-rond: ${c.rond};`);
  for (const [n, v] of Object.entries(c.roles)) L.push(`  --md-sys-color-${n}: ${v};`);
  L.push(`  transition: ${['surface', 'on-surface', 'on-surface-variant', 'primary', 'primary-container', 'secondary-container', 'surface-container', 'surface-container-high', 'surface-container-lowest', 'lantern-glow'].map(n => `--md-sys-color-${n} var(--af-motion-sky) var(--md-sys-motion-easing-breath)`).join(', ')};`);
  L.push('}');
  if (c.darkRoom) {
    L.push(`${sel.split(',').map(x => x.trim() + '[data-room="dark"]').join(', ')} {`);
    for (const [n, v] of Object.entries(c.darkRoom)) L.push(`  --md-sys-color-${n}: ${v};`);
    L.push('  --af-glow-strength: 0.5;');
    L.push('}');
  }
  L.push('');
};
block(':root, [data-sky="night"]', 'night');
for (const k of ['aurora', 'dawn', 'day', 'clinic']) block(`[data-sky="${k}"]`, k);
L.push(':root { --af-glow-strength: 1; }');
L.push('');
L.push('@media (prefers-reduced-motion: reduce) {');
L.push('  :root { --md-sys-motion-duration-short1: 0ms; --md-sys-motion-duration-short2: 0ms; --md-sys-motion-duration-short3: 0ms; --md-sys-motion-duration-short4: 0ms; --md-sys-motion-duration-medium1: 0ms; --md-sys-motion-duration-medium2: 0ms; --md-sys-motion-duration-medium3: 0ms; --md-sys-motion-duration-medium4: 0ms; --md-sys-motion-duration-long1: 150ms; --md-sys-motion-duration-long2: 150ms; --af-motion-sheet-enter: 150ms; --af-motion-sheet-exit: 100ms; --af-motion-glow-loop: 0ms; }');
L.push('}');
L.push('[data-motion="reduced"] { --md-sys-motion-duration-short1: 0ms; --md-sys-motion-duration-short2: 0ms; --md-sys-motion-duration-short3: 0ms; --md-sys-motion-duration-short4: 0ms; --md-sys-motion-duration-medium1: 0ms; --md-sys-motion-duration-medium2: 0ms; --md-sys-motion-duration-medium3: 0ms; --md-sys-motion-duration-medium4: 0ms; --md-sys-motion-duration-long1: 150ms; --md-sys-motion-duration-long2: 150ms; --af-motion-sheet-enter: 150ms; --af-motion-sheet-exit: 100ms; --af-motion-glow-loop: 0ms; }');
fs.writeFileSync(path.join(design, 'gui-tokens.css'), L.join('\n') + '\n');

let fails = 0;
for (const [k, pairs] of Object.entries(out.contrast)) for (const [n, { ratio: v, min, pass }] of Object.entries(pairs)) if (!pass) { fails++; console.log(`FAIL ${k}: ${n} ${v} < ${min}`); }
console.log(fails ? `${fails} contrast failures` : 'all contrast pairs pass');
