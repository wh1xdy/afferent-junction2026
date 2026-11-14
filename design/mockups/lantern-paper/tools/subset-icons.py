import sys
from fontTools.ttLib import TTFont
from fontTools import subset

src, out_font, out_css = sys.argv[1:4]
names = sys.argv[4].split()
font = TTFont(src)
inv = {}
for cp, g in font.getBestCmap().items():
    inv.setdefault(g, cp)
missing = [n for n in names if n not in inv]
if missing:
    sys.exit('missing: ' + ' '.join(missing))
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['rvrn']
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=[inv[n] for n in names], glyphs=[n + '.fill' for n in names if n + '.fill' in font.getGlyphOrder()])
sub.subset(font)
font.flavor = 'woff2'
font.save(out_font)
with open(out_css, 'w') as f:
    f.write('@font-face { font-family: "Material Symbols Rounded"; src: url("fonts/MaterialSymbolsRounded-subset.woff2") format("woff2"); font-weight: 100 700; font-display: block; }\n')
    for n in names:
        f.write('.i-%s::before { content: "\\%x"; }\n' % (n.replace('_', '-'), inv[n]))
