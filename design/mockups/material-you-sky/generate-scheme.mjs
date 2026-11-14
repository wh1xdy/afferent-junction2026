import fs from 'fs';
import { argbFromHex, hexFromArgb, Hct, TonalPalette, DynamicScheme, MaterialDynamicColors as M, Blend, Contrast } from '@material/material-color-utilities';

const TONAL_SPOT = 2;
const here = process.argv[2] || new URL('.', import.meta.url).pathname;
const cfg = JSON.parse(fs.readFileSync(here + 'seeds.json'));
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const ROLES = ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary', 'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'onSurface', 'surfaceVariant', 'onSurfaceVariant', 'inverseSurface', 'inverseOnSurface', 'outline', 'outlineVariant', 'shadow', 'scrim', 'surfaceTint'];

function lean(from, to, max) {
  const d = ((to - from + 540) % 360) - 180;
  return (from + Math.sign(d) * Math.min(Math.abs(d) / 2, max) + 360) % 360;
}

function scheme(s) {
  const seed = argbFromHex(s.seed), sky = Hct.fromInt(seed);
  const lantern = { hue: lean(Hct.fromInt(argbFromHex(cfg.lantern)).hue, sky.hue, 6) };
  const aurora = Hct.fromInt(Blend.harmonize(argbFromHex(s.aurora || cfg.aurora), seed));
  const ds = new DynamicScheme({
    sourceColorArgb: seed, variant: TONAL_SPOT, contrastLevel: s.contrast, isDark: s.dark,
    primaryPalette: TonalPalette.fromHueAndChroma(lantern.hue, s.lanternChroma || 44),
    secondaryPalette: TonalPalette.fromHueAndChroma(sky.hue, 16),
    tertiaryPalette: TonalPalette.fromHueAndChroma(aurora.hue, 28),
    neutralPalette: TonalPalette.fromHueAndChroma(sky.hue, s.neutralChroma),
    neutralVariantPalette: TonalPalette.fromHueAndChroma(sky.hue, s.neutralChroma + 4),
  });
  ds.errorPalette = TonalPalette.fromHueAndChroma(Math.max(55, lantern.hue - 20), 40);
  const vars = {};
  for (const r of ROLES) vars['--md-sys-color-' + kebab(r)] = hexFromArgb(M[r].getArgb(ds));
  for (const [name, c] of Object.entries(cfg.custom)) {
    const h = Hct.fromInt(argbFromHex(c.hex));
    const hue = Math.max(c.minHue || 0, h.hue), pal = TonalPalette.fromHueAndChroma(hue, Math.min(c.chroma || h.chroma, 48));
    const t = s.dark ? [80, 20, 30, 90] : [40, 100, 90, 10];
    ['', 'on-', '-container', 'on-|-container'].forEach((k, i) => {
      const [pre, post] = k.includes('|') ? k.split('|') : k.startsWith('-') ? ['', k] : [k, ''];
      vars[`--md-custom-color-${pre}${name}${post}`] = hexFromArgb(pal.tone(t[i]));
    });
  }
  return vars;
}

const tone = hex => Hct.fromInt(argbFromHex(hex)).tone;
const ratio = (a, b) => Contrast.ratioOfTones(tone(a), tone(b)).toFixed(1);
let css = '', report = {};
for (const [name, s] of Object.entries(cfg.schemes)) {
  const v = scheme(s);
  css += `.${name} {\n  color-scheme: ${s.dark ? 'dark' : 'light'};\n` + Object.entries(v).map(([k, x]) => `  ${k}: ${x};`).join('\n') + '\n}\n\n';
  const c = k => v['--md-sys-color-' + k];
  report[name] = {
    'on-surface/surface': ratio(c('on-surface'), c('surface')),
    'on-surface-variant/surface-container': ratio(c('on-surface-variant'), c('surface-container')),
    'on-primary/primary': ratio(c('on-primary'), c('primary')),
    'on-primary-container/primary-container': ratio(c('on-primary-container'), c('primary-container')),
    'on-secondary-container/secondary-container': ratio(c('on-secondary-container'), c('secondary-container')),
    'outline/surface (3:1 UI)': ratio(c('outline'), c('surface')),
  };
}
fs.writeFileSync(here + 'scheme.css', css.trimEnd() + '\n');
fs.writeFileSync(here + 'contrast-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 1));
