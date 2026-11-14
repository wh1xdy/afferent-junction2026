import math, random
random.seed(7)
SH=205
def bez(p0,p1,p2,p3,t):
    u=1-t
    return tuple(u**3*a+3*u*u*t*b+3*u*t*t*c+t**3*d for a,b,c,d in zip(p0,p1,p2,p3))
segs=[((-60,560),(170,370),(380,490),(548,385)),((548,385),(716,280),(870,310),(1084,200))]
pts=[]
for s in segs:
    for i in range(400): pts.append(bez(*s,i/400))
def band_y(x):
    best=min(pts,key=lambda p:abs(p[0]-x)); return best[1]
o=[]
W=1024
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">')
o.append('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060F1C"/><stop offset="0.45" stop-color="#12233D"/><stop offset="0.68" stop-color="#22395C"/><stop offset="0.74" stop-color="#2E4A70"/></linearGradient>
<linearGradient id="ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#B8F5C4" stop-opacity="0"/><stop offset="0.07" stop-color="#B8F5C4" stop-opacity="0.95"/><stop offset="0.25" stop-color="#7EE0B0" stop-opacity="0.65"/><stop offset="0.7" stop-color="#5FC8C8" stop-opacity="0.18"/><stop offset="1" stop-color="#8C7FE0" stop-opacity="0"/></linearGradient>
<linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9FE8B4" stop-opacity="0"/><stop offset="0.2" stop-color="#9FE8B4" stop-opacity="0.9"/><stop offset="0.65" stop-color="#6ED8C8" stop-opacity="0.85"/><stop offset="1" stop-color="#A9A2F2" stop-opacity="0.15"/></linearGradient>
<linearGradient id="snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9AAECD"/><stop offset="0.45" stop-color="#6A80A8"/><stop offset="1" stop-color="#34466B"/></linearGradient>
<linearGradient id="snow2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#AFC0DB"/><stop offset="1" stop-color="#5E739B"/></linearGradient>
<linearGradient id="roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF3FC"/><stop offset="1" stop-color="#B4C3DC"/></linearGradient>
<linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1C2"/><stop offset="1" stop-color="#FFB833"/></linearGradient>
<linearGradient id="logs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E4A32"/><stop offset="1" stop-color="#4B3020"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFD27A" stop-opacity="0.75"/><stop offset="0.35" stop-color="#F2B030" stop-opacity="0.28"/><stop offset="1" stop-color="#F2B030" stop-opacity="0"/></radialGradient>
<radialGradient id="spill" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFD9A0" stop-opacity="0.7"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient>
<radialGradient id="moonglow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#E8EEFF" stop-opacity="0.35"/><stop offset="1" stop-color="#E8EEFF" stop-opacity="0"/></radialGradient>
<radialGradient id="sparkle" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#C8D8FF" stop-opacity="0"/></radialGradient>
<linearGradient id="roofshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6F84AC" stop-opacity="0.38"/><stop offset="0.5" stop-color="#6F84AC" stop-opacity="0.08"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.12"/></linearGradient>
<linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6FAFF" stop-opacity="0.98"/><stop offset="0.55" stop-color="#C9DCF4" stop-opacity="0.9"/><stop offset="1" stop-color="#9FC4EE" stop-opacity="0.75"/></linearGradient>
<linearGradient id="snowU" gradientUnits="userSpaceOnUse" x1="0" y1="705" x2="0" y2="1044"><stop offset="0" stop-color="#9AAECD"/><stop offset="0.45" stop-color="#6A80A8"/><stop offset="1" stop-color="#34466B"/></linearGradient>
<linearGradient id="driftTop" gradientUnits="userSpaceOnUse" x1="0" y1="740" x2="0" y2="800"><stop offset="0" stop-color="#C3D1E7" stop-opacity="0.9"/><stop offset="1" stop-color="#C3D1E7" stop-opacity="0"/></linearGradient>
<filter id="b2" filterUnits="userSpaceOnUse" x="-100" y="-100" width="1224" height="1224"><feGaussianBlur stdDeviation="1.4"/></filter>
<filter id="b12" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feGaussianBlur stdDeviation="12"/></filter>
<filter id="b26" filterUnits="userSpaceOnUse" x="-100" y="-100" width="1224" height="1224"><feGaussianBlur stdDeviation="26"/></filter>
</defs>''')
o.append(f'<rect width="{W}" height="{W}" fill="url(#sky)"/>')
# stars
TW=[(140,90),(470,60),(700,250),(930,330)]
for _ in range(190):
    x=random.uniform(10,1014); y=random.uniform(10,600)
    if band_y(x)-40 < y < band_y(x)+30: continue
    if any((x-a)**2+(y-b)**2 < 30**2 for a,b in TW) or (x-842)**2+(y-150)**2 < 45**2: continue
    r=random.choice([0.9,1.1,1.3,1.6,1.6,2.0,2.4,3.0]); a=random.uniform(0.3,0.95)
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="#EEF3FF" opacity="{a:.2f}"/>')
for x,y in TW:
    R=12; r=2.2
    o.append(f'<circle cx="{x}" cy="{y}" r="9" fill="url(#sparkle)"/>')
    o.append(f'<path d="M{x} {y-R} C{x+r*0.5} {y-r} {x+r} {y-r*0.5} {x+R} {y} C{x+r} {y+r*0.5} {x+r*0.5} {y+r} {x} {y+R} C{x-r*0.5} {y+r} {x-r} {y+r*0.5} {x-R} {y} C{x-r} {y-r*0.5} {x-r*0.5} {y-r} {x} {y-R} Z" fill="#FFFFFF" opacity="0.92"/>')
o.append('<circle cx="842" cy="150" r="70" fill="url(#moonglow)"/><circle cx="842" cy="150" r="9" fill="#F4F7FF" opacity="0.9"/>')
# aurora: soft band + curtain rays
d=' '.join(('M' if i==0 else 'L')+f'{x:.1f} {y:.1f}' for i,(x,y) in enumerate(pts[::8]))
o.append(f'<path d="{d}" fill="none" stroke="url(#band)" stroke-width="110" stroke-linecap="round" filter="url(#b26)" opacity="0.95"/>')
o.append('<g>')
x=-30
while x<1060:
    yb=band_y(x)+10
    h=170+70*math.sin(x/37)+50*math.sin(x/11.3)+random.uniform(-20,20)
    w=random.uniform(1.2,2.8)
    a=(0.12+0.38*(0.5+0.5*math.sin(x/53)))*random.choice([0.6,0.8,1,1,1.3,1.8])
    o.append(f'<rect x="{x:.1f}" y="{yb-h:.1f}" width="{w:.1f}" height="{h:.1f}" fill="url(#ray)" opacity="{a:.2f}"/>')
    x+=random.uniform(1.8,6.5)
o.append('</g>')
o.append('<linearGradient id="hl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E6FFE0" stop-opacity="0"/><stop offset="0.25" stop-color="#E6FFE0" stop-opacity="0.55"/><stop offset="0.55" stop-color="#F0FFEA" stop-opacity="0.8"/><stop offset="0.85" stop-color="#E6FFE0" stop-opacity="0.45"/><stop offset="1" stop-color="#E6FFE0" stop-opacity="0.1"/></linearGradient>')
o.append(f'<path d="{d}" fill="none" stroke="url(#hl)" stroke-width="2.6" stroke-linecap="round"/>')
# far mountains and hills
o.append('<path d="M-20 650 L90 590 L170 625 L260 560 L360 618 L430 600 L520 640 L610 585 L700 630 L790 575 L880 620 L960 590 L1044 615 L1044 760 L-20 760 Z" fill="#1A2D4B"/>')
o.append('<path d="M-20 690 C140 640 300 670 460 655 C640 638 820 662 1044 640 L1044 780 L-20 780 Z" fill="#22395E"/>')
PINE_N=[0]
def pine(cx,base,h,col='#0C1829',snowc='#B9C7DD'):
    PINE_N[0]+=1; pid=f'pine{PINE_N[0]}'
    w=h*0.42; tiers=4; shapes=[]; snow=[]
    for k in range(tiers):
        tt=base-h*k/tiers*0.82; top=tt-h*0.42; ww=w*(1-k*0.18)
        shapes.append(f'M{cx-ww:.1f} {tt:.1f} L{cx:.1f} {top:.1f} L{cx+ww:.1f} {tt:.1f} Z')
        # snow resting on the left slope of each tier, inside the tier
        a=0.18; b=0.78
        x1,y1=cx-ww*b, tt-(top-tt)*-1*(1-b)*0+0
        H_=tt-top
        snow.append(f'M{cx-ww-8:.1f} {tt+2:.1f} L{cx:.1f} {top-6:.1f} L{cx+ww*0.06:.1f} {top+H_*0.16:.1f} L{cx-ww*0.62:.1f} {tt+2:.1f} Z')
    d=' '.join(shapes)
    o=[f'<clipPath id="{pid}"><path d="{d}"/></clipPath>',
       f'<rect x="{cx-h*0.035:.1f}" y="{base-h*0.12:.1f}" width="{h*0.07:.1f}" height="{h*0.16:.1f}" fill="{col}"/>',
       f'<path d="{d}" fill="{col}"/>',
       f'<path d="{" ".join(snow)}" fill="{snowc}" opacity="0.30" clip-path="url(#{pid})"/>']
    return ''.join(o)
for cx,h in [(40,150),(105,230),(180,190),(250,140),(330,175),(400,120),(985,200),(1045,250)]:
    o.append(pine(cx,735,h))
# snow ground
o.append('<path d="M-20 730 C160 700 330 722 512 712 C700 702 860 726 1044 706 L1044 1044 L-20 1044 Z" fill="url(#snowU)"/>')
o.append('<g transform="translate(205 0)">')
# cabin glow behind
o.append('<circle cx="512" cy="680" r="300" fill="url(#glow)"/>')
# cabin
cx=512; L,R=362,662; top,base=618,792
o.append(f'<rect x="{L}" y="{top}" width="{R-L}" height="{base-top}" fill="url(#logs)"/>')
for y in range(top+16, base, 19):
    o.append(f'<line x1="{L}" y1="{y}" x2="{R}" y2="{y}" stroke="#3A2416" stroke-width="3.5" opacity="0.7"/>')
for y in range(top+6, base-6, 19):
    for k in range(5):
        x1=random.uniform(L+8,R-60); ln=random.uniform(18,60)
        o.append(f'<line x1="{x1:.0f}" y1="{y+random.uniform(-3,3):.1f}" x2="{x1+ln:.0f}" y2="{y+random.uniform(-3,3):.1f}" stroke="#8A6244" stroke-width="1.2" opacity="0.55" stroke-linecap="round"/>')
for xx in (L-6, R+6):
    o.append(f'<rect x="{min(xx,L)}" y="{top}" width="{abs(xx-L) if xx<L else abs(xx-R)}" height="{base-top}" fill="#4A2F1F"/>' if xx<L else f'<rect x="{R}" y="{top}" width="{xx-R}" height="{base-top}" fill="#4A2F1F"/>')
for k in range(9):
    y0=top-3+19*k; y1=min(y0+19, base)
    if y1-y0 < 12: break
    for xx in (L-6, R+6):
        hh=(y1-y0)/2; yc=(y0+y1)/2; rr=12.6
        dx=math.sqrt(rr*rr-hh*hh)
        d=f'M{xx-dx:.2f} {y0:.2f} L{xx+dx:.2f} {y0:.2f} A{rr} {rr} 0 0 1 {xx+dx:.2f} {y1:.2f} L{xx-dx:.2f} {y1:.2f} A{rr} {rr} 0 0 1 {xx-dx:.2f} {y0:.2f} Z'
        o.append(f'<path d="{d}" fill="#7A5338" stroke="#3A2416" stroke-width="1.8" stroke-linejoin="round"/>')
        o.append(f'<circle cx="{xx:.2f}" cy="{yc:.2f}" r="7.4" fill="none" stroke="#5B3B27" stroke-width="1" opacity="0.75"/>')
        o.append(f'<circle cx="{xx:.2f}" cy="{yc:.2f}" r="4.2" fill="none" stroke="#5B3B27" stroke-width="1" opacity="0.7"/>')
        o.append(f'<circle cx="{xx:.2f}" cy="{yc:.2f}" r="1.6" fill="#4A2F1F" opacity="0.8"/>')
        o.append(f'<path d="M{xx-dx-1.5:.2f} {y0+2.5:.2f} A{rr-1.5} {rr-1.5} 0 0 0 {xx-dx-1.5:.2f} {y1-2.5:.2f}" fill="none" stroke="#9A6E4E" stroke-width="1.3" opacity="0.55" stroke-linecap="round"/>')
o.append(f'<path d="M{L-10} {top+4} L{cx} 492 L{R+10} {top+4} Z" fill="#5A3A26"/>')
for y in range(520, top, 19):
    half=(y-492)/(top+4-492)*((R+10-L+10)/2)
    o.append(f'<line x1="{cx-half+6:.0f}" y1="{y}" x2="{cx+half-6:.0f}" y2="{y}" stroke="#3A2416" stroke-width="3" opacity="0.55"/>')
# chimney + smoke
o.append('<rect x="582" y="478" width="44" height="86" fill="#5E3E2A"/><rect x="576" y="470" width="56" height="16" rx="4" fill="#EEF3FB"/>')
o.append('<path d="M604 462 C580 420 630 400 606 360 C586 326 620 300 640 270" fill="none" stroke="#DDE5F2" stroke-width="22" stroke-linecap="round" opacity="0.28" filter="url(#b12)"/>')
# roof with snow
def icicle(x, y0, vis, w):
    L_=vis+12; tip=y0+L_
    n=3 if vis>22 else 2
    lp=[]; rp=[]
    for j in range(n+1):
        t=j/n; yy=y0+L_*t*0.92
        ww=w*(1-t*0.92)*(1+0.18*math.sin(t*9+x))
        lp.append((x-ww+random.uniform(-0.4,0.4), yy)); rp.append((x+ww*0.9+random.uniform(-0.4,0.4), yy))
    d=f'M{lp[0][0]:.1f} {lp[0][1]:.1f} '+' '.join(f'L{a:.1f} {b:.1f}' for a,b in lp[1:])+f' Q{x-0.6:.1f} {tip-1:.1f} {x+0.2:.1f} {tip:.1f} Q{x+0.8:.1f} {tip-1:.1f} '+' '.join(f'{"L" if k else ""}{a:.1f} {b:.1f}' for k,(a,b) in enumerate(reversed(rp)))+' Z'
    out=[f'<path d="{d}" fill="url(#ice)" stroke="#E9F2FF" stroke-width="0.5" stroke-opacity="0.6"/>']
    out.append(f'<path d="M{x-w*0.45:.1f} {y0+8:.1f} L{x-w*0.15:.1f} {y0+L_*0.8:.1f}" stroke="#FFFFFF" stroke-width="{max(0.7,w*0.28):.1f}" stroke-linecap="round" opacity="0.75"/>')
    if vis>18 and random.random()<0.6:
        out.append(f'<ellipse cx="{x+0.2:.1f}" cy="{tip+2.6:.1f}" rx="1.1" ry="1.6" fill="#DDEBFF" opacity="0.85"/>')
    return ''.join(out)
xs=[]; x=L-50
while x<R+50:
    xs.append(x); x+=random.uniform(9,17)
long_set={int(len(xs)*f) for f in (0.06,0.17,0.3,0.44,0.7,0.83,0.95)}
for k,x in enumerate(xs):
    if abs(x-(L-6))<16 or abs(x-(R+6))<16: continue
    vis=random.uniform(30,56) if k in long_set else random.uniform(6,17)
    if L+40 < x < R-40 and abs(x-512)<60: vis=min(vis,14)
    w=3.4 if vis>25 else random.uniform(2.2,3.0)
    o.append(icicle(x, top+22, vis, w))
roofd=f"M{L-58} {top+12} L{cx-30} 486 Q{cx} 456 {cx+30} 486 L{R+58} {top+12} Q{R+70} {top+24} {R+50} {top+34} C{R+10} {top+40} {cx+120} {top+30} {cx} {top+34} C{cx-120} {top+38} {L-10} {top+30} {L-50} {top+34} Q{L-70} {top+24} {L-58} {top+12} Z"
o.append(f'<clipPath id="roofclip"><path d="{roofd}"/></clipPath>')
o.append(f'<path d="{roofd}" fill="url(#roof)"/>')
o.append(f'<g clip-path="url(#roofclip)">')
o.append(f'<rect x="{L-80}" y="440" width="{R-L+160}" height="{top-380}" fill="url(#roofshade)"/>')
for k in range(7):
    t=(k+0.5)/7; x=L-50+t*(cx-(L-50)); y=top+12-(top+12-480)*t
    o.append(f'<ellipse cx="{x:.1f}" cy="{y+16:.1f}" rx="{random.uniform(18,30):.1f}" ry="{random.uniform(5,8):.1f}" fill="#FFFFFF" opacity="0.10" transform="rotate(-37 {x:.1f} {y+16:.1f})"/>')
for k in range(7):
    t=(k+0.5)/7; x=cx+t*((R+50)-cx); y=480+(top+12-480)*t
    o.append(f'<ellipse cx="{x:.1f}" cy="{y+16:.1f}" rx="{random.uniform(18,30):.1f}" ry="{random.uniform(5,8):.1f}" fill="#FFFFFF" opacity="0.16" transform="rotate(37 {x:.1f} {y+16:.1f})"/>')
o.append(f'<path d="M{L-60} {top+30} C{L+60} {top+22} {cx-100} {top+34} {cx} {top+28} C{cx+110} {top+22} {R} {top+34} {R+60} {top+30}" fill="none" stroke="#8EA1C2" stroke-width="7" opacity="0.35"/>')
o.append('</g>')
o.append(f'<path d="M{L-48} {top+10} L{cx-30} 490 Q{cx} 462 {cx+30} 490 L{R+48} {top+10}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity="0.75"/>')
# window
wx0,wy0,ww,wh=466,686,92,62
o.append(f'<circle cx="{wx0+ww/2}" cy="{wy0+wh/2}" r="110" fill="url(#glow)" opacity="0.75"/>')
o.append(f'<rect x="{wx0-10}" y="{wy0-10}" width="{ww+20}" height="{wh+20}" rx="8" fill="#E9E1D2"/>')
o.append(f'<rect x="{wx0}" y="{wy0}" width="{ww}" height="{wh}" rx="4" fill="url(#win)"/>')
o.append(f'<line x1="{wx0+ww/2}" y1="{wy0}" x2="{wx0+ww/2}" y2="{wy0+wh}" stroke="#5A3A26" stroke-width="8"/><line x1="{wx0}" y1="{wy0+wh/2}" x2="{wx0+ww}" y2="{wy0+wh/2}" stroke="#5A3A26" stroke-width="8"/>')
o.append(f'<path d="M{wx0+6} {wy0+6} L{wx0+26} {wy0+6} L{wx0+6} {wy0+30} Z" fill="#FFFFFF" opacity="0.35"/>')
o.append(f'<rect x="{wx0-16}" y="{wy0+wh+8}" width="{ww+32}" height="12" rx="4" fill="#F4F7FC"/>')
# door
o.append('<rect x="588" y="690" width="50" height="102" rx="6" fill="#3B2518"/><circle cx="628" cy="732" r="4" fill="#E8C27A"/>')
# snow drift at the base and warm light on the snow
o.append(f'<path d="M{L-70} {base+10} C{L-40} {base-6} {L-10} {base-9} {L+40} {base-8} C{cx-60} {base-6} {cx+60} {base-11} {R-40} {base-8} C{R+10} {base-9} {R+40} {base-6} {R+70} {base+10} L{R+70} {base+40} L{L-70} {base+40} Z" fill="url(#snowU)"/>')
o.append(f'<path d="M{L-56} {base+3} C{L-30} {base-7} {L-10} {base-9} {L+40} {base-8} C{cx-60} {base-6} {cx+60} {base-11} {R-40} {base-8} C{R+10} {base-9} {R+30} {base-7} {R+56} {base+3}" fill="none" stroke="#DCE6F6" stroke-width="2.2" opacity="0.6" stroke-linecap="round"/>')


o.append('<ellipse cx="510" cy="808" rx="230" ry="30" fill="url(#spill)" opacity="0.45" filter="url(#b12)"/>')
# footpath to the door
for k in range(9):
    t=k/8; x=612-90*t+18*math.sin(t*6); y=786+t*170
    o.append(f'<ellipse cx="{x-10:.1f}" cy="{y:.1f}" rx="{7+5*t:.1f}" ry="{3+2*t:.1f}" fill="#4A5E86" opacity="0.55"/>')
    o.append(f'<ellipse cx="{x+12:.1f}" cy="{y+9:.1f}" rx="{7+5*t:.1f}" ry="{3+2*t:.1f}" fill="#4A5E86" opacity="0.55"/>')
o.append('</g>')
# moon is up right, so shadows fall down left on the snow
o.append(f'<path d="M{330+SH} 792 L{700+SH} 792 L{580+SH} 836 L{200+SH} 836 Z" fill="#2B3B5C" opacity="0.22" filter="url(#b12)"/>')
for y0,amp,op,col,x0,x1 in [(792,6,0.22,'#D8E3F3',60,520),(830,8,0.16,'#3F5379',300,980),(860,5,0.2,'#D8E3F3',-20,420),(938,9,0.14,'#3F5379',120,760),(975,7,0.2,'#D8E3F3',480,1044)]:
    seg=int((x1-x0)/3)
    d_=f'M{x0} {y0} C{x0+seg} {y0-amp} {x0+2*seg} {y0+amp} {x1} {y0-amp*0.5}'
    o.append(f'<path d="{d_}" fill="none" stroke="{col}" stroke-width="2.4" opacity="{op}" stroke-linecap="round"/>')
for x_,y_,w_ in [(150,800,120),(380,840,90),(880,820,140),(620,930,160)]:
    o.append(f'<path d="M{x_-w_} {y_} Q{x_} {y_-w_*0.22} {x_+w_} {y_} Z" fill="#B9C8E0" opacity="0.5"/>')
    o.append(f'<path d="M{x_} {y_-w_*0.11} Q{x_+w_*0.55} {y_-w_*0.1} {x_+w_} {y_}" fill="none" stroke="#EEF4FF" stroke-width="3" opacity="0.6" stroke-linecap="round"/>')
for _ in range(500):
    x=random.uniform(0,1024); y=random.uniform(740,1024)
    if (L-30+SH < x < R+30+SH and y < 800): continue
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{random.choice([0.6,0.8,1.0])}" fill="#3E5278" opacity="{random.uniform(0.15,0.4):.2f}"/>')
# snow sparkle
for _ in range(220):
    x=random.uniform(0,1024); y=random.uniform(740,1024)
    if (L-30+SH < x < R+30+SH and y < 800): continue
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{random.choice([0.8,1.0,1.3,1.7])}" fill="#FFFFFF" opacity="{random.uniform(0.25,0.8):.2f}"/>')
# foreground drift
o.append('<path d="M-20 900 C200 850 420 880 600 868 C800 855 920 880 1044 862 L1044 1044 L-20 1044 Z" fill="url(#snow2)" opacity="0.85"/>')
o.append('<path d="M-20 900 C200 850 420 880 600 868 C800 855 920 880 1044 862" fill="none" stroke="#DCE6F6" stroke-width="4" opacity="0.5"/>')
o.append('</svg>')
open('afferent-icon.svg','w').write('\n'.join(o))
print('ok', sum(len(x) for x in o))
