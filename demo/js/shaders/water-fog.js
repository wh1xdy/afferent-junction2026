(() => {
  const A = (window.A = window.A || {});
  A.Shaders = A.Shaders || {};

  const VS = 'attribute vec2 p;uniform float uTop;varying vec2 v;void main(){vec2 q=vec2(p.x,mix(-1.,uTop,p.y*.5+.5));v=q*.5+.5;gl_Position=vec4(q,0.,1.);}';

  const LIB = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;uniform sampler2D uN;uniform vec2 uWH,uOut;uniform float uDpr,uScale,uT;
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(uN,(i+f+.5)/64.).r;}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(17.3,9.1);a*=.5;}return s/.875;}
vec4 hs(vec2 p){return texture2D(uN,(floor(p)+.5)/64.);}
vec3 ok2lin(vec3 c){float l=c.x+.3963377774*c.y+.2158037573*c.z,m=c.x-.1055613458*c.y-.0638541728*c.z,s=c.x-.0894841775*c.y-1.291485548*c.z;l=l*l*l;m=m*m*m;s=s*s*s;
return vec3(4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s);}
vec3 toLin(vec3 c){c=max(c,0.);return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
vec3 toSrgb(vec3 c){c=max(c,0.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 capL(vec3 c,float m){float l=luma(c);return l>m?c*(m/l):c;}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float tpdf(){return ign(gl_FragCoord.xy)+ign(gl_FragCoord.xy+vec2(41.,17.))-1.;}
vec2 cssPx(){return vec2(gl_FragCoord.x*uScale,uOut.y-gl_FragCoord.y*uScale)/uDpr;}`;

  const RIP = `uniform float uHy,uRip,uWX,uSpd,uIce,uWake;
float W,H,hy,band;
float ripPh(vec2 px,out float sp,out float d){
  d=clamp((px.y-hy)/band,0.,1.);float zz=1./(d+.5),t=uT*uSpd;
  float X=(px.x-W*.5)/W*zz*2.4+uWX*.004;
  sp=band/(34.*zz*zz);
  return zz*34.+mod(t*.32,64.)+.5*fbm(vec2(X*1.3+t*.03,zz*3.));
}
void setup(){W=uWH.x;H=uWH.y;hy=uHy*H;band=H-hy;}`;

  const EDGE = `float fedge(float x,float base,float amp,float spd,float k){
  vec2 q=vec2(x/(uWH.x*.55)+uT*spd,k*5.3+uT*.011);
  q.x+=.35*vn(q*vec2(.7,1.)+vec2(uT*.02,k));
  return base+amp*(fbm(q)-.5)*2.;
}`;

  const FOG = `// Laminated fog sheets: banded haze with a light rim per sheet, sun-side peach and shade-side lilac at dawn, capped below the snow value (Alto's Odyssey layered haze, Inside capped fog, birch-ply lamination)
${LIB}
${EDGE}
uniform float uHy,uGy,uD,uCap,uWX,uMd,uCapF,uCapN;uniform vec2 uSheets;uniform vec3 uFar,uNear,uLit,uRimC,uShade,uPeach;uniform vec4 uLan,uSun,uHole;
vec4 sheet(vec2 px,float base,float amp,float spd,float fall,float tail,float k,float par,vec3 c,float a,float cap){
  float W=uWH.x,H=uWH.y,x=px.x+uWX*par,sx=1./(W*.55);
  float e=fedge(x,base,amp,spd,k),s=px.y-e,fe=.0035*H;
  float body=smoothstep(-fe,fe,s)*mix(exp(-max(s,0.)/fall),(.35+.65*exp(-max(s,0.)/fall))*exp(-max(s,0.)/(fall*4.)),tail);
  float flow=.82+.36*fbm(vec2(x*sx*3.1-uT*spd*1.9+k*3.,px.y/(H*.03)+k*1.7+uT*.03));
  float ab=a*body*flow,ar=0.;
  vec2 dl=(px-uLan.xy)/uLan.z;float lit=uLan.w/(1.+dot(dl,dl)*4.)*(1.-smoothstep(1.,2.2,length(dl)))*(1.-.75*uMd);
  float side=exp(-pow((px.x-uSun.x)/(W*.5),2.))*uSun.z;
  vec3 cc=mix(c,mix(uShade,uPeach,side),uMd*.85);
  vec3 cr=capL(mix(cc,uRimC,.65)+uLit*lit,cap);
  cc=capL(cc+uLit*lit*.6,cap*.94);
  float at=ab+ar;
  return vec4(cc*ab+cr*ar,at)/max(at,1.);
}
void main(){
  vec2 px=cssPx();float H=uWH.y,hy=uHy*H,gy=uGy*H;vec4 o=vec4(0.);vec4 s;
  float d=uD;
  if(uSheets.x>0.&&px.y>hy-.08*H&&px.y<hy+.06*H){
    s=sheet(px,hy-.047*H,.014*H,.010,.012*H,0.,1.,.25,mix(uFar,uRimC,.3),.24*d,uCapF);o=s+o*(1.-s.a);
    s=sheet(px,hy-.027*H,.011*H,-.007,.011*H,0.,2.,.3,uFar,.24*d,uCapF);o=s+o*(1.-s.a);
    s=sheet(px,hy-.009*H,.007*H,.013,.012*H,0.,3.,.36,mix(uFar,uNear,.35),.22*d,uCapF);o=s+o*(1.-s.a);
  }
  if(uSheets.y>0.&&px.y>gy-.11*H){
    s=sheet(px,gy-.075*H,.02*H,-.009,.03*H,1.,4.,.6,mix(uFar,uNear,.7),.28*d,uCapN);o=s+o*(1.-s.a);
    s=sheet(px,gy-.02*H,.024*H,.012,.04*H,1.,5.,.75,uNear,.28*d,uCapN);o=s+o*(1.-s.a);
    s=sheet(px,gy+.06*H,.03*H,-.015,.06*H,1.,6.,.95,uNear,.24*d,uCapN);o=s+o*(1.-s.a);
  }
  if(uHole.z>0.)o*=smoothstep(.75,1.25,length((px-uHole.xy)/uHole.zw));
  float a=min(o.a,uCap);vec3 c=o.a>1e-4?o.rgb/o.a:vec3(0.);
  gl_FragColor=vec4(toSrgb(c)*a+tpdf()/255.*step(.002,a),a);
}`;

  const WATER = `// Water body: cobalt gradient with a 0.6x compressed, tinted, half-contrast reflection broken into ripple rows (Alto's Odyssey lake, concept 01 water)
${LIB}
${RIP}
uniform float uRefl,uReflH;uniform vec3 uS0,uS1,uS2,uS3,uNear,uHor,uFrost,uLanC;uniform vec4 uLan,uWave;uniform sampler2D uR;
vec3 sky(float p){p=clamp(p,0.,1.);vec3 c=p<.5?mix(uS0,uS1,smoothstep(0.,.5,p)):p<.84?mix(uS1,uS2,smoothstep(.5,.84,p)):mix(uS2,uS3,smoothstep(.84,1.,p));return ok2lin(c);}
vec3 refl(float y,float x){
  y=clamp(y,0.,hy-.5);
  if(uRefl>.5)return toLin(texture2D(uR,vec2(x/W,y/(uReflH*H))).rgb);
  return sky(y/hy);
}
void main(){
  setup();
  vec2 px=cssPx();
  if(px.y<hy-3.){gl_FragColor=vec4(0.);return;}
  float dy=max(px.y-hy,0.),sp,d,ph=ripPh(px,sp,d),row=floor(ph),r=fract(ph);
  vec3 hz=sky(1.);
  vec3 body=mix(uHor,uNear,pow(d,.75));
  body=mix(body,mix(uHor,hz,.5),.5*exp(-dy/(H*.008)));
  float rip=uRip*(1.+uWake)*(1.-.8*uIce),rm=mod(row,64.);
  float xo=(hs(vec2(rm,3.)).r-.5)*rip*(1.5+10.*d)+sin(uT*.4+rm*1.7)*rip*.8*d;
  float ry=hy-dy/.6;
  vec3 Sk=sky(ry/hy),R=refl(ry,px.x+xo);
  R=mix(Sk+.5*(R-Sk),body,.35);
  float gap=smoothstep(.2,.32,r)*(1.-smoothstep(.6,.72,r)),vis=smoothstep(3.,6.,sp*uDpr);
  float w=.8*exp(-dy/(H*.07))*mix(1.,gap,smoothstep(.13*H,.17*H,dy)*vis);
  vec3 c=mix(body,R,w);
  vec2 q=(px-uLan.xy)/vec2(uLan.z,uLan.z*.4);float e=dot(q,q);
  c+=uLanC*uLan.w*.05/(1.+e*5.)*(1.-smoothstep(.7,1.6,e));
  if(uWave.w>.001){float wd=length((px-uWave.xy)*vec2(1.,2.2))-uWave.z;c+=uFrost*exp(-wd*wd/(H*H*.0036))*uWave.w*.06;}
  c=mix(c,mix(c,uFrost,.45),uIce);
  gl_FragColor=vec4(toSrgb(c)+tpdf()/255.,1.);
}`;

  const COMP = `// Composite: full-res analytic ripple dashes, short broken light columns and the shoreline rim over the half-res body, then fog (Alto's Odyssey lake lines, concept 01 lamp columns, Journey bar glints)
${LIB}
${RIP}
${EDGE}
uniform sampler2D uW,uF;uniform float uPass,uWSc,uFD,uFMd,uFCap;uniform vec2 uWS,uFS;uniform vec3 uFRim;
vec4 rim(vec2 px,vec4 o,float base,float amp,float spd,float k,float par,float a){
  float x=px.x+uWX*par,s=px.y-fedge(x,base,amp,spd,k);
  float al=a*clamp(1.1-abs(s)*uDpr,0.,1.)*smoothstep(.3,.62,vn(vec2(x/(uWH.x*.28)+uT*.015,k*7.)));
  return vec4(toSrgb(uFRim)*al,al)+o*(1.-al);
}
uniform vec3 uHiC,uLoC,uRimC,uFrost,uLanC;uniform vec4 uL[8],uLG[8];uniform vec3 uLC[8];uniform vec4 uLan,uWave;
float dash(float x,float row,float d,float seed){
  float cell=mix(36.,150.,d),dir=mod(row,2.)*2.-1.;
  float xs=x+hs(vec2(row,seed)).r*cell*7.+uT*dir*mix(2.,7.,d)*uDpr*uSpd;
  float ci=floor(xs/cell),xf=xs-ci*cell;vec4 h=hs(vec2(ci,row+seed));
  float len=cell*mix(.45,.85,h.g),a0=(cell-len)*h.r;
  return step(h.b,.38)*clamp(min(xf-a0,a0+len-xf)*.3,0.,1.);
}
void main(){
  setup();
  vec2 fc=gl_FragCoord.xy,px=cssPx();vec4 o=vec4(0.);
  if(uPass!=1.&&px.y>hy-1.){
    float a=clamp((px.y-hy)*uDpr+.5,0.,1.),dy=px.y-hy;
    vec3 c=toLin(texture2D(uW,fc/(uWSc*uWS)).rgb);
    float sp,d,ph=ripPh(px,sp,d),row=floor(ph),r=fract(ph),rm=mod(row,64.);
    float spd=sp*uDpr,vis=smoothstep(5.,9.,spd),rip=uRip*(1.+uWake)*(1.-.8*uIce),hw=mix(.5,.75,d);
    float hi=0.,lo=0.;
    if(vis>0.){
      hi=clamp(hw+.5-abs(r-.25)*spd,0.,1.);if(hi>0.)hi*=dash(fc.x,rm,d,0.)*vis;
      lo=clamp(hw*.8+.5-abs(r-.7)*spd,0.,1.);if(lo>0.)lo*=dash(fc.x,rm,d,31.)*vis;
    }
    float k=clamp(rip,0.,1.5)*(.28+.32*d);
    c=mix(c,uHiC,hi*k);c=mix(c,uLoC,lo*k*.6);
    vec2 q=(px-uLan.xy)/vec2(uLan.z,uLan.z*.4);float e=dot(q,q);
    float lit=uLan.w/(1.+e*5.)*(1.-smoothstep(.7,1.6,e));
    c+=uLanC*lit*(.8*hi+.25*lo);
    if(uWave.w>.001){float wd=length((px-uWave.xy)*vec2(1.,2.2))-uWave.z;c+=uFrost*exp(-wd*wd/(H*H*.0036))*uWave.w*.9*(hi+.5*lo);}
    c*=1.+.06*(texture2D(uN,vec2(fc.x*.0016,fc.y*.37)).g-.5);
    c=mix(c,uRimC,.6*clamp(.5-(abs(dy-.5)-.5)*uDpr,0.,1.));
    for(int i=0;i<8;i++){
      vec4 L=uL[i];if(L.w<.001)continue;
      vec4 G=uLG[i];float s=abs(L.z),len=G.x,xr=px.x-L.x,u=dy/len;
      if(u>1.2||abs(xr)>s*(G.z>.5?4.:3.)*(1.+u)+3.)continue;
      float fade=exp(-2.2*u)*smoothstep(-.5,1.,dy),m;
      if(G.z>.5){
        vec4 hb=hs(vec2(rm,float(i)*5.+7.));
        float bw=s*mix(1.,2.4,u)*(.7+.6*hb.r),xo=(hb.g-.5)*bw*.6*rip;
        float bx=1.-smoothstep(bw*.55,bw,abs(xr-xo));
        float by=clamp(.5-(abs(r-.5)-mix(.32,.12,u))*spd,0.,1.);
        m=bx*mix(1.,by,smoothstep(.06,.22,u)*vis);
      }else{
        float N=G.y,f=u*N,kk=floor(f),kn=kk/(N-1.),slot=len/N*uDpr;
        float th=max(mix(.7,.35,kn)*slot,1.),bw=s*mix(.45,1.1,kn)*(1.+.15*sin(uT*.5+kk*1.9+float(i)));
        float xx=(xr-sin(uT*.37+kk*2.3+float(i)*1.7)*s*.25*rip)/bw;
        m=clamp(.5-(abs(fract(f)-.5)*slot-th*.5),0.,1.)*step(kk,N-1.)*exp(-xx*xx*1.5);
      }
      c=mix(c,uLC[i],clamp(L.w*m*fade*1.15,0.,1.));
    }
    c=mix(c,.8+.2*(1.-exp(-(c-.8)*5.)),step(.8,c));
    o=vec4(toSrgb(c)*a,a);
  }
  if(uPass!=0.){
    vec4 f=texture2D(uF,fc/(2.*uFS));o=f+o*(1.-f.a);
    if(uFD>0.&&px.y>hy-.07*H&&px.y<hy+.002*H){
      float ra=.45*uFD*(1.-.45*uFMd);
      o=rim(px,o,hy-.047*H,.014*H,.010,1.,.25,ra);
      o=rim(px,o,hy-.027*H,.011*H,-.007,2.,.3,ra*.9);
      o=rim(px,o,hy-.009*H,.007*H,.013,3.,.36,ra*.75);
    }
  }
  o.rgb+=tpdf()/255.*step(.002,o.a);
  gl_FragColor=o;
}`;

  const SKY = {
    kaamos: ['#122858', '#27498A', '#4F74B8', '#86A4DA'], yellow: ['#1B3260', '#2C4680', '#4E62A0', '#8A88B0'],
    blue: ['#1F3A6E', '#33558F', '#7A86C0', '#B4A6CE'], green: ['#1A3262', '#2A4C86', '#5A7AB8', '#8EA4D2'],
    dawn: ['#6F86D6', '#B0A6E6', '#F3A57A', '#FFD58A'], nightEnd: ['#121A33', '#28294E', '#4A4470', '#6E6590'],
    daylight: ['#5C7FB8', '#9FB6DA', '#E8DCCB', '#FFF0D2'],
  };
  const SKY_AT = [0, 0.5, 0.84, 1];
  const SEA = { kaamos: ['#1B3470', '#3A5C9C'], blue: ['#2E5BB8', '#5A86D6'], dawn: ['#5B7DB8', '#A9B6D6'], nightEnd: ['#1C2148', '#46426E'] };
  const SNOW = { night: '#3E5384', blue: '#4C6699', dawn: '#E4D2CC', nightEnd: '#5A5680' };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(x => x / 255); };
  const lin = c => c.map(x => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  const ok = c => {
    const [r, g, b] = lin(c);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const okLin = ([L, a, b]) => {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  };
  const luma = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const OK = {};
  for (const k in SKY) OK[k] = SKY[k].map(h => ok(hex(h)));
  const OSEA = {}, OSNOW = {};
  for (const k in SEA) OSEA[k] = SEA[k].map(h => ok(hex(h)));
  for (const k in SNOW) OSNOW[k] = ok(hex(SNOW[k]));
  const C = {};
  for (const [k, h] of Object.entries({ frost: '#9DB9CC', lilac: '#B4A6CE', honey: '#FFD58A', moon: '#C4D3DF', fogNight: '#3E5A8C', fogDawn: '#C9B4D6', shade: '#A6A6D6', peach: '#F5C9A0', snow: '#F2EEE6', daylight: '#FFF0D2' })) C[k] = ok(hex(h));
  const mixv = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const wob = (t, f) => 0.5 * (Math.sin(6.2832 * f * t) + Math.sin(6.2832 * f * 0.731 * t + 1.7));
  const colOf = c => (Array.isArray(c) ? (c[0] > 1 || c[1] > 1 || c[2] > 1 ? c.map(x => x / 255) : c) : hex(c || '#FFD58A'));

  function noiseTex(gl) {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const d = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < d.length; i++) d[i] = (r() * 256) | 0;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    return t;
  }

  function create() {
    let gl = null, cv = null, own = false, progs = null, quad = null, nTex = null, rTex = null, fog = null, wtr = null;
    let W = 0, H = 0, dpr = 1, clock = 0, last = null, lost = false;
    const cur = { sun: 0, moon: 0, lan: 0, fog: 0, wake: 0, lights: new Float32Array(8) };
    const api = { ok: false, canvas: null, stats: { cpu: 0 } };

    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = fs => {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), name = a.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
      return { p, u };
    };
    const linTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      return t;
    };
    const target = (w, h, sc) => {
      const t = linTex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { t, f, w, h, sc };
    };
    const drop = r => { if (r && gl) { gl.deleteTexture(r.t); gl.deleteFramebuffer(r.f); } };
    const sized = sc => target(Math.max(1, Math.ceil(W * dpr / sc)), Math.max(1, Math.ceil(H * dpr / sc)), sc);

    api.init = target => {
      try {
        if (target && typeof target.getParameter === 'function') { gl = target; own = false; cv = gl.canvas; }
        else {
          cv = target || document.createElement('canvas'); own = true;
          const o = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
          gl = cv.getContext('webgl2', o) || cv.getContext('webgl', o);
          if (!gl) throw new Error('no webgl');
          cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; api.ok = false; });
        }
        progs = { fog: program(FOG), water: program(WATER), comp: program(COMP) };
        quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        nTex = noiseTex(gl); rTex = linTex();
        api.canvas = cv; api.ok = true; api.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      } catch (e) {
        console.warn('water-fog off:', e.message);
        api.ok = false; api.error = e.message;
      }
      return api.ok;
    };

    api.resize = (w, h, d = Math.min(2, window.devicePixelRatio || 1)) => {
      if (!api.ok) return;
      W = w; H = h; dpr = d;
      if (own) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
      drop(fog); drop(wtr);
      fog = sized(2); wtr = sized(2);
    };

    const slew = (k, goal, dt, up = 0.4, down = 0.3) => { cur[k] += clamp(goal - cur[k], -dt / down, dt / up); return cur[k]; };

    function look(s) {
      const tod = clamp(s.tod ?? 0, 0, 1), ret = clamp(s.ret ?? 0, 0, 1), sat = s.sat || {};
      const y = sat.yellow ?? clamp(ret * 3, 0, 1), b = sat.blue ?? clamp(ret * 3 - 1, 0, 1), g = sat.green ?? clamp(ret * 3 - 2, 0, 1);
      const dawn = sat.dawn ?? sstep(0.5, 0.85, tod), md = s.night ? 0 : dawn, nd = s.night ? dawn : 0, dl = s.mode === 'fatigue' ? 0.5 : 0;
      const sunP = s.night ? 0 : clamp((tod - 0.62) / 0.3, 0, 1);
      const stops = SKY_AT.map((p, i) => {
        let c = OK.kaamos[i];
        c = mixv(c, OK.yellow[i], y); c = mixv(c, OK.blue[i], b); c = mixv(c, OK.green[i], g);
        c = mixv(c, OK.daylight[i], dl * 0.55);
        c = mixv(c, OK.dawn[i], sstep(0, 1, clamp(md * 1.4 - (1 - p) * 0.4, 0, 1)));
        return mixv(c, OK.nightEnd[i], 0.6 * nd);
      });
      const sea = [0, 1].map(i => mixv(mixv(mixv(OSEA.kaamos[i], OSEA.blue[i], 0.35 + 0.65 * b), OSEA.dawn[i], md), OSEA.nightEnd[i], 0.6 * nd));
      const hor = stops[3];
      const far = mixv(mixv(hor, C.frost, 0.3), C.fogDawn, md * 0.6);
      let near = mixv(mixv(C.fogNight, C.frost, 0.3), mixv(C.frost, C.lilac, 0.5), md);
      if (s.mode === 'calm') near = mixv(near, C.honey, 0.08);
      const snow = s.snow ? ok(colOf(s.snow)) : mixv(mixv(mixv(OSNOW.night, OSNOW.blue, b), OSNOW.dawn, md), OSNOW.nightEnd, 0.6 * nd);
      const rim = mixv(mixv(hor, C.snow, 0.45), C.daylight, 0.3 * md);
      return { stops, sea, far, near, snow, rim, hor, dawn, md, nd, sunP, b };
    }

    api.render = (t, s = {}) => {
      if (!api.ok || lost || !fog) return 0;
      const t0 = performance.now();
      const dt = last === null ? 0 : clamp(t - last, 0, 0.1);
      last = t;
      const core = clamp(s.core ?? 0, 0, 1), rm = !!s.rm;
      clock = (clock + dt * (1 - core) * (rm ? 0.3 : 1)) % 1024;
      const L = look(s), hy = (s.hy ?? 0.6) * H, gy = (s.gy ?? 0.82) * H, pass = s.pass === 'water' ? 0 : s.pass === 'fog' ? 1 : 2;
      const sheets = s.sheets === 'far' ? [1, 0] : s.sheets === 'near' ? [0, 1] : [1, 1];
      const mode = s.mode || 'flow', calm = mode === 'calm' || mode === 'rest';
      const fogTop = sheets[0] ? hy - 0.09 * H : gy - 0.12 * H, top = Math.min(1, 1 - 2 * fogTop / H), wTop = Math.min(1, 1 - 2 * (hy - 4) / H);
      const flick = (rm ? 0.5 : 1) * (1 - core) * (0.06 * wob(clock, 1.6) + 0.04 * wob(clock + 7, 0.5));
      const lanGoal = clamp(s.lantern ?? 1, 0, 1.5) * (1 + flick);
      const lan = dt ? slew('lan', lanGoal, dt, 0.12, 0.3) : (cur.lan = lanGoal);
      const sunA = s.sun?.a ?? L.sunP, moonA = s.moon?.a ?? (1 - L.dawn) * (s.mode === 'fatigue' ? 0.4 : 1);
      dt ? (slew('sun', sunA, dt, 0.5), slew('moon', moonA, dt, 0.5)) : ((cur.sun = sunA), (cur.moon = moonA));
      const pace = s.pace ?? 0.5 + 0.5 * Math.sin(clock * 2 * Math.PI * 0.1);
      const fogGoal = clamp(s.fog ?? 0.5, 0, 1.4) * (1 - 0.45 * L.dawn) * (0.9 + 0.2 * pace);
      const fogD = (dt ? slew('fog', fogGoal, dt, 1.5, 1.5) : (cur.fog = fogGoal)) * (1 - 0.6 * cur.sun);
      const wakeGoal = clamp(s.wake ?? L.b, 0, 1);
      const wake = dt ? slew('wake', wakeGoal, dt, 0.6, 0.6) : (cur.wake = wakeGoal);

      const lights = [];
      const sx = s.sun?.x ?? W * 0.72, sy = s.sun?.y ?? hy + H * 0.03 + (-H * 0.13) * sstep(0, 1, L.sunP);
      if (cur.sun > 0.003) lights.push([sx, sy, -H * 0.022, 0.8 * cur.sun, hex('#FFD58A')]);
      const mx = s.moon?.x ?? W * 0.34, my = s.moon?.y ?? H * 0.09;
      if (cur.moon > 0.003) lights.push([mx, my, -H * 0.006, 0.16 * cur.moon, hex('#C4D3DF')]);
      for (const l of s.lights || []) if (lights.length < 8) lights.push([l.x, l.y, Math.max(0.5, l.s ?? 2.2), l.a ?? 0.6, colOf(l.c)]);
      const Lv = new Float32Array(32), Lg = new Float32Array(32), Lc = new Float32Array(24), nc = lights.filter(l => l[2] < 0).length;
      lights.forEach((l, i) => {
        const goal = l[3], cel = l[2] < 0, h = Math.max(hy - l[1], Math.abs(l[2]) * 3.5), hr = ((i - nc) * 0.618034 + 0.31) % 1;
        cur.lights[i] += dt ? clamp(goal - cur.lights[i], -dt / 0.3, dt / 0.4) : goal - cur.lights[i];
        Lv.set([l[0], l[1], l[2], cur.lights[i]], i * 4);
        Lg.set(cel ? [clamp(4 * h, 0.08 * H, (H - hy) * 0.85), 0, 1, 0] : [h * (3 + 2 * hr), 3 + Math.floor(hr * 3.99), 0, 0], i * 4);
        Lc.set(lin(l[4]), i * 3);
      });
      for (let i = lights.length; i < 8; i++) cur.lights[i] = 0;

      const lx = s.lx ?? W * 0.3, ly = s.ly ?? gy - H * 0.02;
      const lanC = lin(hex('#FFD58A')), honey = lanC.map(x => x * 0.7);
      const snowL = luma(okLin(L.snow)), horL = luma(okLin(L.hor));
      const ow = Math.round(W * dpr), oh = Math.round(H * dpr);
      const wantSc = s.full ? 1 : 2;
      if (wtr.sc !== wantSc) { drop(wtr); wtr = sized(wantSc); }

      const prevFb = own ? null : gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const prevVp = own ? null : gl.getParameter(gl.VIEWPORT);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
      const common = (u, sc) => {
        gl.uniform2f(u.uWH, W, H); gl.uniform2f(u.uOut, ow, oh); gl.uniform1f(u.uScale, sc); gl.uniform1f(u.uDpr, dpr); gl.uniform1f(u.uT, clock);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, nTex); gl.uniform1i(u.uN, 0);
      };
      const rip = (calm ? 0.6 : mode === 'wake' ? 1.15 : 0.9) * (rm ? 0.6 : 1);
      const ripU = u => {
        gl.uniform1f(u.uHy, hy / H); gl.uniform1f(u.uRip, rip); gl.uniform1f(u.uIce, clamp(s.ice ?? 0, 0, 1)); gl.uniform1f(u.uWake, wake * 0.6);
        gl.uniform1f(u.uWX, s.worldX ?? 0); gl.uniform1f(u.uSpd, calm ? 0.6 : mode === 'wake' ? 1.2 : 1);
        gl.uniform3fv(u.uFrost, okLin(C.frost));
        gl.uniform4f(u.uLan, lx, ly, H * 0.2, lan * 0.9); gl.uniform3fv(u.uLanC, lanC);
        const wv = s.wave; gl.uniform4f(u.uWave, wv?.x ?? 0, wv?.y ?? 0, wv?.r ?? 0, core > 0 || rm ? 0 : clamp(wv?.a ?? 0, 0, 1));
      };

      if (pass !== 0) {
        const { p, u } = progs.fog;
        gl.useProgram(p); gl.bindFramebuffer(gl.FRAMEBUFFER, fog.f); gl.viewport(0, 0, fog.w, fog.h);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(u.uTop, top);
        common(u, 2);
        gl.uniform1f(u.uHy, hy / H); gl.uniform1f(u.uGy, gy / H); gl.uniform1f(u.uD, fogD * (calm ? 1.1 : 1)); gl.uniform2f(u.uSheets, sheets[0], sheets[1]);
        gl.uniform1f(u.uCap, s.profile === 'bad_day' ? 0.45 : 0.55); gl.uniform1f(u.uWX, s.worldX ?? 0); gl.uniform1f(u.uMd, L.md);
        gl.uniform1f(u.uCapF, horL * 0.97); gl.uniform1f(u.uCapN, snowL * 0.95);
        gl.uniform3fv(u.uFar, okLin(L.far)); gl.uniform3fv(u.uNear, okLin(L.near)); gl.uniform3fv(u.uRimC, okLin(L.rim));
        gl.uniform3fv(u.uShade, okLin(C.shade)); gl.uniform3fv(u.uPeach, okLin(C.peach)); gl.uniform3fv(u.uLit, honey);
        const hole = s.hole; gl.uniform4f(u.uHole, hole?.x ?? 0, hole?.y ?? 0, hole?.rx ?? 0, hole?.ry ?? 1);
        gl.uniform4f(u.uLan, lx, ly, H * 0.2, lan);
        gl.uniform4f(u.uSun, sx, sy, cur.sun, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      if (pass !== 1) {
        const { p, u } = progs.water;
        gl.useProgram(p); gl.bindFramebuffer(gl.FRAMEBUFFER, wtr.f); gl.viewport(0, 0, wtr.w, wtr.h);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(u.uTop, wTop);
        common(u, wtr.sc); ripU(u);
        const refl = !!s.reflect;
        if (refl) {
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rTex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.reflect);
          gl.uniform1i(u.uR, 1);
        }
        gl.uniform1f(u.uRefl, refl ? 1 : 0); gl.uniform1f(u.uReflH, s.reflectH ?? hy / H);
        L.stops.forEach((c, i) => gl.uniform3fv(u['uS' + i], c));
        gl.uniform3fv(u.uNear, okLin(L.sea[0])); gl.uniform3fv(u.uHor, okLin(L.sea[1]));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      {
        const { p, u } = progs.comp;
        gl.useProgram(p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb); gl.viewport(0, 0, ow, oh);
        if (own) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
        else { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
        common(u, 1); ripU(u);
        gl.uniform1f(u.uTop, pass === 0 ? wTop : pass === 1 ? top : Math.max(top, wTop)); gl.uniform1f(u.uPass, pass);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, wtr.t); gl.uniform1i(u.uW, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fog.t); gl.uniform1i(u.uF, 2);
        gl.uniform2f(u.uWS, wtr.w, wtr.h); gl.uniform1f(u.uWSc, wtr.sc); gl.uniform2f(u.uFS, fog.w, fog.h);
        gl.uniform3fv(u.uHiC, okLin(mixv(mixv(L.hor, C.frost, 0.3), L.sea[1], 0.25))); gl.uniform3fv(u.uLoC, okLin(mixv(L.sea[0], [0.2, 0, -0.05], 0.25)));
        gl.uniform3fv(u.uRimC, okLin(L.rim));
        const fr = okLin(L.rim), fl = luma(fr);
        gl.uniform3fv(u.uFRim, fr.map(x => x * Math.min(1, (horL * 0.97) / fl)));
        gl.uniform1f(u.uFD, pass !== 0 && sheets[0] ? fogD : 0); gl.uniform1f(u.uFMd, L.md);
        gl.uniform4fv(u.uL, Lv); gl.uniform4fv(u.uLG, Lg); gl.uniform3fv(u.uLC, Lc);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (!own) { gl.disable(gl.BLEND); gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]); }
      if (gl.isContextLost()) { lost = true; api.ok = false; }
      const cost = performance.now() - t0;
      api.stats.cpu = api.stats.cpu * 0.9 + cost * 0.1;
      return cost;
    };

    api.finish = () => { if (gl && !lost) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } };

    api.destroy = () => {
      if (gl && !lost) {
        drop(fog); drop(wtr); fog = wtr = null;
        if (progs) for (const k in progs) gl.deleteProgram(progs[k].p);
        [nTex, rTex].forEach(t => t && gl.deleteTexture(t));
        if (quad) gl.deleteBuffer(quad);
        if (own) gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      gl = progs = null; api.ok = false;
    };
    api.create = create;
    return api;
  }

  A.Shaders['water-fog'] = create();
})();
