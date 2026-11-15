(() => {
  const A = window.A = window.A || {};
  const SH = A.Shaders = A.Shaders || {};

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const C = Object.fromEntries(Object.entries({ honey: '#FFD58A', sun: '#F2C230', ice: '#8FC6E0', hem: '#5FE3A1' }).map(([k, v]) => [k, hex(v)]));
  const KAAMOS = ['#03060D', '#0E1A2E', '#1C305C', '#1B3D7C', '#204B92', '#3465AF', '#4D7EC5', '#6B97D9', '#91AEE5', '#B5C6F2', '#DADCF4', '#F2EEE6', '#FFFDF8'];
  const TINT = [C.honey.map((v, i) => (v + C.sun[i]) / 2), C.ice, C.hem];
  const CORE_MODES = new Set(['rest', 'checkin', 'rt']);

  const VS = `attribute vec2 p;uniform float uFlip;varying vec2 st;
void main(){vec2 v=p*.5+.5;st=vec2(v.x,uFlip>.5?v.y:1.-v.y);gl_Position=vec4(p,0.,1.);}`;

  const LIB = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 st;
uniform sampler2D uNoise;
uniform float uAsp,uT;
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(uNoise,(i+f+.5)/64.).r;}
float fbm3(vec2 p){float v=.5*vn(p);p=p*2.03+vec2(17.1,9.2);v+=.25*vn(p);p=p*2.01+vec2(3.7,21.4);v+=.125*vn(p);return v/.875;}
float fbm2(vec2 p){return (vn(p)*.667+vn(p*2.03+vec2(11.3,4.1))*.333);}
float g2(float x){return exp(-x*x);}
float ign(vec2 p){p=mod(p,256.);return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float warp(vec2 s){vec2 q=s*vec2(uAsp,1.)*2.6;vec2 w=vec2(fbm2(q+vec2(uT*.035,0.)),fbm2(q+vec2(5.2,1.3)-uT*.03));return fbm3(q*1.3+2.2*w)-.5;}
uniform float uLand;
float dist(vec2 s,vec2 c,float wp){vec2 d=(s-c)*vec2(uAsp,1.);float land=exp(-pow((s.y-uLand)/.16,2.));d.x/=mix(1.,1.3,land);float r=length(d);return r*(1.+.42*wp)+.05*wp;}
float wf(float x){return smoothstep(-.03,.06,x);}
float df(float x){return smoothstep(-.04,.24,x);}
`;

  const WARP = LIB + `void main(){gl_FragColor=vec4(warp(st)+.5);}`;

  const MASK = LIB + `uniform sampler2D uPrev,uWarp;uniform vec2 uWc,uDc;uniform float uWr,uDr;uniform vec4 uWg;uniform float uDon;
void main(){vec4 o=texture2D(uPrev,st);float wp=texture2D(uWarp,st).r-.5;
float f=wf(uWr-dist(st,uWc,wp));o=max(o,uWg*f);
float g=df(uDr-dist(st,uDc,wp))*uDon;o.a=max(o.a,g);gl_FragColor=o;}`;

  const DOWN = `// Box downsample with a warm-emitter key in alpha (Kawase dual filter, Jimenez "Next Generation Post Processing in Call of Duty")
` + LIB + `uniform sampler2D uSrc;uniform vec2 uPx;uniform float uEm;
vec4 tap(vec2 p){vec4 c=texture2D(uSrc,p);float l=dot(c.rgb,vec3(.2126,.7152,.0722));return vec4(c.rgb,mix(c.a,smoothstep(.12,.3,c.r-c.b)*smoothstep(.6,.9,l),uEm));}
void main(){vec2 h=uPx;gl_FragColor=(tap(st+h)+tap(st-h)+tap(st+vec2(h.x,-h.y))+tap(st+vec2(-h.x,h.y)))*.25;}`;

  const BLUR = `// 9-tap separable Gaussian with linear-sampling offsets (Rakos "Efficient Gaussian blur with linear sampling")
` + LIB + `uniform sampler2D uSrc;uniform vec2 uDir;
void main(){vec4 a=texture2D(uSrc,st)*.227027;
a+=(texture2D(uSrc,st+uDir*1.384615)+texture2D(uSrc,st-uDir*1.384615))*.316216;
a+=(texture2D(uSrc,st+uDir*3.230769)+texture2D(uSrc,st-uDir*3.230769))*.070270;
gl_FragColor=a;}`;

  const OCC = `// Light-scattering occluder: bright sky near the sun, hills and figure stay black (Mitchell, GPU Gems 3 ch. 13; Journey summit)
` + LIB + `uniform sampler2D uScene;uniform vec2 uPx,uSun;uniform float uAlpha;
void main(){vec2 h=uPx*.5;vec4 c=(texture2D(uScene,st+h)+texture2D(uScene,st-h)+texture2D(uScene,st+vec2(h.x,-h.y))+texture2D(uScene,st+vec2(-h.x,h.y)))*.25;
float l=dot(c.rgb,vec3(.2126,.7152,.0722));float o=pow(smoothstep(.72,.98,l),2.);
o*=mix(1.,1.-c.a,uAlpha);
vec2 d=(st-uSun)*vec2(uAsp,1.);o*=exp(-length(d)/.16);
gl_FragColor=vec4(o,o,o,1.);}`;

  const COMP = `// Light and reveal composite: kaamos cyanotype grade, Gris watercolour colour return, Alto dawn grade, lantern glass (Limbo, Gris, Alto's Odyssey, Journey)
` + LIB + `uniform sampler2D uScene,uMask,uRays,uLut,uWarp,uBlur;
uniform vec2 uL,uWc,uDc,uSun,uPx;
uniform vec4 uA,uB,uFr,uFx,uHero,uSunP,uRy,uWg,uDone,uHz;
uniform vec3 uWt;uniform float uHzA;
const vec3 HONEY=vec3(1.,.835,.541),GOLD=vec3(1.,.831,.353),ORANGE=vec3(1.,.55,.2),SB=vec3(.557,.635,.878),HEM=vec3(.373,.890,.631),GLASS=vec3(.985,.95,.8);
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 scr(vec3 a,vec3 b){return 1.-(1.-a)*(1.-clamp(b,0.,1.));}
void main(){
float hor=uB.y,lr=uA.y,lb=uA.z;
vec2 off=vec2(0.);
if(uHzA>0.&&st.x>uHz.x&&st.x<uHz.z&&st.y>uHz.y&&st.y<uHz.w){vec2 r=(st-uHz.xy)/(uHz.zw-uHz.xy);
float win=sin(r.x*3.1416)*smoothstep(0.,.35,r.y)*smoothstep(1.,.8,r.y);vec2 q=vec2(r.x*2.5,r.y*4.5+uT*1.3);
float n0=vn(q),nx=vn(q+vec2(.2,0.)),ny=vn(q+vec2(0.,.2));off=vec2(nx-n0,ny-n0)*5.*uHzA*win;}
vec3 c0=texture2D(uScene,st+off).rgb;
float l=lum(c0);
float mx=max(c0.r,max(c0.g,c0.b)),ch=mx-min(c0.r,min(c0.g,c0.b));
float wg=smoothstep(-.02,.06,c0.g-c0.b)*smoothstep(.0,.06,c0.g-c0.r);
float wy=max(smoothstep(.0,.12,c0.r-c0.b),1.-smoothstep(.03,.12,ch))*(1.-wg);
float wb=(1.-wy)*(1.-wg);
float dw=-1.,dd=-1.;
if(uFr.x>0.||uFr.y>0.){float wp=texture2D(uWarp,st).r-.5;dw=uFr.x-dist(st,uWc,wp);dd=uFr.y-dist(st,uDc,wp);}
vec4 m=max(texture2D(uMask,st),uDone);
vec3 rg=max(m.rgb,uWg.rgb*wf(dw));
float da=max(m.a,df(dd));
float rv=max(dot(vec3(wy,wb,wg),rg),da);
vec2 dl=(st-uL)*vec2(uAsp,1.);float d=length(dl);
vec2 pg=(st-vec2(uL.x,uLand))*vec2(uAsp/(2.4*lr),1./(.5*lr));float pq=dot(pg,pg);
float Rw=3.2*lr,win=0.,Lp=0.,pool=0.;bool near=d<Rw||pq<6.;
if(near){win=1.-smoothstep(.45*Rw,Rw,d);float x=d/(.55*lr);Lp=win/(1.+x*x);pool=exp(-pq*1.4);}
vec2 hq=(st-uHero.xy)/uHero.zw;float hero=(1.-smoothstep(.8,1.05,length(hq)))*smoothstep(.0,.08,c0.r-c0.b);
rv=max(rv,max(hero,uB.z*smoothstep(.03,.3,(Lp+pool*.6)*lb)));
float rvw=rv;
rv=mix(1.,rv,uA.x);
float sky=1.-smoothstep(hor-.012,hor+.004,st.y);
float lv=uRy.z,tau=-1.,ty=-1.;
if(lv>0.&&dw>-.02){tau=max(dw,0.)/uFx.x;ty=tau-.7*vn(st*vec2(uAsp,1.)*9.);}
vec4 bl=vec4(0.);float hp=0.,emi=0.,water=0.,aur=0.;
if(rv<1.||uRy.z>0.||uFx.w*rg.b*sky>0.){bl=texture2D(uBlur,st);hp=l-lum(bl.rgb);
emi=smoothstep(.04,.16,c0.r-c0.b)*smoothstep(.22,.6,l)*(1.-hero)*(1.-win);
bl.a*=(1.-hero)*(1.-win);
if(lv>0.&&uWg.r>0.)rv=min(rv,mix(1.,smoothstep(0.,.2,ty),emi));
water=(1.-sky)*smoothstep(.02,.12,c0.b-c0.r)*(1.-smoothstep(.62,.85,l));
aur=sky*(1.-smoothstep(hor-.24,hor-.12,st.y))*smoothstep(.025,.075,hp)*(1.-smoothstep(.16,.28,hp));}
vec3 c=c0;
if(rv<1.){float lg=mix(l,lum(bl.rgb)*.9,emi)-.75*water*max(hp,0.);
vec3 cy=texture2D(uLut,vec2(lg,.5)).rgb+.12*(c0-vec3(l))*(1.-emi);
cy*=1.+.08*sky*(1.-2.*clamp(st.y/hor,0.,1.));
c=mix(cy,c0,rv);}
c=mix(c,mix(c,HEM*(lum(c)/lum(HEM)),.5),aur*rg.b*uFx.w);
if(lv>0.&&dw>-.02){
float inside=step(0.,dw);
c*=1.+uFx.y*inside*exp(-tau/.5);
float sw=smoothstep(0.,.2,ty)*exp(-max(ty,0.)/.9);
c=scr(c,HONEY*(bl.a*7.+emi*.5)*sw*uWg.r);
c=scr(c,vec3(.72,.86,1.)*max(hp,0.)*water*3.5*sw*uWg.g);
c=scr(c,HEM*aur*sw*.6*uWg.b);
float fr=.7+.3*vn(vec2(atan(st.y-uWc.y,(st.x-uWc.x)*uAsp)*3.,uT*.2));
float rim=exp(-dw*dw/(1.1*uPx.y*uPx.y)),trail=inside*exp(-dw/.03);
c=scr(c,mix(uWt,vec3(1.),.5)*(rim*.34+trail*.07)*fr*uFx.z);
c=scr(c,uWt*uFr.z*fr*g2((dw-.05)/.075));
float wet=g2((dw-.035)/.045)*uFr.z*10.;
c=mix(vec3(lum(c)),c,1.+.16*wet*inside);}
if(uB.w>0.){vec3 pre=mix(texture2D(uLut,vec2(l*.78,.5)).rgb,c,.22)*.94;c=mix(c,pre,uB.w*(1.-da));}
float dg=uSunP.w*da;
if(dg>0.){
float z=1.-smoothstep(.04,.36,st.y);
c=mix(c,pow(c,vec3(1.+.65*z)),dg);
float l2=lum(c),t=smoothstep(.66,.96,l2),lc=clamp(.8+(l2-.8)*1.45,0.,1.);
vec3 cs=c*(lc/max(l2,.001));
cs=mix(cs,SB*(lc/lum(SB)),(1.-t)*.3*smoothstep(.25,.55,l2));
cs*=mix(vec3(1.),vec3(1.025,1.,.9),t);
c=mix(c,cs,dg*smoothstep(hor+.01,hor+.14,st.y)*(1.-hero)*(1.-win));
vec2 sd=(st-uSunP.xy)*vec2(uAsp,1.);float sr=length(sd)/uSunP.z;
float disc=(1.-smoothstep(.95,1.03,sr))*smoothstep(.74,.84,l),hal=pow(1.-smoothstep(1.,2.5,sr),1.5)*(1.-disc);
c=mix(c,c*vec3(1.,.8,.58),hal*.5*dg);
c=scr(c,ORANGE*hal*hal*.22*dg);
c=mix(c,mix(GOLD,vec3(1.,.95,.7),.7*exp(-sr*sr*1.8)),disc*dg);}
float amb=1.-uB.x*smoothstep(hor-.01,hor+.06,st.y)*(1.-rvw);
c*=mix(amb,1.,clamp(Lp*1.6+pool,0.,1.));
vec2 sp=(st-vec2(mix(uL.x,uHero.x,.6),uLand))*vec2(uAsp/(1.6*lr),1./(.3*lr));float side=exp(-dot(sp,sp))*(1.-sky);
if(near||side>.01){vec3 wc=mix(vec3(1.,.71,.29),vec3(1.,.89,.65),exp(-d/(.6*lr)));
float gk=1.-.92*smoothstep(.45,.75,l)*smoothstep(.15,.35,c0.r-c0.b);
float lit=clamp((Lp*1.25+pool*.75+side*.3)*lb,0.,1.)*gk;
vec3 wt=wc*(lum(c)*1.18+.04);
c=mix(c,max(wt,c*wc),lit*.82);
float a=d/(.35*lr),b=d/(1.4*lr);
c=scr(c,HONEY*uA.w*lb*win*(.55/(1.+a*a)+.45/(1.+b*b))*gk);
float dp=d/uPx.y;
c=scr(c,HONEY*clamp(lb,0.,1.2)*(.42*exp(-dp*dp/50.)+.2/(1.+dp*dp/16.))*gk);
c=mix(c,max(c,GLASS),(1.-smoothstep(.9,1.7,dp))*clamp(lb,0.,1.));}
if(uRy.x>0.){vec2 rd=(st-uSun)*vec2(uAsp,1.);float rl=length(rd);vec2 dir=rd/max(rl,1e-4)/vec2(uAsp,1.);
float vis=0.;for(int i=0;i<5;i++)vis+=texture2D(uRays,uSun+dir*uSunP.z*(.4+.3*float(i))).r;
float ang=atan(rd.y,rd.x);
float shafts=smoothstep(.5,.92,.5+.5*cos(ang*14.+2.2*vn(vec2(ang*3.,1.7))+uRy.y))*(.55+.45*vn(vec2(ang*5.,8.3)));
float fan=smoothstep(uSun.y+.004,uSun.y+.05,st.y)*smoothstep(uSunP.z*1.5,uSunP.z*4.,rl)*exp(-rl/1.6),k=smoothstep(.2,1.2,vis)*shafts*fan;
c=mix(c,c*vec3(.95,.96,1.),(1.-k)*fan*uRy.x*5.);
c=scr(c,HONEY*k*uRy.x);}
c=min(c,vec3(max(.985,mx)));
vec2 fc=gl_FragCoord.xy;c+=(ign(fc)+ign(fc+vec2(41.,17.))-1.)/255.;
gl_FragColor=vec4(c,1.);}`;

  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const H1 = (() => { const r = rng(7), a = new Float32Array(256); for (let i = 0; i < 256; i++) a[i] = r() * 2 - 1; return a; })();
  const n1 = x => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return H1[i & 255] + (H1[(i + 1) & 255] - H1[i & 255]) * s; };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const breath = t => { const p = ((t % 10) + 10) % 10; return p < 4 ? sstep(0, 4, p) : 1 - sstep(4, 10, p); };

  const toLin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const toSrgb = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const oklab = c => {
    const [r, g, b] = c.map(toLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  };
  const fromOklab = ([L, a, b]) => {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(v => clamp(toSrgb(clamp(v))));
  };
  const luma = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  const cyanLut = () => {
    const stops = KAAMOS.map(h => [luma(hex(h)), oklab(hex(h))]);
    stops[0][0] = 0; stops[stops.length - 1][0] = 1;
    const raw = [];
    for (let i = 0; i < 256; i++) {
      const x = i / 255; let k = 0;
      while (k < stops.length - 2 && x > stops[k + 1][0]) k++;
      const [x0, a] = stops[k], [x1, b] = stops[k + 1], f = clamp((x - x0) / (x1 - x0));
      raw.push(a.map((v, j) => v + (b[j] - v) * f));
    }
    const out = new Uint8Array(256 * 4), R = 10;
    for (let i = 0; i < 256; i++) {
      const acc = [0, 0, 0]; let n = 0;
      for (let j = -R; j <= R; j++) { const q = raw[clamp(i + j, 0, 255)]; acc[0] += q[0]; acc[1] += q[1]; acc[2] += q[2]; n++; }
      const c = fromOklab(acc.map(v => v / n));
      out.set([...c.map(v => Math.round(v * 255)), 255], i * 4);
    }
    return out;
  };

  function create() {
    let gl = null, own = false, cv = null, P = {}, quad = null, Wp = null, noiseT, lutT, blackT, sceneT, sceneKey, M = [], Q = [], D4 = null, E = [], bKey = null, W = 1, H = 1;
    let last = -1, coreK = 0, coreT = 0, wasCore = false, prevColour = 0, prevTod = 0, maskIx = 0, lostFlag = false, wrPrev = -1, vF = 0.5;
    const sl = { air: 0, wa: 0, da: 0, ra: 0, dark: 0, keep: 1, pre: 0, lv: 0 };
    const mod = { ok: false, stats: { cpu: 0, frames: 0 } };

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = fs => {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    };
    const texture = (w, h, data, wrap = gl.CLAMP_TO_EDGE) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
      return t;
    };
    const target = (w, h) => {
      const t = texture(w, h), f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return { t, f, w, h };
    };
    const drop = r => { if (r) { gl.deleteTexture(r.t); gl.deleteFramebuffer(r.f); } };

    const save = () => own ? null : {
      fb: gl.getParameter(gl.FRAMEBUFFER_BINDING), vp: gl.getParameter(gl.VIEWPORT), pr: gl.getParameter(gl.CURRENT_PROGRAM),
      ab: gl.getParameter(gl.ARRAY_BUFFER_BINDING), at: gl.getParameter(gl.ACTIVE_TEXTURE), bl: gl.isEnabled(gl.BLEND),
      tx: [0, 1, 2, 3, 4, 5, 6].map(i => { gl.activeTexture(gl.TEXTURE0 + i); return gl.getParameter(gl.TEXTURE_BINDING_2D); }),
      vb: gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),
    };
    const restore = s => {
      if (!s) return;
      s.tx.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
      gl.activeTexture(s.at); gl.useProgram(s.pr);
      if (s.vb) { gl.bindBuffer(gl.ARRAY_BUFFER, s.vb); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
      gl.bindBuffer(gl.ARRAY_BUFFER, s.ab);
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb); gl.viewport(s.vp[0], s.vp[1], s.vp[2], s.vp[3]);
      if (s.bl) gl.enable(gl.BLEND);
    };

    const pass = (p, out, tex, set) => {
      gl.useProgram(p.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : (mod.target ?? null));
      gl.viewport(0, 0, out ? out.w : W, out ? out.h : H);
      tex.forEach(([n, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[n], i); });
      gl.uniform1f(p.u.uFlip, out || mod.target ? 1 : 0);
      if (p.u.uAsp) gl.uniform1f(p.u.uAsp, W / H);
      set(p.u);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    mod.init = x => {
      try {
        if (x && x.getContext) {
          cv = x; own = true;
          const o = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
          gl = cv.getContext('webgl2', o) || cv.getContext('webgl', o);
          cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lostFlag = true; mod.ok = false; });
        } else gl = x;
        if (!gl) throw new Error('no webgl');
        const s = save();
        P = { warp: prog(WARP), mask: prog(MASK), down: prog(DOWN), blur: prog(BLUR), occ: prog(OCC), comp: prog(COMP) };
        quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const r = rng(1234), nz = new Uint8Array(64 * 64 * 4);
        for (let i = 0; i < nz.length; i++) nz[i] = r() * 256 | 0;
        noiseT = texture(64, 64, nz, gl.REPEAT);
        lutT = texture(256, 1, cyanLut());
        blackT = texture(1, 1, new Uint8Array([0, 0, 0, 255]));
        sceneT = texture(1, 1, new Uint8Array([0, 0, 0, 255]));
        restore(s);
        mod.ok = true; mod.gl = gl;
      } catch (e) { console.warn('light-reveal off:', e.message); mod.ok = false; }
      return mod.ok;
    };

    mod.resize = (w, h, dpr = 1) => {
      if (!gl) return;
      W = Math.max(1, Math.round(w * dpr)); H = Math.max(1, Math.round(h * dpr)); mod.dpr = dpr; mod.css = [w, h];
      if (cv) { cv.width = W; cv.height = H; }
      const s = save();
      M.forEach(drop); Q.forEach(drop); E.forEach(drop); drop(Wp); drop(D4);
      D4 = target(Math.max(1, W >> 2), Math.max(1, H >> 2));
      E = [0, 1].map(() => target(Math.max(1, W >> 3), Math.max(1, H >> 3)));
      bKey = null;
      Wp = target(Math.max(1, W >> 2), Math.max(1, H >> 2));
      M = [target(Math.max(1, W >> 3), Math.max(1, H >> 3)), target(Math.max(1, W >> 3), Math.max(1, H >> 3))];
      Q = [target(Math.max(1, W >> 2), Math.max(1, H >> 2))];
      restore(s);
    };

    const clearMask = () => M.forEach(m => { gl.bindFramebuffer(gl.FRAMEBUFFER, m.f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
    const slew = (k, v, dt, up, down, first) => { if (first || sl[k] === undefined) return (sl[k] = v); const d = v - sl[k]; sl[k] += d > 0 ? Math.min(d, dt / up) : Math.max(d, -dt / down); return sl[k]; };

    mod.render = (t, s = {}) => {
      if (!mod.ok || lostFlag || !gl || gl.isContextLost()) { mod.ok = false; return false; }
      const c0 = performance.now();
      if (!M.length) mod.resize(mod.css?.[0] || W, mod.css?.[1] || H, 1);
      const gs = save();
      try {
        mod.target = own ? null : (s.target ?? null);
        const now = performance.now() / 1000, first = last < 0, dt = s.dt != null ? clamp(s.dt, 0, 0.1) : first ? 1 / 60 : clamp(now - last, 0, 0.1); last = now;
        const rm = !!(s.reduced ?? s.rm), mode = s.mode || 'flow';
        const core = !!s.core || CORE_MODES.has(s.phase);
        if (core && !wasCore) coreT = t;
        wasCore = core;
        coreK = clamp(coreK + (core ? dt / 0.25 : -dt / 0.6));
        const tt = (core ? coreT : t) % 1024;
        const calm = mode === 'calm' || mode === 'rest';

        if (s.scene && own && (s.sceneLive || s.sceneKey !== sceneKey || sceneKey === undefined)) {
          gl.bindTexture(gl.TEXTURE_2D, sceneT);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.scene);
          sceneKey = s.sceneKey ?? Math.random();
          bKey = null;
        }
        const scene = own ? sceneT : (s.scene || blackT);

        const L = s.lantern || {}, lx = L.x ?? 0.35, ly = L.y ?? 0.72;
        const cssW = mod.css?.[0] || W, cssH = mod.css?.[1] || H;
        const u = cssH / 844, lr = (L.r ?? 70) * u / cssH;
        const flick = (rm ? 0.5 : 1) * (1 - coreK) * (0.06 * n1(tt * 1.6) + 0.04 * n1(tt * 0.5 + 9.1));
        const br = (L.bright ?? 1) * (1 + flick);
        const bre = 1 + (rm ? 0.01 : 0.03) * (1 - coreK) * (breath(tt) - 0.5);
        const hor = s.horizonY ?? 0.6, gnd = s.groundY ?? Math.min(0.97, ly + 0.03);
        const tod = clamp(s.dawnP ?? ((s.tod ?? 0) - 0.5) / 0.5), night = !!s.night;
        const colour = clamp(s.ret ?? s.colour ?? 0);

        if (colour < prevColour - 1e-3 || tod < prevTod - 1e-3) clearMask();
        prevColour = colour; prevTod = tod;

        const g = Math.min(2, Math.floor(colour * 3)), p = colour >= 1 ? 1 : colour * 3 - g;
        const done = [0, 1, 2].map(i => colour * 3 >= i + 1 ? 1 : 0);
        const aspect = W / H;
        const far = (x, y) => Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => Math.hypot((a - x) * aspect, b - y)));
        const e = 1 - Math.pow(1 - p, 2.2);
        const live = colour < 1 && p > 0 && p < 1 && !core;
        const wr = live && !rm ? 0.01 + e * (far(lx, ly) * 1.2 + 0.2) : -1;
        const wg = [0, 0, 0, 0]; if (live && !rm) wg[g] = 1;
        if (wr > 0 && wrPrev > 0) { if (dt > 0 && wr >= wrPrev) vF += ((wr - wrPrev) / dt - vF) * Math.min(1, dt * 8); }
        else if (wr > 0) vF = 2.2 * (far(lx, ly) * 1.2 + 0.2) / 2.4;
        wrPrev = wr;
        const lv = slew('lv', live && !rm ? (calm ? 0.5 : 1) * (1 - coreK) : 0, dt, 0.15, 0.4, first);
        if (rm) for (let i = 0; i < 3; i++) done[i] = slew('rm' + i, done[i] || (i === g && p > 0) ? 1 : 0, dt, 4, 0.001, first);
        const waTarget = live && !rm ? 0.1 * (calm ? 0.5 : 1) * Math.sin(Math.PI * Math.min(1, p * 1.15)) : 0;

        const sx = s.sun?.x ?? 0.72, sy = s.sun?.y ?? hor;
        const pd = night ? 0 : clamp((tod * 8 - 1) / 2.5);
        const ed = 0.5 - 0.5 * Math.cos(Math.PI * pd);
        const dawnLive = pd > 0 && pd < 1 && !core;
        const dr = !dawnLive || rm ? -1 : 0.01 + ed * (far(sx, sy) * 1.2 + 0.25);
        const daTarget = dawnLive && !rm ? 0.1 * Math.sin(Math.PI * pd) : 0;
        done.push(rm ? slew('rmd', pd > 0 ? 1 : 0, dt, 4, 0.001, first) : pd >= 1 ? 1 : 0);
        const raysOn = !night && mode !== 'fatigue' && !core;
        const raTarget = raysOn ? clamp((tod * 8 - 3.2) / 2) * 0.09 * (s.rays ?? 1) : 0;

        const air = slew('air', (s.air ?? 1) * (calm ? 0.85 : 1), dt, 0.12, 0.3, first);
        const wa = slew('wa', waTarget * (1 - coreK), dt, 0.333, 0.3, first);
        const da = slew('da', daTarget * (1 - coreK), dt, 0.333, 0.3, first);
        const ra = slew('ra', raTarget * (1 - coreK), dt, 2, 0.5, first);
        const dark = slew('dark', clamp(s.dark ?? 0), dt, 0.5, 0.5, first);
        const pre = slew('pre', clamp(s.predawn ?? 0), dt, 0.5, 0.5, first);
        const hzA = rm ? 0 : (1 - coreK) * 1.2 / W * (s.haze ?? 1) * clamp(L.bright ?? 1);
        const hzW = 24 * u / cssW * (L.hazeScale ?? 1), hzH = 96 * u / cssH * (L.hazeScale ?? 1);
        const Hr = s.hero || {}, hero = [Hr.x ?? lx - 70 * u / cssW, Hr.y ?? ly - 44 * u / cssH, Hr.rx ?? 70 * u / cssW, Hr.ry ?? 80 * u / cssH];
        const grade = s.grade ?? 1, auroraTint = s.auroraTint ?? 1, needB = grade > 0 && (colour < 1 || lv > 0 || auroraTint > 0);
        const drift = rm ? 0 : Math.sin(tt * Math.PI * 2 / 16) * 0.01;
        const sunX = sx + drift, sunY = sy;

        gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.BLEND);

        if (wr > 0 || dr > 0) {
          pass(P.warp, Wp, [['uNoise', noiseT]], u => gl.uniform1f(u.uT, tt));
          const a = M[maskIx], b = M[1 - maskIx];
          pass(P.mask, b, [['uPrev', a.t], ['uWarp', Wp.t]], u => {
            gl.uniform1f(u.uT, tt); gl.uniform1f(u.uLand, gnd);
            gl.uniform2f(u.uWc, lx, ly); gl.uniform1f(u.uWr, wr); gl.uniform4fv(u.uWg, wg);
            gl.uniform2f(u.uDc, sx, sy); gl.uniform1f(u.uDr, dr); gl.uniform1f(u.uDon, dr > 0 ? 1 : 0);
          });
          maskIx = 1 - maskIx;
        }

        let blur = blackT, bPass = 0;
        if (needB) {
          const key = own && !s.sceneLive ? sceneKey : NaN;
          if (bKey !== key || key !== key) {
            pass(P.down, D4, [['uSrc', scene]], u => { gl.uniform2f(u.uPx, 1 / W, 1 / H); gl.uniform1f(u.uEm, 1); });
            pass(P.down, E[0], [['uSrc', D4.t]], u => { gl.uniform2f(u.uPx, 0.5 / D4.w, 0.5 / D4.h); gl.uniform1f(u.uEm, 0); });
            pass(P.blur, E[1], [['uSrc', E[0].t]], u => gl.uniform2f(u.uDir, 1.25 / E[0].w, 0));
            pass(P.blur, E[0], [['uSrc', E[1].t]], u => gl.uniform2f(u.uDir, 0, 1.25 / E[0].h));
            bKey = key; bPass = 4;
          }
          blur = E[0].t;
        }

        let rays = blackT;
        if (ra > 0.002) {
          pass(P.occ, Q[0], [['uScene', scene], ['uNoise', noiseT]], u => {
            gl.uniform2f(u.uPx, 1 / Q[0].w, 1 / Q[0].h); gl.uniform2f(u.uSun, sunX, sunY);
            gl.uniform1f(u.uAlpha, s.sceneAlpha ? 1 : 0);
          });
          rays = Q[0].t;
        }

        const sunR = (s.sun?.r ?? 32) * u / cssH;
        const hzY = ly - 2 * u / cssH;
        pass(P.comp, null, [['uScene', scene], ['uMask', M[maskIx].t], ['uRays', rays], ['uLut', lutT], ['uNoise', noiseT], ['uWarp', Wp.t], ['uBlur', blur]], u => {
          gl.uniform1f(u.uT, tt); gl.uniform1f(u.uLand, gnd); gl.uniform2f(u.uPx, 1 / cssW, 1 / cssH);
          gl.uniform2f(u.uL, lx, ly); gl.uniform2f(u.uWc, lx, ly); gl.uniform2f(u.uDc, sx, sy); gl.uniform2f(u.uSun, sunX, sunY);
          gl.uniform4f(u.uA, grade, lr * bre, br, 0.32 * air);
          gl.uniform4f(u.uB, dark, hor, s.keep ?? 1, pre);
          gl.uniform4f(u.uFr, wr, dr, wa, da);
          gl.uniform4f(u.uFx, Math.max(0.05, vF), 0.06, 1, auroraTint);
          gl.uniform4f(u.uHero, hero[0], hero[1], Math.max(1e-3, hero[2]), Math.max(1e-3, hero[3]));
          gl.uniform4f(u.uSunP, sx, sy, sunR, (s.dawnGrade ?? 1) * (night ? 0 : 1));
          gl.uniform4f(u.uRy, ra, rm ? 0 : tt * 0.02, lv, 0);
          gl.uniform4fv(u.uWg, wg); gl.uniform3fv(u.uWt, TINT[g]); gl.uniform4fv(u.uDone, done);
          gl.uniform4f(u.uHz, lx - hzW, ly - hzH, lx + hzW, hzY); gl.uniform1f(u.uHzA, hzA);
        });

        mod.last = { colour, tod, wr, dr, wg, done, wa, da, ra, lv, vF, coreK };
        mod.stats.passes = 1 + (wr > 0 || dr > 0 ? 2 : 0) + (ra > 0.002 ? 1 : 0) + bPass;
      } catch (e) {
        console.warn('light-reveal off:', e.message); mod.ok = false; restore(gs); return false;
      }
      restore(gs);
      const c1 = performance.now();
      mod.stats.cpu = mod.stats.frames ? mod.stats.cpu * 0.95 + (c1 - c0) * 0.05 : c1 - c0;
      mod.stats.frames++;
      return true;
    };

    mod.destroy = () => {
      if (!gl) return;
      if (!gl.isContextLost()) {
        M.forEach(drop); Q.forEach(drop); E.forEach(drop); drop(Wp); drop(D4);
        [noiseT, lutT, blackT, sceneT].forEach(t => t && gl.deleteTexture(t));
        Object.values(P).forEach(p => gl.deleteProgram(p.p));
        if (quad) gl.deleteBuffer(quad);
      }
      M = []; Q = []; E = []; D4 = null; mod.ok = false; gl = null;
    };
    return mod;
  }

  const api = create();
  api.create = create;
  api.label = 'Light and reveal';
  api.about = 'Lantern light with breathing flicker and heat haze, colour-return wave from the lantern, dawn god rays.';
  SH['light-reveal'] = api;
})();
