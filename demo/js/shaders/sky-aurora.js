(() => {
  const A = (window.A = window.A || {});
  A.Shaders = A.Shaders || {};
  const BN64 = '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';

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const VSG = `// Band gradient evaluated per mesh row: OKLab monotone Hermite through the eight world stops, linear in sRGB between rows 5 px apart
precision highp float;attribute vec2 p;varying vec2 v;varying vec3 vS;uniform vec3 uK[8],uT[8];uniform float uP[8];uniform vec2 uG2;
vec3 ok2lin(vec3 c){float l=c.x+.3963377774*c.y+.2158037573*c.z,m=c.x-.1055613458*c.y-.0638541728*c.z,s=c.x-.0894841775*c.y-1.291485548*c.z;l=l*l*l;m=m*m*m;s=s*s*s;
return vec3(4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s);}
void main(){
  v=p*.5+.5;
  float q=clamp((1.-v.y)*uG2.x/(uG2.y+4.),0.,1.);
  vec3 lab=uK[7];
  for(int i=0;i<7;i++){if(q>=uP[i]&&q<=uP[i+1]){float h=uP[i+1]-uP[i],s=(q-uP[i])/h,s2=s*s,s3=s2*s;
    lab=(2.*s3-3.*s2+1.)*uK[i]+(s3-2.*s2+s)*h*uT[i]+(3.*s2-2.*s3)*uK[i+1]+(s3-s2)*h*uT[i+1];}}
  vec3 c=max(ok2lin(lab),0.);
  vS=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));
  gl_Position=vec4(p,0.,1.);
}`;
  const ROWS = (() => { const a = []; for (let i = 0; i <= 120; i++) { const y = 1 - 2 * Math.min(1, (i / 120) * 0.72); a.push(-1, y, 1, y); } a.push(-1, -1, 1, -1); return new Float32Array(a); })();

  const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;uniform sampler2D uN,uB;
vec4 nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(uN,(i+f+.5)/64.);}
float f2(vec2 p){return .667*nz(p).x+.333*nz(p*2.+vec2(5.2,1.3)).y;}
float f3(vec2 p){return .5714*nz(p).x+.2857*nz(p*2.+vec2(5.2,1.3)).y+.1429*nz(p*4.+vec2(1.7,9.2)).z;}
float sq(float x){return x*x;}
float tpdf(){float n=texture2D(uB,gl_FragCoord.xy/64.).x*2.-1.;return sign(n)*(1.-sqrt(1.-abs(n)))/255.;}
`;

  const AURORA = `// Aurora: one folded curtain plus a short far curtain; rays are discrete samples of a parametric S-folded sheet, so they bunch and brighten where it is seen edge-on, clustered by a gap mask (Sky: Children of the Light aurora, all-sky footage, nimitz "Auroras")
${HEAD}
uniform vec4 uV,uA,uU,uG,uW,uP,uK0,uK1,uT0,uT1,uB0,uB1;uniform float uX;
vec2 curtain(float x,float y,vec4 K,vec4 T,vec4 B,float n){
  float ds=uV.w,px=uU.w,k=6.2832/K.x,A0=K.y,hk=T.w;
  float j0=floor((x-A0-.016)/ds),I=0.,Im=0.,S=0.,Sm=0.;
  for(int i=0;i<28;i++){
    if(float(i)>n)break;
    float j=j0+float(i),s=j*ds;
    vec4 h=texture2D(uN,(vec2(mod(j,64.),mod(T.z+floor(j/64.)*7.,64.))+.5)/64.);
    vec4 q=nz(vec2(s*8.+T.z*3.1,T.z+T.y));
    float A=A0*(.25+.75*q.x),th=k*s+T.x+1.6*q.w;
    float xs=s+A*sin(th),yh=mix(B.x,B.y,xs/uV.x)+.03*(q.y-.5)+.018*sin(s*9.+T.z+T.y*.5)+.2*A*cos(th);
    float d=yh-y,dx=x-xs;
    float bl=d<0.?exp(-d*d/sq(2.5*px)):1.,dd=max(d,0.);
    float cl=smoothstep(.42,.68,q.w),hr=hk*(.5+1.2*q.z)*(.55+.9*h.y);
    float sr=max(.5*(1.+5.*h.x*h.x*h.x)*px,.6*uV.z),ss=1.15*ds;
    float pl=uA.z*exp(-sq(s-uP.x+.04*(h.w-.5))/sq(uP.y));
    float hem=exp(-dd/(5.*px));
    float ray=exp(-dx*dx/(2.*sr*sr))*(.15+.85*cl)*(.35+.9*h.z*h.z)*(1.+1.4*pl)*(.75*exp(-dd/hr)+.3*hem);
    float sheet=exp(-dx*dx/(2.*ss*ss))*ds/(2.5066*ss)*(.55+.45*cl)*(1.+.5*pl)*(.4*exp(-dd/(.3*hk))+.6*hem);
    float mm=smoothstep(0.,1.3*hk,d);
    I+=ray*bl;Im+=ray*bl*mm;S+=sheet*bl;Sm+=sheet*bl*mm;
  }
  float sc=1./(1.+.45*S);I+=S*sc;Im+=Sm*sc;
  float e=smoothstep(B.z,B.z+.07,x)*(1.-smoothstep(B.w-.07,B.w,x));
  return vec2(I,Im)*K.z*e;
}
void main(){
  float x=v.x*uV.x,y=(1.-v.y)*uV.y,xc=uV.x*.5;
  vec2 au=vec2(0.);
  if(uA.x>.002&&y>.05&&y<.32){
    float xr=xc+(x-xc)*3.25/(y+3.);
    au=curtain(xr+uX*uK0.w,y,uK0,uT0,uB0,27.);
    if(uA.y>0.)au+=curtain(xr+uX*uK1.w,y,uK1,uT1,uB1,17.)*uA.y;
    au*=uA.x*(1.-smoothstep(uU.y-uU.z,uU.y,abs(x-uU.x)))*smoothstep(.06,.11,y)*(1.-smoothstep(.285,.305,y))*mix(1.,smoothstep(.13,.17,y),exp(-sq((x-uG.z)/.07)));
  }
  float I=1.-exp(-2.6*au.x),m=au.y/(au.x+1e-4);
  float mw=0.;
  if(uW.x>.002){
    vec2 dq=vec2(x,y)-uW.yz;
    float acr=dq.x*.8134+dq.y*.5817,alg=dq.x*.5817-dq.y*.8134;
    mw=uW.x*exp(-acr*acr/.006)*(.6+.4*f2(vec2(alg,acr)/.15+vec2(11.,3.)))*(1.-smoothstep(uW.w-.06,uW.w,y));
  }
  vec2 q=vec2(x*.8,y*1.4)+uG.xy;
  float g=f3(q+.9*vec2(f2(q*.7+vec2(3.1,1.7)),f2(q*.7+vec2(8.3,2.8))));
  float n=tpdf();
  gl_FragColor=vec4(sqrt(I)+n,m+n,sqrt(mw)+n,g+n);
}`;

  const SKY = `// Kaamos sky: OKLab monotone-Hermite band gradient, airglow, frost ribbon with device-pixel striations, sparse Gaussian-PSF stars with soft glints, crescent moon, matte aurora over-composite, sun-side Mie lobe and honey corona, static blue-noise TPDF dither (Alto's Odyssey palettes, Sky: Children of the Light, INSIDE dither)
${HEAD}
uniform sampler2D uA;uniform vec4 uV,uM,uS,uS2,uMo,uSu,uHz,uGh;uniform vec3 uMoC,uMoG1,uMoG2;varying vec3 vS;
const vec3 NIGHT=vec3(.024,.043,.090),AMBER2=vec3(.878,.627,.251),APRICOT=vec3(.953,.647,.478),GOLD=vec3(1.,.835,.541),
VIOLET=vec3(.431,.396,.565),LA1=vec3(.792,.651,.694),LA2=vec3(.804,.651,.675),
GHOST=vec3(.788,.863,.961),HEM=vec3(.498,.902,.710),TIP=vec3(.561,.776,.878),MW=vec3(.80,.85,1.),
WARM=vec3(1.,.722,.420),ZEN=vec3(.290,.373,.769),DISC=vec3(1.,.831,.353),DISC2=vec3(1.,.910,.600),CORONA=vec3(1.,.745,.415);
float soft(float r){return r<1.?exp(-5.5*r*r)*(1.-r):0.;}
vec3 star(vec2 Q,float cs,float l,float dens,float sz,float spk,float rich){
  vec2 cell=floor(Q/cs);
  vec4 h=texture2D(uN,(mod(cell+vec2(l*23.,l*41.),64.)+.5)/64.);
  if(h.x>dens)return vec3(0.);
  vec2 d=(Q-(cell+.2+.6*h.yz)*cs)*uV.z;
  float sg=sz*uV.z*(.75+.5*h.w),e=dot(d,d)/(2.*sg*sg);
  if(e>9.&&spk<=0.)return vec3(0.);
  float I=exp(-e),u=1.-h.x/dens,mag=.28+.72*u*u;
  if(spk>0.&&h.w>.62){float sl=4.5*uV.z*sz,sw=.9*uV.z;I+=spk*(exp(-d.y*d.y/(sw*sw)-d.x*d.x/(sl*sl))+exp(-d.x*d.x/(sw*sw)-d.y*d.y/(sl*sl)));}
  if(rich<=0.)return vec3(.93,.95,1.)*I*mag;
  float tw=1.-uS.z*(.5+.5*sin(uS2.y*(1.2+3.*fract(h.w*13.7))+6.283*h.z));
  vec3 tc=mix(vec3(.93,.95,1.),fract(h.y*7.1)<.5?vec3(1.,.92,.80):vec3(.76,.83,1.),.5*fract(h.z*3.3));
  return tc*I*mag*tw;
}
void main(){
  vec2 P=vec2(v.x,1.-v.y)*uV.xy;
  float X=P.x,Y=P.y,W=uV.x,H=uV.y,hy=uV.w;
  vec3 c=vS;
  vec4 a=Y<uM.x?texture2D(uA,vec2(X/W,1.-Y/uM.x)):vec4(0.,0.,0.,.5);
  c*=1.+uM.y*(a.a-.5)*2.;
  c=mix(c,NIGHT,uM.w);
  if(uHz.x>0.)c+=AMBER2*uHz.x*soft(length(vec2((X-.5*W)/W,(Y-hy)/(.13*H))));
  if(uHz.y>0.){
    float dz=length(vec2((X-uHz.w)/W,(Y-hy)/hy)),lobe=exp(-dz*dz/.06);
    float hz=smoothstep(0.,1.,clamp((Y-.75*hy)/(.25*hy),0.,1.));
    c=mix(c,ZEN,uHz.y*.6*sq(1.-clamp(Y/(.6*hy),0.,1.)));
    c=mix(c,WARM,uHz.y*hz*(.06+.7*lobe));
    c=mix(c,APRICOT,uHz.y*.16*soft(length(vec2((X-uHz.w)/(1.1*W),(Y-hy)/(.4*hy)))));
  }
  if(uHz.z>0.){
    float g=clamp((Y-hy+.22*H)/(.22*H+4.),0.,1.);
    c+=LA1*uHz.z*(g<.6?g/.6*.07:.07+(g-.6)/.4*.09)*step(Y,hy+6.);
    c+=VIOLET*.12*uHz.z*soft(length(vec2((X-uHz.w)/(1.1*W),(Y-hy+.09*H)/(.18*H))));
    c+=LA2*.1*uHz.z*soft(length(vec2((X-uHz.w)/(.6*W),(Y-hy+.09*H)/(.11*H))));
  }
  c+=MW*a.b*a.b;
  if(uS.x>.004&&Y<hy+2.){
    float ext=(.3+.7*(1.-smoothstep(hy-.32*H,hy,Y)))*(1.-smoothstep(uS.w-.06*H,uS.w,Y));
    vec2 Q=vec2(X+uS2.x,Y);
    vec3 s=star(Q,63.,2.,.27*min(uS.y,1.),.8,.22,1.);
    if(uS2.w<2.)s+=.55*star(Q,21.,1.,.11*uS.y,.5,0.,1.);
    c+=s*uS.x*ext;
  }
  if(uMo.w>.004){
    float dm=length(P-uMo.xy),aa=.75/uV.z;
    c+=(uMoG1*.16*soft(dm/(uMo.z*16.))+uMoG2*.22*soft(dm/(uMo.z*5.)))*uMo.w;
    float disc=1.-smoothstep(uMo.z-aa,uMo.z+aa,dm);
    float cut=1.-smoothstep(.9*uMo.z-aa,.9*uMo.z+aa,length(P-uMo.xy-vec2(.4,-.25)*uMo.z));
    c=mix(c,uMoC,disc*(1.-cut)*.9*uMo.w);
  }
  if(uGh.x>.002){
    float xf=X/W,yc=H*(.16-.05*xf+.006*sin(xf*4.+uGh.z*.3)+.03*sq(max(0.,1.-xf/.17))),dy=Y-yc,th=H*(.021+.008*(1.-xf));
    if(abs(dy)<3.*th){
      float fx=X*uV.z+uGh.y,cell=floor(fx/3.);
      vec4 h=texture2D(uN,(vec2(mod(cell,64.),mod(floor(cell/64.)*5.+11.,64.))+.5)/64.);
      float w=1.+h.x,o=h.y*(3.-w),a0=cell*3.+o,cov=clamp(min(a0+w,fx+.5)-max(a0,fx-.5),0.,1.);
      float band=dy>0.?exp(-dy*dy/sq(.55*th)):exp(-dy*dy/sq(1.1*th));
      float tall=th*(.7+.9*h.z),str=dy>0.?exp(-dy*dy/sq(.45*th)):exp(-dy*dy/sq(tall));
      float clu=.55+.45*smoothstep(.3,.7,nz(vec2(cell*.05,3.3+uGh.z*.02)).x);
      float env=smoothstep(-.06,.1,xf)*(1.-smoothstep(.62,.98,xf))*(.9+.1*sin(xf*7.-uGh.z));
      c=mix(c,GHOST,uGh.x*env*(.24*band+cov*str*clu*(.14+.2*h.w)));
    }
  }
  float ai=a.r*a.r*uM.z;
  c=mix(c,mix(HEM,TIP,smoothstep(.05,.75,a.g)),.75*ai);
  if(uSu.w>.003){
    float ds=length(P-uSu.xy),clip=1.-smoothstep(hy,hy+1.,Y),aa=.75/uV.z,r=uSu.z;
    float cr=1.-smoothstep(r,3.2*r,ds);
    c=mix(c,CORONA,uSu.w*(.55*cr+.35*soft(ds/(7.*r))));
    c=mix(c,DISC2,uSu.w*.8*cr*cr*cr);
    c+=GOLD*.08*uSu.w*soft(ds/(.18*H));
    float disc=(1.-smoothstep(r-aa,r+aa,ds))*clip;
    vec3 sc=mix(DISC,DISC2,.55*soft(length(P-uSu.xy-vec2(0.,.45*r))/(.9*r)));
    c=mix(c,sc,disc*min(1.,1.4*uSu.w));
  }
  gl_FragColor=vec4(clamp(c,0.,1.)+tpdf(),1.);
}`;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const ss = (a, b, x) => ease((x - a) / (b - a));
  const ema = (p, x, dt, tau) => p + (x - p) * (1 - Math.exp(-dt / tau));
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const wrap = (x, m) => ((x % m) + m) % m;
  const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const oklab = c => {
    const [r, g, b] = c.map(toLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };

  const SKY_AT = [0, 0.5, 0.84, 1], BANDS = [0, 0.16, 0.32, 0.48, 0.62, 0.76, 0.88, 1];
  const PAL = {
    kaamos: ['#122858', '#27498A', '#4F74B8', '#86A4DA'], yellow: ['#1B3260', '#2C4680', '#4E62A0', '#8A88B0'],
    blue: ['#1F3A6E', '#33558F', '#7A86C0', '#B4A6CE'], green: ['#1A3262', '#2A4C86', '#5A7AB8', '#8EA4D2'],
    dawn: ['#6F86D6', '#B0A6E6', '#F3A57A', '#FFD58A'], nightEnd: ['#121A33', '#28294E', '#4A4470', '#6E6590'],
    daylight: ['#5C7FB8', '#9FB6DA', '#E8DCCB', '#FFF0D2'],
  };
  for (const k in PAL) PAL[k] = PAL[k].map(hex);
  const skyAt = (pal, p) => { let i = 1; while (i < 3 && p > SKY_AT[i]) i++; return mixc(pal[i - 1], pal[i], clamp((p - SKY_AT[i - 1]) / (SKY_AT[i] - SKY_AT[i - 1]), 0, 1)); };
  const CYANO = [[0, hex('#0E1A2E')], [0.16, hex('#1E3160')], [0.36, hex('#34508E')], [0.66, hex('#8DA8D4')], [1, hex('#F2EEE6')]];
  const cyano = l => { for (let i = 1; i < CYANO.length; i++) if (l <= CYANO[i][0]) return mixc(CYANO[i - 1][1], CYANO[i][1], clamp((l - CYANO[i - 1][0]) / (CYANO[i][0] - CYANO[i - 1][0]), 0, 1)); return CYANO[4][1]; };
  const grade = (c, s, L) => { const l = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) * L / 255, cy = cyano(l); return [0, 1, 2].map(i => clamp(lerp(cy[i], c[i] * L, s), 0, 255) / 255); };
  const BIRCH = hex('#F2EEE6'), FROST = hex('#9DB9CC'), SILVER100 = hex('#E6ECF2');
  const MODES = { idle: [1, 1, 1], flow: [1, 1, 1], calm: [0.7, 0.92, 0.8], wake: [1.2, 1.1, 1.1], fatigue: [0.6, 0.8, 0.7], rest: [0.5, 0.75, 0.6], measure: [0.8, 0.9, 0.8], dawn: [1, 1, 1], nightEnd: [0.8, 0.9, 0.9], kind: [0.8, 1, 0.9] };
  const CORE = new Set(['rest', 'checkin', 'rt']);
  const RISE = Math.log(1.065) / 0.333;
  const CURTAINS = [
    { lam: 0.175, amp: 0.042, gain: 1, par: 1, seed: 3, hk: 0.032, base: [0.272, 0.226], ext: [-1, 9], phase: 0.06, drift: 0.012 },
    { lam: 0.12, amp: 0.022, gain: 0.3, par: 0.75, seed: 29, hk: 0.02, base: [0.205, 0.125], ext: [0.42, 1.02], phase: -0.045, drift: 0.009 },
  ];
  const PULSE = 9, SWEEP = 6;

  function hermite(xs, ys) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return m;
  }

  function noiseTex() {
    const px = new Uint8Array(64 * 64 * 4);
    let s = 0x9e3779b9;
    for (let i = 0; i < px.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; px[i] = (s >>> 0) & 255; }
    return px;
  }
  const blueNoise = () => Uint8Array.from(atob(BN64), c => c.charCodeAt(0));

  function create() {
    let gl = null, cv = null, own = false, progA = null, progS = null, quad = null, rows = null, texN = null, texB = null, fbo = null, fboTex = null;
    let W = 0, H = 0, dpr = 1, bw = 0, bh = 0, Ymax = 0, hyF = 0.6, tier = 0;
    let st = null;
    const api = { ok: false, webgl2: false, onfail: null, stats: { ms: 0, frames: 0 }, init, resize, render, destroy, finish: () => gl && gl.finish(), state: () => st };

    const fail = why => { api.ok = false; if (api.onfail) try { api.onfail(why); } catch (e) {} return false; };
    const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const program = (fs, vs = VS) => {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), k = a.name.replace(/\[0\]$/, ''); u[k] = gl.getUniformLocation(p, k); }
      return { p, u };
    };
    const tex = (w, h, fmt, data, filter, wrapM) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapM); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapM);
      return t;
    };

    function build() {
      progA = program(AURORA); progS = program(SKY, VSG);
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      rows = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, rows); gl.bufferData(gl.ARRAY_BUFFER, ROWS, gl.STATIC_DRAW);
      texN = tex(64, 64, gl.RGBA, noiseTex(), gl.LINEAR, gl.REPEAT);
      texB = tex(64, 64, gl.LUMINANCE, blueNoise(), gl.NEAREST, gl.REPEAT);
      fbo = null; fboTex = null; bw = bh = 0;
      if (W) alloc();
    }
    function alloc() {
      const w = Math.max(8, Math.round(W / (1 << tier))), h = Math.max(8, Math.round(Ymax / 2));
      if (w === bw && h === bh && fbo) return;
      if (fboTex) gl.deleteTexture(fboTex);
      if (!fbo) fbo = gl.createFramebuffer();
      fboTex = tex(w, h, gl.RGBA, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
      const okFb = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!okFb) throw new Error('aurora framebuffer incomplete');
      bw = w; bh = h;
    }
    const onLost = e => { e.preventDefault(); fail('context lost'); };
    const onRestored = () => { try { build(); api.ok = true; } catch (e) { fail(String(e)); } };

    function init(target, o = {}) {
      try {
        if (target && typeof target.drawArrays === 'function') { gl = target; cv = gl.canvas; own = false; }
        else {
          cv = target; own = true;
          const at = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: !!o.preserve, powerPreference: 'default' };
          gl = (!o.webgl1 && cv.getContext('webgl2', at)) || cv.getContext('webgl', at) || cv.getContext('experimental-webgl', at);
          if (!gl) return fail('no webgl');
          cv.addEventListener('webglcontextlost', onLost); cv.addEventListener('webglcontextrestored', onRestored);
        }
        api.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        build();
        api.ok = true; st = null;
        return true;
      } catch (e) { console.warn('sky-aurora:', e); return fail(String(e)); }
    }

    function resize(w, h, d = 1) {
      W = w; H = h; dpr = d; Ymax = Math.min(H, hyF * H + 8);
      if (own && cv) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      if (gl && api.ok) try { alloc(); } catch (e) { fail(String(e)); }
    }

    function fresh(t) {
      return { last: t, ds: { yellow: 0, blue: 0, green: 0, dawn: 0 }, sun: 0, ink: null, mt: t, tt: t, ag: t, tv: t * 0.7, pt: t, core: 0, amp: 0, pace0: 0, mode: [1, 1, 1], first: true };
    }

    function inputs(s) {
      const ret = s.ret ?? 0, tod = s.tod ?? 0, night = !!s.night;
      const sat = s.sat || { yellow: clamp(ret * 3, 0, 1), blue: clamp(ret * 3 - 1, 0, 1), green: clamp(ret * 3 - 2, 0, 1), dawn: ss(0.5, 0.85, tod) };
      const sunP = s.sunP ?? (s.sat ? 0 : night ? 0 : clamp((tod - 0.62) / 0.3, 0, 1));
      const heavy = s.heavy ?? clamp(((s.fog ?? 0.4) - 0.55) / 0.25, 0, 1);
      const rm = !!(s.rm ?? s.reduced ?? s.reducedMotion);
      const core = s.core != null ? +s.core : CORE.has(s.phase) ? 1 : 0;
      return { sat, sunP, heavy, rm, core, night, sweep: s.sweep || 0 };
    }

    function step(t, s, I) {
      if (!st) st = fresh(t);
      const dt = st.first ? 0 : clamp(t - st.last, 0, 0.05);
      st.first = false; st.last = t;
      const { sat, sweep, night } = I;
      for (const g of ['yellow', 'blue', 'green', 'dawn']) {
        const target = Math.max(sat[g] || 0, g === 'dawn' ? ease(sweep) : ease(sweep) * 0.9);
        st.ds[g] = dt ? ema(st.ds[g], target, dt, g === 'dawn' ? 1.4 : 0.8) : target;
      }
      const sunT = night ? 0 : I.sunP > 0 || (sat.dawn || 0) > 0.5 ? Math.max(I.sunP, sat.dawn || 0) : 0;
      st.sun = dt ? ema(st.sun, sunT, dt, 1.1) : sunT;
      const goal = I.core;
      st.core = dt ? (goal > st.core ? Math.min(goal, st.core + dt * 4) : Math.max(goal, st.core - dt * 4)) : goal;
      const mp = MODES[s.mode] || MODES.flow;
      st.mode = st.mode.map((v, i) => (dt ? ema(v, mp[i], dt, 0.8) : mp[i]));
      const live = 1 - st.core, rmK = I.rm ? 0.3 : 1;
      st.mt += dt * st.mode[0] * rmK * live;
      st.tt += dt * (I.rm ? 0 : 1) * live;
      st.ag += dt * (I.rm ? 0 : 1) * live * st.mode[0];
      st.tv += dt * 0.7 * rmK * live;
      st.pt += dt * (I.rm ? 0 : 1) * live;
      const paceIn = s.pace ?? 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 10);
      if (st.core <= 0) st.pace0 = paceIn;
      st.pace = lerp(paceIn, st.pace0, st.core);
      return dt;
    }

    function inkBands(t, dt, rm, sat, sweep) {
      const sw = ease(sweep) * 0.9, stagger = rm ? 0 : 0.09, tau = rm ? 0.6 : 0.2;
      if (!st.ink) st.ink = { at: {}, goal: {}, bands: BANDS.map(() => ({ yellow: st.ds.yellow, blue: st.ds.blue, green: st.ds.green })) };
      const k = st.ink;
      for (const g of ['yellow', 'blue', 'green']) {
        const goal = Math.max(sat[g] || 0, sw);
        if (Math.abs(goal - (k.goal[g] ?? goal)) > 0.02) k.at[g] = t;
        k.goal[g] = goal;
        k.bands.forEach((b, i) => { if (t - (k.at[g] ?? -9) >= i * stagger) b[g] = dt ? ema(b[g], goal, dt, tau) : goal; });
      }
      return k.bands;
    }

    function bandColours(t, dt, s, I) {
      if (Array.isArray(s.bands) && s.bands.length === 8) return s.bands;
      const d = st.ds, dl = s.daylight || 0, md = I.night ? 0 : d.dawn, nd = I.night ? d.dawn : 0;
      const ink = inkBands(t, dt, I.rm, I.sat, I.sweep);
      return BANDS.map((p, i) => {
        const b = ink[i];
        let c = skyAt(PAL.kaamos, p);
        c = mixc(c, skyAt(PAL.yellow, p), b.yellow);
        c = mixc(c, skyAt(PAL.blue, p), b.blue);
        c = mixc(c, skyAt(PAL.green, p), b.green);
        c = mixc(c, skyAt(PAL.daylight, p), dl * 0.55);
        c = mixc(c, skyAt(PAL.dawn, p), ease(clamp(md * 1.4 - (1 - p) * 0.4, 0, 1)));
        return mixc(c, skyAt(PAL.nightEnd, p), 0.6 * nd);
      });
    }

    const WB = BANDS.map((p, i) => ((BANDS[i + 1] ?? 1) - (BANDS[i - 1] ?? 0)) / 2);
    const lumY = cs => cs.reduce((a, c, i) => a + WB[i] * c[0] * c[0] * c[0], 0);
    const lerpCols = (a, b, k) => a.map((c, i) => c.map((v, j) => lerp(v, b[i][j], k)));
    function guard(cols, dt) {
      if (!st.shown || !dt) return (st.shown = cols);
      const cap = lumY(st.shown) * Math.exp(RISE * dt);
      if (lumY(cols) <= cap) return (st.shown = cols);
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (lumY(lerpCols(st.shown, cols, m)) > cap) hi = m; else lo = m; }
      return (st.shown = lerpCols(st.shown, cols, lo));
    }
    const slew = (k, v, dt, up, down) => (st[k] = !dt || st[k] == null ? v : v > st[k] ? Math.min(v, st[k] + up * dt) : Math.max(v, st[k] - down * dt));
    const K = new Float32Array(24), T = new Float32Array(24), PP = new Float32Array(BANDS);

    function render(t, s = {}) {
      if (!api.ok || !gl || gl.isContextLost()) return false;
      const t0 = performance.now();
      const hyN = s.hy ?? 0.6;
      const tN = clamp(s.tier | 0, 0, 2);
      if (Math.abs(hyN - hyF) > 1e-4 || tN !== tier) { hyF = hyN; tier = tN; Ymax = Math.min(H, hyF * H + 8); try { alloc(); } catch (e) { return fail(String(e)); } }
      const I = inputs(s), dt = step(t, s, I), d = st.ds, live = 1 - st.core;
      const night = I.night, dawn = d.dawn, md = night ? 0 : dawn, nd = night ? dawn : 0, dl = s.daylight || 0, heavy = I.heavy, sun = st.sun;
      const hy = hyF * H, u = H / 844, Ly = s.layers || {}, on = k => (Ly[k] === false ? 0 : 1);

      const bands = bandColours(t, dt, s, I), cols = guard(bands.map(oklab), dt);
      api.stats.bands = bands;
      for (let ch = 0; ch < 3; ch++) {
        const m = hermite(BANDS, cols.map(c => c[ch]));
        for (let i = 0; i < 8; i++) { K[i * 3 + ch] = cols[i][ch]; T[i * 3 + ch] = m[i]; }
      }

      const green = d.green, cg = ss(0.15, 0.55, green);
      let a = clamp(0.2 * (1 - heavy) + 1.1 * (s.aurora || 0) + 0.55 * green, 0, 1) * (night ? 1 - 0.4 * dawn : Math.pow(1 - Math.max(dawn, sun), 2)) * (1 - dl) * (1 - 0.9 * heavy);
      a *= (I.rm ? 0.95 + 0.1 * st.pace : 0.88 + 0.24 * st.pace) * st.mode[1];
      const ac = a * cg;
      st.amp = dt ? (ac > st.amp ? Math.min(ac, st.amp + dt * 0.3) : Math.max(ac, st.amp - dt * 1.2)) : ac;
      const unf = s.unfurl ?? clamp(green * 1.4, 0, 1), lx = s.lx ?? W * 0.35, R = I.rm ? 4 * W : unf * 1.3 * W + (unf >= 1 ? 4 * W : 0);
      const aAmp = st.amp * (I.rm ? Math.min(1, unf * 1.2) : 1);

      const sc = (s.worldX || 0) * (I.rm ? 0.5 : 1), mt = st.mt, moonX = () => Math.max(W * 0.25, W * 0.34 - sc * 0.02 * 0.25);

      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
      const prevFb = own ? null : gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texN);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB);

      const nightLeft = k => 1 - dawn * (night ? k : 1);
      const dens = clamp((s.stars ?? 120) / 160 + 0.3 * (s.sparkle || 0), 0.2, 1.4);
      const starA = nightLeft(0.45) * (1 - dl) * (1 - 0.8 * sun) * (1 - 0.55 * heavy) * Math.min(1, dens) * on('stars');
      const front = hy - (hy + 0.1 * H) * ease(dawn * (night ? 0.45 : 1) * 1.6), mwA = tier ? 0 : 0.03 * starA;
      const aOn = aAmp * on('aurora') > 0.002 || mwA > 0.002, agA = tier > 1 ? 0 : 0.03 * nightLeft(0.45) * st.mode[2] * (1 - dl) * on('airglow');
      let U = progA.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, bw, bh);
      if (!aOn && agA < 0.002) { gl.clearColor(0, 0, 0, 0.5); gl.clear(gl.COLOR_BUFFER_BIT); }
      else {
      gl.useProgram(progA.p);
      gl.uniform1i(U.uN, 0); gl.uniform1i(U.uB, 1);
      gl.uniform4f(U.uV, W / H, Ymax / H, W / H / bw, 0.0045);
      gl.uniform4f(U.uA, aAmp * on('aurora'), tier > 1 ? 0 : 1, 0.7 * live * (I.rm ? 0 : 1), 0);
      gl.uniform4f(U.uU, lx / H, R / H, (40 * u) / H, 1 / H);
      gl.uniform4f(U.uG, wrap(st.ag * 0.004, 64), wrap(st.ag * 0.0025, 64), moonX() / H, 0);
      const ax = (sc * 0.04) / H;
      gl.uniform1f(U.uX, ax);
      gl.uniform4f(U.uP, ((st.pt % PULSE) / SWEEP - 0.25) * (W / H) + ax, 0.055, 0, 0);
      CURTAINS.forEach((c, k) => {
        gl.uniform4f(U['uK' + k], c.lam, c.amp, c.gain, c.par);
        gl.uniform4f(U['uT' + k], wrap(mt * c.phase, Math.PI * 2000), wrap(mt * c.drift, 64), c.seed, c.hk);
        gl.uniform4f(U['uB' + k], c.base[0], c.base[1], (c.ext[0] * W) / H, (c.ext[1] * W) / H);
      });
      gl.uniform4f(U.uW, mwA, (0.55 * W - wrap(sc * 0.02, 8064)) / H, (0.3 * hy) / H, front / H);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
      const vw = own ? cv.width : Math.round(W * dpr), vh = own ? cv.height : Math.round(H * dpr), cut = s.full ? vh : Math.min(vh, Math.ceil((hy + 0.05 * H) * dpr));
      gl.viewport(0, 0, vw, vh);
      if (cut < vh) { const b7 = bands[7]; gl.clearColor(b7[0] / 255, b7[1] / 255, b7[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, vh - cut, vw, cut); }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fboTex);
      U = progS.u;
      gl.useProgram(progS.p);
      gl.uniform1i(U.uN, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uA, 2);
      gl.uniform4f(U.uV, W, H, dpr, hy);
      gl.uniform3fv(U.uK, K); gl.uniform3fv(U.uT, T); gl.uniform1fv(U.uP, PP); gl.uniform2f(U.uG2, H, hy);
      const ex = s.exposure ?? 1;
      gl.uniform4f(U.uM, Ymax, agA, on('aurora'), ex < 1 && md < 0.99 ? Math.min(0.5, (1 - ex) * 1.6) * (1 - md) : 0);
      gl.uniform4f(U.uS, starA, dens, 0.3 * live * (I.rm ? 0 : 1) * st.mode[2], front);
      gl.uniform4f(U.uS2, wrap(sc * 0.02, 8064), wrap(st.tt, 4096), 0, tier);
      gl.uniform4f(U.uGh, 0.85 * (1 - cg) * clamp(a / 0.25, 0, 1) * on('aurora'), sc * 0.04 * dpr, wrap(st.tv, Math.PI * 2000), 0);
      const sxp = (s.sunX ?? (A.FX && A.FX.SUN_X) ?? 0.72) * W;
      const moonA = nightLeft(0.3) * (1 - dl) * (1 - sun) * (1 - 0.4 * heavy);
      const bs = Math.max(0.05, d.blue, dawn), L = Math.min(1.05, lerp(0.6, 1, night ? 0 : dawn) + 0.12 * d.blue + 0.35 * dl);
      gl.uniform4f(U.uMo, moonX(), H * 0.09, H * 0.022, moonA * on('moon'));
      gl.uniform3fv(U.uMoC, grade(BIRCH, bs, L)); gl.uniform3fv(U.uMoG1, grade(FROST, bs, L)); gl.uniform3fv(U.uMoG2, grade(SILVER100, bs, L));
      const sp = slew('sunS', sun, dt, 0.25, 1);
      gl.uniform4f(U.uSu, sxp, lerp(hy + H * 0.03, hy - H * 0.1, ease(sp)), H * 0.03, sp > 0.005 ? sp * on('sun') : 0);
      const yb = d.yellow > 0.06 && dawn < 0.99 ? 0.2 * d.yellow * (1 - dawn) * (1 - 0.7 * heavy) : 0;
      gl.uniform4f(U.uHz, yb * on('glow'), slew('glowS', md > 0.01 || sun > 0.01 ? Math.max(md, sun) : 0, dt, 0.18, 1) * on('glow'), (nd > 0.01 ? nd : 0) * on('glow'), sxp);
      gl.bindBuffer(gl.ARRAY_BUFFER, rows); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, ROWS.length / 2);
      gl.disable(gl.SCISSOR_TEST);
      gl.activeTexture(gl.TEXTURE0);

      api.stats.ms = performance.now() - t0; api.stats.frames++;
      return true;
    }

    function destroy() {
      if (gl && !gl.isContextLost()) {
        for (const p of [progA, progS]) if (p) gl.deleteProgram(p.p);
        for (const t of [texN, texB, fboTex]) if (t) gl.deleteTexture(t);
        if (fbo) gl.deleteFramebuffer(fbo);
        for (const b of [quad, rows]) if (b) gl.deleteBuffer(b);
      }
      if (own && cv) { cv.removeEventListener('webglcontextlost', onLost); cv.removeEventListener('webglcontextrestored', onRestored); }
      gl = cv = progA = progS = quad = rows = texN = texB = fbo = fboTex = null; st = null; api.ok = false; bw = bh = 0;
    }

    return api;
  }

  A.Shaders['sky-aurora'] = Object.assign(create(), { create });
})();
