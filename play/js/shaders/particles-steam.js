(() => {
  const A = window.A = window.A || {};
  A.Shaders = A.Shaders || {};

  const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const C = {
    birch: hex('#F2EEE6'), flake: hex('#EAF0FF'), flame: hex('#FFE3A6'), lit: hex('#FFC56B'), core: hex('#FFD27A'), amber: hex('#F5A445'), apricot: hex('#F3A57A'),
    skyNight: hex('#4A68A8'), skyDawn: hex('#C7B3CF'),
    sage: hex('#A9C79E'), paleSage: hex('#C8DDBE'), cream: hex('#F4EBD6'), puffShade: hex('#D3C5A8'), ceiling: hex('#C8D6BE'),
  };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const cyano = (c, k) => { const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return mix([l * 0.8, l * 0.92, Math.min(1, l * 1.1)], c, k); };
  const SPEED = { calm: 0.8, rest: 0.6, wake: 1.1, flow: 1, fatigue: 0.9 };

  const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uN;
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(uN,(mod(i,64.)+f+.5)/64.).r;}
vec2 vn2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(uN,(mod(i,64.)+f+.5)/64.).gb;}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float tpdf(){vec2 p=gl_FragCoord.xy;return (ign(p)+ign(p+vec2(37.,17.))-1.)/255.;}
`;

  const VHEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

  const SNOW_VS = `${VHEAD}// Snow: parallax point sprites with slow sway, after Alto's Odyssey and Journey's snowy ascent
attribute vec4 aS;
uniform vec2 uS;uniform float uDpr,uU,uT,uY,uWx,uScroll,uMaxPt,uPush,uSway,uPar,uDiam,uStretch,uHalo,uLs;
uniform vec4 uAl,uTo[4];uniform vec3 uL;
varying float vA,vLit,vPx,vRad,vSy,vHal;varying vec2 vDir;
void main(){
  float z=aS.z,w=aS.w,m=14.;vec2 E=uS+2.*m;
  float y=mod(aS.y*E.y+uY*(.8+.4*z),E.y)-m;
  float f=.1+.1*fract(w*7.31);
  float x=aS.x*E.x+uWx*uPar*(.8+.4*z)+uSway*(.6+.4*z)*sin(6.2832*f*uT+w*6.2832)-uScroll*uPar;
  vec2 p=vec2(mod(x,E.x)-m,y);
  vec2 d=p-uL.xy;float r=length(d)+.001,R=uL.z,n=clamp(1.-r/R,0.,1.);
  p+=(d/r)*.12*R*n*n*(3.-2.*n)*uPush+vec2(0.,-.06*R*n*uPush);
  for(int k=0;k<4;k++){vec4 o=uTo[k];vec2 e=p-o.xy;float l=length(e)+.001,g=clamp(1.-l/(90.*uU),0.,1.);
    p+=(e/l)*12.*uU*g*o.w*(1.-exp(-5.*o.z))*(1.-smoothstep(1.2,2.6,o.z));}
  vec2 dl=uL.xy-p;float rl=length(dl)+.001;
  float lit=R>1.?uLs*(1.-smoothstep(.3*R,R,rl)):0.;
  vDir=dl/rl;
  float rad=.25*uDiam*uDpr*uU*(.88+.24*fract(w*3.7))*(1.+.3*lit);
  float sy=1.+(uStretch-1.)*(.6+.4*z);
  float hal=rad*(1.+2.2*lit*uHalo);
  gl_PointSize=min(2.*max(rad*sy,hal)+3.,uMaxPt);
  vPx=gl_PointSize;vRad=rad;vSy=sy;vLit=lit;vHal=hal;
  vA=mix(uAl.x,uAl.y,fract(w*13.7))*(1.+.7*lit);
  gl_Position=vec4(p.x/uS.x*2.-1.,1.-p.y/uS.y*2.,0.,1.);
}`;

  const SNOW_FS = `${HEAD}
uniform vec3 uCol,uLit;uniform float uHalo;
varying float vA,vLit,vPx,vRad,vSy,vHal;varying vec2 vDir;
void main(){
  vec2 q=(gl_PointCoord-.5)*vPx;
  float d=length(vec2(q.x,q.y/vSy));
  float a=clamp(vA,0.,1.)*(1.-smoothstep(vRad-.55,vRad+.85,d));
  float side=clamp(.5+.6*dot(q,vDir)/max(vRad,1.),0.,1.);
  vec3 c=mix(uCol,uLit,vLit*(.55+.45*side));
  float h=uHalo*vLit*vLit*.32*clamp(vA,0.,1.)*exp(-d*d/(vHal*vHal*.35+.01))*(1.-a);
  gl_FragColor=vec4(c*a+uLit*h,a+h*.6);
}`;

  const GLOW_VS = `${VHEAD}attribute vec2 aP;attribute vec4 aQ;attribute vec3 aC;uniform vec2 uRes;varying vec4 vQ;varying vec3 vC;
void main(){vQ=aQ;vC=aC;gl_Position=vec4(aP.x/uRes.x*2.-1.,1.-aP.y/uRes.y*2.,0.,1.);}`;

  const GLOW_FS = `${HEAD}// Spirit light: honey core, amber halo, tapered path tail, after Ori's spirit light
uniform vec3 uAmber;varying vec4 vQ;varying vec3 vC;
void main(){
  vec4 o;
  if(vQ.w<.5){
    float s=abs(vQ.x),g=clamp(vQ.y,0.,1.);
    float a=vQ.z*(1.-smoothstep(.4,1.,s))*pow(1.-g,1.3);
    o=vec4(mix(vC,uAmber,smoothstep(0.,.75,g))*a,a);
  }else{
    float k=vQ.w-1.,l=length(vQ.xy),r=l/k;
    float core=1.-smoothstep(.78,1.1,r);
    float win=clamp(1.-l,0.,1.);win*=win;
    float halo=.5/(1.+r*r*.45)*win;
    float a=vQ.z*(core+(1.-core)*halo);
    o=vec4(vQ.z*(vC*core+uAmber*halo*(1.-core)),a);
  }
  gl_FragColor=o+tpdf()*o.a;
}`;

  const QUAD_VS = `${VHEAD}attribute vec2 aQ;uniform vec4 uR;uniform vec2 uRes;varying vec2 vP;
void main(){vP=uR.xy+aQ*uR.zw;gl_Position=vec4(vP.x/uRes.x*2.-1.,1.-vP.y/uRes.y*2.,0.,1.);}`;

  const STEAM_VS = `${VHEAD}attribute vec2 aP;attribute vec4 aR;uniform vec2 uRes;
varying vec2 vP;varying vec4 vR;
void main(){vP=aP;vR=aR;gl_Position=vec4(aP.x/uRes.x*2.-1.,1.-aP.y/uRes.y*2.,0.,1.);}`;

  const STEAM_FS = `${HEAD}// Loyly steam: braided flat strands with frayed tips, after the bent-veneer steam of concept 05
uniform vec4 uR,uA[8],uB[8],uD[8];uniform vec2 uO;uniform float uHs,uT,uAmt,uCnt,uFog,uLift,uF0;
uniform vec3 uC0,uC1,uC2,uFogC;
varying vec2 vP;varying vec4 vR;
vec3 tone(float i){return i<.5?uC0:i<1.5?uC1:uC2;}
void main(){
  float px=vP.x-uO.x,h=(uO.y-vP.y)/uHs,t=uT;
  vec4 acc=vec4(0.);
  if(uFog>.001){
    float n0=vn(vec2(vP.x/uHs*2.2+t*.05,vP.y/uHs*2.4-t*.09));
    vec2 fc=(vP-(uR.xy+uR.zw*vec2(.5,.36)))/(uR.zw*vec2(.5,.5));
    float f=uFog*.22*(1.-smoothstep(.3,1.,length(fc)+.3*(n0-.5)));
    f*=smoothstep(uLift-.08,uLift+.08,1.-(vP.y-uR.y)/uR.w+.06*(n0-.5));
    acc=vec4(uFogC*f,f);
  }
  if(h>-.02&&uAmt>.001){
    float hh=max(h,0.),ns=vR.y,cx=vR.x*uHs,F=uF0*(1.+2.*hh),wv=pow(hh,.8);
    vec4 s=vec4(0.);
    for(int i=0;i<8;i++){
      if(float(i)>=uCnt)break;
      vec4 a=uA[i],b=uB[i],d=uD[i];
      if(hh>a.w)continue;
      float x=cx+a.x*F+b.y*wv*sin(b.x*hh+a.z);
      float hw=a.y*(1.+.45*hh)*(.4+.6*smoothstep(0.,.07,hh));
      if(abs(px-x)>hw*3.+4.)continue;
      float f=clamp((hh-a.w+d.x)/d.x,0.,1.),m=d.y,dist=1e4;
      for(int j=0;j<3;j++){
        float fj=float(j);
        if(fj>=m)break;
        float o=(fj-(m-1.)*.5)*2./m;
        float wj=hw/m*(1.-smoothstep(.12+.14*fj,1.-.14*fj,f));
        float cj=x+o*hw*(1.+1.6*f)+f*f*hw*1.4*sin(d.w+fj*2.4+hh*11.);
        dist=min(dist,abs(px-cj)-wj);
      }
      float cov=clamp(.5-dist*ns,0.,1.)*d.z*smoothstep(-.01,.05,h)*(1.-.85*smoothstep(.3,1.,f));
      if(cov<=0.)continue;
      s=vec4(tone(b.w)*cov,cov)+s*(1.-cov);
    }
    float g=vn(gl_FragCoord.xy*.45)*.5+vn(gl_FragCoord.xy*1.3+19.)*.5;
    s.rgb*=1.+.04*(g-.5);
    acc=s+acc*(1.-s.a);
  }
  acc*=smoothstep(0.,uHs*.06,min(min(vP.x-uR.x,uR.x+uR.z-vP.x),vP.y-uR.y));
  gl_FragColor=acc+tpdf()*acc.a;
}`;

  const PUFF_FS = `${HEAD}// Loyly billows: fbm-thresholded soft circles, the cumulus where water meets the stones in concept 05
uniform vec4 uP[9],uQ[9];uniform float uNp;uniform vec3 uTop,uBot;
varying vec2 vP;
void main(){
  vec4 acc=vec4(0.);
  for(int i=0;i<9;i++){
    if(float(i)>=uNp)break;
    vec4 p=uP[i],q=uQ[i];
    vec2 d=(vP-p.xy)/p.z;
    float l=dot(d,d);
    if(l>2.4)continue;
    vec2 nq=d*1.15+q.xy;
    float n=vn(nq)*.6+vn(nq*2.2+7.)*.4;
    float a=smoothstep(0.,.2,1.-sqrt(l)+.4*(n-.5)-q.w)*p.w;
    vec3 c=mix(uTop,uBot,smoothstep(-.2,.95,d.y)*q.z);
    acc=vec4(c*a,a)+acc*(1.-a);
  }
  float g=vn(gl_FragCoord.xy*.45);
  acc.rgb*=1.+.03*(g-.5);
  gl_FragColor=acc+tpdf()*acc.a;
}`;

  const HAZE_FS = `${HEAD}
uniform sampler2D uSrc;uniform vec2 uRes,uO,uSz;uniform float uAmp,uT,uDpr,uFlip;
varying vec2 vP;
void main(){
  vec2 q=vec2((vP.x-uO.x)/(uSz.x*.5),(uO.y-vP.y)/uSz.y);
  float m=smoothstep(0.,.2,q.y)*(1.-smoothstep(.45,1.,q.y))*(1.-smoothstep(.3,1.,abs(q.x)));
  vec2 s=vec2(vP.x/(11.*uDpr),-vP.y/(26.*uDpr)-uT*1.3);
  vec2 n=(vn2(s)-.5)+.5*(vn2(s*2.03+vec2(17.,3.)-vec2(0.,uT*.9))-.5);
  vec2 uv=(gl_FragCoord.xy+n*uAmp*m*vec2(1.,.6))/uRes;
  if(uFlip<.5)uv.y=1.-uv.y;
  gl_FragColor=vec4(texture2D(uSrc,uv).rgb*m,m);
}`;

  const BACK_FS = `${HEAD}uniform sampler2D uSrc;uniform vec4 uFit;varying vec2 vP;uniform vec2 uRes;
void main(){gl_FragColor=vec4(texture2D(uSrc,(vP/uRes)*uFit.zw+uFit.xy).rgb,1.);}`;

  const fr = x => x - Math.floor(x);
  const h1 = (x, seed) => fr(Math.sin(x * 12.9898 + seed * 4.1) * 43758.5453);

  const STRAND_HW = [4.2, 7.6, 2.4, 6, 7.8, 3.6, 7, 3];
  const STRAND_ORDER = [3, 0, 5, 1, 6, 2, 7, 4];
  const STRAND_TONE = [0, 2, 0, 1, 0, 2, 1, 0];
  const TONE_OP = [0.92, 0.88, 0.95];
  const strandSet = seed => {
    const r = k => h1(k * 1.618 + 0.37, seed);
    return STRAND_HW.map((hw, i) => ({
      b: (r(i + 1) - 0.5) * 0.3, hw: hw * (0.85 + 0.3 * r(i + 11)), ph: 6.2832 * r(i + 21), tip: 0.1 * r(i + 31),
      k: 6.2832 * (1.2 + 1.1 * r(i + 41)), w: 0.75 + 0.5 * r(i + 51), amp: 0.012 + 0.016 * r(i + 61),
      tone: STRAND_TONE[i], fz: 30 + 30 * r(i + 81), m: r(i + 91) < 0.45 ? 2 : 3, curl: 6.2832 * r(i + 101),
    }));
  };

  function make() {
    let gl = null, cv = null, own = false, P = {}, B = {}, T = {}, maxPt = 64, NZ = null;
    let W = 390, H = 844, dpr = 2, last = null, ok = false;
    const st = { snowY: [0, 0, 0], wx: 0, ff: 0, steamT: 0, slew: {}, trails: new Map(), puffs: [], strands: new Map(), bdKey: null, lostHandler: null };
    const SNOW = [
      { n: 230, diam: 1.5, a: [0.4, 0.7], v: 7, sway: 2.5, par: 0.3, push: 0, tint: 0.7, stretch: 1, halo: 0, lit: 0.6 },
      { n: 300, diam: 2.5, a: [0.55, 0.9], v: 15, sway: 5, par: 0.6, push: 1, tint: 0.3, stretch: 1.08, halo: 0.7, lit: 1 },
      { n: 64, diam: 4, a: [0.75, 0.95], v: 30, sway: 9, par: 1.1, push: 0.6, tint: 0.04, stretch: 1.3, halo: 1, lit: 1 },
    ];

    const compile = (vs, fs) => {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const u = {}, a = {};
      for (let i = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS); i--;) { const n = gl.getActiveUniform(pr, i).name.replace(/\[0\]$/, ''); u[n] = gl.getUniformLocation(pr, n); }
      for (let i = gl.getProgramParameter(pr, gl.ACTIVE_ATTRIBUTES); i--;) { const n = gl.getActiveAttrib(pr, i).name; a[n] = gl.getAttribLocation(pr, n); }
      return { pr, u, a };
    };

    const noiseTex = () => {
      const d = new Uint8Array(64 * 64 * 4);
      let s = 0x9e3779b9;
      for (let i = 0; i < d.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = (s >>> 0) & 255; }
      NZ = d;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    };

    const seeds = (n, k) => {
      let s = 1234567 + k * 7919;
      const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const d = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { d[i * 4] = r(); d[i * 4 + 1] = r(); d[i * 4 + 2] = r(); d[i * 4 + 3] = r(); }
      return d;
    };

    const buf = (data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; };

    const ROWS = 160, ROWF = 6;
    const setup = () => {
      P.snow = compile(SNOW_VS, SNOW_FS);
      P.glow = compile(GLOW_VS, GLOW_FS);
      P.steam = compile(STEAM_VS, STEAM_FS);
      P.puff = compile(QUAD_VS, PUFF_FS);
      P.haze = compile(QUAD_VS, HAZE_FS);
      P.back = compile(QUAD_VS, BACK_FS);
      B.rowData = new Float32Array(ROWF * 2 * ROWS); B.rows = buf(B.rowData.byteLength, gl.DYNAMIC_DRAW);
      T.noise = noiseTex();
      B.quad = buf(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
      B.snow = SNOW.map((L, k) => buf(seeds(L.n, k)));
      B.glowData = new Float32Array(9 * 12000);
      B.glow = buf(B.glowData.byteLength, gl.DYNAMIC_DRAW);
      B.sa = new Float32Array(32); B.sb = new Float32Array(32); B.sd = new Float32Array(32);
      B.pp = new Float32Array(36); B.pq = new Float32Array(36);
      const pr = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      maxPt = pr ? pr[1] : 64;
    };

    const slew = (k, target, dt, up = 0.4, down = 0.3) => {
      const v = st.slew[k] ?? target;
      const r = target > v ? Math.min(target, v + dt / up) : Math.max(target, v - dt / down);
      st.slew[k] = r;
      return r;
    };

    const attrib = (p, name, size, stride = 0, off = 0) => {
      const l = p.a[name]; if (l === undefined || l < 0) return -1;
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, off);
      return l;
    };

    const bindNoise = p => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.noise); if (p.u.uN) gl.uniform1i(p.u.uN, 0); };

    const quadDraw = (p, rect) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, B.quad);
      const l = attrib(p, 'aQ', 2);
      gl.uniform4f(p.u.uR, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform2f(p.u.uRes, W * dpr, H * dpr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(l);
    };

    const uploadBackdrop = (img, key) => {
      if (!T.src) {
        T.src = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, T.src);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      if (st.bdKey === key) return;
      gl.bindTexture(gl.TEXTURE_2D, T.src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      st.bdKey = key; st.bdW = img.naturalWidth || img.width; st.bdH = img.naturalHeight || img.height;
    };

    const drawBackdrop = () => {
      const p = P.back, ia = st.bdW / st.bdH, ca = W / H;
      let sx = 1, sy = 1;
      if (ia > ca) sx = ca / ia; else sy = ia / ca;
      gl.useProgram(p.pr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.src); gl.uniform1i(p.u.uSrc, 0);
      gl.uniform4f(p.u.uFit, (1 - sx) / 2, (1 - sy) / 2, sx, sy);
      gl.disable(gl.BLEND);
      quadDraw(p, [0, 0, W * dpr, H * dpr]);
    };

    const ctxState = s => {
      const colour = clamp(s.ret ?? s.colour ?? 1, 0, 1), dawn = clamp(s.dawn ?? sstep(0.5, 0.9, s.tod ?? 0), 0, 1);
      const rm = !!s.rm, core = clamp(s.core ?? 0, 0, 1), u = H / 844;
      return { colour, dawn, rm, core, u, sp: (SPEED[s.mode] ?? 1) * (rm ? 0.45 : 1), lx: s.lx ?? W * 0.35, ly: s.ly ?? H * 0.7, lr: s.lr ?? 75 * u };
    };

    const drawSnow = (s, c, t, dt, layers) => {
      const amt = clamp(s.snow ?? 1, 0, 1);
      if (amt <= 0) return;
      const p = P.snow, u = c.u;
      gl.useProgram(p.pr); bindNoise(p);
      gl.uniform2f(p.u.uS, W, H); gl.uniform1f(p.u.uDpr, dpr); gl.uniform1f(p.u.uU, u);
      gl.uniform1f(p.u.uT, t % 1024); gl.uniform1f(p.u.uWx, st.wx); gl.uniform1f(p.u.uScroll, s.scroll || 0);
      gl.uniform1f(p.u.uMaxPt, maxPt);
      const tv = new Float32Array(16), now = t;
      (s.touches || []).slice(-4).forEach((o, i) => { const age = now - o.t; if (age >= 0 && age < 2.6) tv.set([o.x, o.y, age, (c.rm ? 0 : 1) * (1 - c.core)], i * 4); });
      gl.uniform4fv(p.u.uTo, tv);
      const sky = s.sky || mix(mix(C.skyNight, cyano(C.skyNight, 0), 0.25 * (1 - c.colour)), C.skyDawn, c.dawn);
      const near = mix(C.flake, mix(C.birch, C.apricot, 0.15), c.dawn * 0.6);
      gl.uniform3fv(p.u.uLit, C.lit);
      const aDay = 1 - 0.5 * c.dawn;
      for (const k of layers) {
        const L = SNOW[k];
        if (c.rm && k === 2) continue;
        const n = Math.round((c.rm ? L.n * 0.4 : L.n) * amt);
        if (!n) continue;
        gl.uniform3fv(p.u.uCol, mix(near, sky, L.tint));
        gl.uniform1f(p.u.uY, st.snowY[k]); gl.uniform3f(p.u.uL, c.lx, c.ly, c.lr * 1.2); gl.uniform1f(p.u.uLs, L.lit);
        gl.uniform1f(p.u.uPush, c.rm ? 0 : L.push); gl.uniform1f(p.u.uHalo, L.halo);
        gl.uniform1f(p.u.uDiam, L.diam); gl.uniform1f(p.u.uStretch, c.rm ? 1 : 1 + (L.stretch - 1) * (1 - 0.7 * c.dawn));
        gl.uniform4f(p.u.uAl, L.a[0] * aDay, L.a[1] * aDay, 0, 0);
        gl.uniform1f(p.u.uSway, L.sway * u * (c.rm ? 0.3 : 1)); gl.uniform1f(p.u.uPar, L.par * (c.rm ? 0.5 : 1));
        gl.bindBuffer(gl.ARRAY_BUFFER, B.snow[k]);
        const l = attrib(p, 'aS', 4);
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disableVertexAttribArray(l);
      }
    };

    const advance = (s, c, t, dt) => {
      const fall = (1 - 0.7 * sstep(0, 1, c.dawn)) * c.sp, u = c.u;
      SNOW.forEach((L, k) => { st.snowY[k] = (st.snowY[k] + L.v * u * fall * dt) % 100000; });
      const wind = (Math.sin(t * 0.13) * 0.6 + Math.sin(t * 0.071 + 2) * 0.4 - 0.1) * 14 * u * c.sp;
      st.wx = (st.wx + wind * dt) % 100000;
      st.ff += dt * c.sp;
      if (!c.rm) st.steamT += dt * c.sp;
    };

    let gv = 0;
    const vtx = (x, y, q0, q1, q2, q3, col) => {
      if (gv >= 12000) return;
      const d = B.glowData, o = gv * 9;
      d[o] = x * dpr; d[o + 1] = y * dpr; d[o + 2] = q0; d[o + 3] = q1; d[o + 4] = q2; d[o + 5] = q3; d[o + 6] = col[0]; d[o + 7] = col[1]; d[o + 8] = col[2];
      gv++;
    };
    const headQuad = (x, y, r, a, col) => {
      const R = r * 5, q = [[-1, -1], [1, -1], [-1, 1], [1, -1], [1, 1], [-1, 1]];
      for (const [qx, qy] of q) vtx(x + qx * R, y + qy * R, qx, qy, a, 1.2, col);
    };
    const tail = (pts, maxLen) => {
      if (pts.length < 2) return pts;
      const out = [pts[0]];
      let L = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
        if (L + d >= maxLen) { const k = (maxLen - L) / (d || 1); out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }); break; }
        L += d; out.push(b);
      }
      if (out.length < 3) return out;
      const sm = [], n = out.length, g = i => out[clamp(i, 0, n - 1)];
      for (let i = 0; i < n - 1; i++) {
        const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
        for (let k = 0; k < 3; k++) {
          const t = k / 3, t2 = t * t, t3 = t2 * t;
          const f = (a, b, c2, d) => 0.5 * (2 * b + (c2 - a) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (3 * b - a - 3 * c2 + d) * t3);
          sm.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
        }
      }
      sm.push(out[n - 1]);
      return sm;
    };
    const ribbon = (pts, w0, col, alpha) => {
      const n = pts.length;
      if (n < 2) return;
      const len = [0];
      for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const total = len[n - 1] || 1, L = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const g = len[i] / total, w = w0 * Math.pow(1 - g, 1.1) + 0.35;
        L.push([pts[i].x - dy * w, pts[i].y + dx * w, pts[i].x + dy * w, pts[i].y - dx * w, g]);
      }
      for (let i = 0; i < n - 1; i++) {
        const A0 = L[i], A1 = L[i + 1];
        const v = [[A0[0], A0[1], -1, A0[4]], [A0[2], A0[3], 1, A0[4]], [A1[0], A1[1], -1, A1[4]], [A1[2], A1[3], 1, A1[4]]];
        for (const j of [0, 1, 2, 1, 3, 2]) vtx(v[j][0], v[j][1], v[j][2], v[j][3], alpha, 0, col);
      }
    };

    const ffSeed = [];
    for (let i = 0; i < 40; i++) {
      const r = k => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
      ffSeed.push({ a1: 0.21 + 0.25 * r(1), a2: 0.47 + 0.4 * r(2), a3: 0.17 + 0.22 * r(3), a4: 0.53 + 0.3 * r(4), p1: 6.28 * r(5), p2: 6.28 * r(6), p3: 6.28 * r(7), p4: 6.28 * r(8), f: 0.14 + 0.2 * r(9), ph: 6.28 * r(10), cx: r(11), cy: r(12) });
    }
    const ffAt = (i, t, rect) => {
      const s = ffSeed[i];
      return {
        x: rect[0] + rect[2] * (0.5 + 0.3 * (s.cx - 0.5) + 0.32 * (0.62 * Math.sin(s.a1 * t + s.p1) + 0.38 * Math.sin(s.a2 * t + s.p2))),
        y: rect[1] + rect[3] * (0.5 + 0.3 * (s.cy - 0.5) + 0.3 * (0.6 * Math.sin(s.a3 * t + s.p3) + 0.4 * Math.sin(s.a4 * t + s.p4))),
        a: 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(6.2832 * s.f * t + s.ph), 2.4),
      };
    };

    const drawGlows = (s, c, t, dt) => {
      gv = 0;
      const u = c.u, live = 1 - c.core;
      const F = s.fireflies;
      const ffA = slew('ff', F && live > 0 ? clamp(F.amt ?? 1, 0, 1) * live : 0, dt, 0.6, 0.4);
      if (F && ffA > 0.001) {
        const rect = F.rect || [0, H * 0.2, W, H * 0.5], n = Math.min(40, F.n ?? 8), col = F.c || C.core;
        const K = c.rm ? 4 : 10, span = c.rm ? 0.2 : 0.7, r = (F.r ?? 2.6) * u;
        for (let i = 0; i < n; i++) {
          const pts = [];
          for (let k = 0; k < K; k++) pts.push(ffAt(i, st.ff - (k / (K - 1)) * span, rect));
          const a = pts[0].a * ffA;
          ribbon(tail(pts, (c.rm ? 8 : 18) * u), r * 0.8, col, 0.35 * a);
          headQuad(pts[0].x, pts[0].y, r, a, col);
        }
      }
      const seen = new Set();
      for (const m of s.motes || []) {
        const id = m.id ?? 'm';
        seen.add(id);
        let tr = st.trails.get(id);
        if (!tr) { tr = { h: [], gone: null }; st.trails.set(id, tr); }
        tr.gone = null; tr.r = (m.r ?? 4) * u; tr.c = m.c || C.core; tr.a = m.a ?? 1;
        if (tr.h[0] && (t - tr.h[0].t > 0.25 || t < tr.h[0].t)) tr.h.length = 0;
        const lastP = tr.h[0];
        if (!lastP || Math.hypot(lastP.x - m.x, lastP.y - m.y) > 0.5 || t - lastP.t > 0.03) tr.h.unshift({ x: m.x, y: m.y, t });
        if (tr.h.length > 48) tr.h.length = 48;
      }
      const span = c.rm ? 0.12 : 0.35;
      for (const [id, tr] of st.trails) {
        if (!seen.has(id)) { if (tr.gone === null) tr.gone = t; if (t - tr.gone > span) { st.trails.delete(id); continue; } }
        const pts = tail(tr.h.filter(p => t - p.t <= span), (c.rm ? 14 : 40) * u);
        const fade = tr.gone === null ? 1 : 1 - (t - tr.gone) / span;
        if (pts.length > 1) ribbon(pts, tr.r * 0.9, tr.c, 0.85 * tr.a * fade);
        if (tr.gone === null) headQuad(tr.h[0].x, tr.h[0].y, tr.r, tr.a, tr.c);
      }
      if (!gv) return;
      const p = P.glow;
      gl.useProgram(p.pr); bindNoise(p);
      gl.uniform2f(p.u.uRes, W * dpr, H * dpr); gl.uniform3fv(p.u.uAmber, C.amber);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.glow);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, B.glowData.subarray(0, gv * 9));
      const l = [attrib(p, 'aP', 2, 36, 0), attrib(p, 'aQ', 4, 36, 8), attrib(p, 'aC', 3, 36, 24)];
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, gv);
      l.forEach(x => x >= 0 && gl.disableVertexAttribArray(x));
    };

    const steamRect = (e, u) => e.rect || [e.x - 110 * u, e.y - 380 * u, 220 * u, 390 * u];

    const drawHaze = (s, c, t, dt) => {
      const src = s.sourceTex || (s.backdrop && T.src);
      if (!src || c.rm) return;
      const p = P.haze;
      (s.steam || []).forEach((e, i) => {
        const a = slew('hz' + i, clamp(e.haze ?? 0, 0, 1) * (1 - c.core), dt, 0.5, 0.4);
        if (a < 0.002) return;
        const w = (e.hw ?? 130) * c.u, h = (e.hh ?? 140) * c.u;
        gl.useProgram(p.pr); bindNoise(p);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(p.u.uSrc, 1);
        gl.uniform2f(p.u.uO, e.x * dpr, (e.hy ?? e.y) * dpr); gl.uniform2f(p.u.uSz, w * dpr, h * dpr);
        gl.uniform1f(p.u.uAmp, 2.6 * a * dpr * c.u); gl.uniform1f(p.u.uT, t % 1024); gl.uniform1f(p.u.uDpr, dpr);
        gl.uniform1f(p.u.uFlip, s.sourceTex ? (s.sourceFlipY ? 1 : 0) : 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        quadDraw(p, [(e.x - w / 2) * dpr, ((e.hy ?? e.y) - h) * dpr, w * dpr, h * dpr]);
      });
    };

    const vnJ = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const T0 = (a, b) => NZ[(((b & 63) << 6) + (a & 63)) << 2] / 255;
      const a0 = T0(ix, iy) + (T0(ix + 1, iy) - T0(ix, iy)) * sx, a1 = T0(ix, iy + 1) + (T0(ix + 1, iy + 1) - T0(ix, iy + 1)) * sx;
      return a0 + (a1 - a0) * sy;
    };
    const centre = (h, t, e) => e.lean * (h * 0.3 + h * h * 0.3) + Math.pow(h, 0.8) * (0.075 * Math.sin(6.6 * h - 0.5 * t + e.seed) + 0.025 * Math.sin(13.2 * h - 0.8 * t + e.seed * 2.3)) + 0.05 * h * (vnJ(h * 1.3 - t * 0.12, e.seed * 3.1) - 0.5);

    const steamRows = (e, t, r, hs, fan, full) => {
      const d = B.rowData, rows = Math.min(ROWS - 1, Math.max(8, Math.ceil(r[3] / 4)));
      const y0 = r[1], y1 = r[1] + r[3];
      let o = 0;
      for (let k = 0; k <= rows; k++) {
        const y = y0 + (y1 - y0) * k / rows, h = (e.y - y) / hs, hh = Math.max(h, 0);
        const c = centre(hh, t, e), sl = (centre(hh + 0.01, t, e) - c) * 100, ns = 1 / Math.sqrt(1 + sl * sl);
        let x0 = r[0], x1 = r[0] + r[2];
        if (!full) {
          const half = (0.5 * fan * (1 + 2 * hh) + 20 * e.u * (1 + 0.45 * hh) * 1.6 + 6) / ns + (0.03 * Math.pow(hh, 0.8) + 0.03) * hs;
          x0 = clamp(e.x + c * hs - half, r[0], r[0] + r[2]); x1 = clamp(e.x + c * hs + half, r[0], r[0] + r[2]);
        }
        for (const x of [x0, x1]) { d[o++] = x * dpr; d[o++] = y * dpr; d[o++] = c; d[o++] = ns; d[o++] = h; d[o++] = 0; }
      }
      return (rows + 1) * 2;
    };

    const drawSteam = (s, c, t, dt) => {
      const p = P.steam;
      (s.steam || []).forEach((e0, i) => {
        const amt = slew('st' + i, clamp(e0.amt ?? 0, 0, 1), dt, 0.45, 0.35);
        const fog = slew('fg' + i, clamp(e0.fog ?? 0, 0, 1), dt, 1.2, 0.6);
        if (amt < 0.002 && fog < 0.002) return;
        const u = c.u, seed = e0.seed ?? 1.7;
        const e = { x: e0.x, y: e0.y, lean: e0.lean ?? 0.4, seed, u };
        const N = Math.round(clamp(e0.strands ?? 7, 4, 8));
        if (!st.strands.has(seed)) st.strands.set(seed, strandSet(seed));
        const S = st.strands.get(seed);
        const r = steamRect(e0, u), hs = Math.max(40, e.y - r[1]), fan = (e0.fan ?? 44) * u;
        const tt = (c.rm ? seed * 3 : st.steamT * (e0.speed ?? 1)) % 1024, a = c.rm ? 0.85 * sstep(0, 0.05, amt) : amt;
        const top = Math.min(0.98, 0.12 + 0.88 * sstep(0, 1, a)), op = (e0.op ?? 1) * (c.rm ? amt : sstep(0, 0.25, a));
        const du = u * dpr;
        const ord = STRAND_ORDER.filter(k => k < N);
        for (let j = 0; j < 8; j++) {
          const k = j < N ? ord[j] : j, q = S[k], o = j * 4;
          B.sa[o] = (k + 0.5) / N - 0.5 + q.b / N; B.sa[o + 1] = q.hw * du; B.sa[o + 2] = q.ph - q.w * tt; B.sa[o + 3] = top - q.tip * top;
          B.sb[o] = q.k; B.sb[o + 1] = q.amp * hs * dpr; B.sb[o + 2] = 0; B.sb[o + 3] = q.tone;
          B.sd[o] = q.fz * u / hs; B.sd[o + 1] = q.m; B.sd[o + 2] = TONE_OP[q.tone] * op; B.sd[o + 3] = q.curl + 0.8 * tt;
        }
        const n = steamRows(e, tt, r, hs, fan, fog > 0.002);
        gl.useProgram(p.pr); bindNoise(p);
        gl.uniform2f(p.u.uRes, W * dpr, H * dpr); gl.uniform4f(p.u.uR, r[0] * dpr, r[1] * dpr, r[2] * dpr, r[3] * dpr);
        gl.uniform2f(p.u.uO, e.x * dpr, e.y * dpr); gl.uniform1f(p.u.uHs, hs * dpr); gl.uniform1f(p.u.uF0, fan * dpr);
        gl.uniform1f(p.u.uT, tt); gl.uniform1f(p.u.uAmt, op > 0.001 ? a : 0); gl.uniform1f(p.u.uCnt, N);
        gl.uniform4fv(p.u.uA, B.sa); gl.uniform4fv(p.u.uB, B.sb); gl.uniform4fv(p.u.uD, B.sd);
        gl.uniform1f(p.u.uFog, fog); gl.uniform1f(p.u.uLift, e0.lift ?? 0);
        const g = k => cyano(k, c.colour);
        gl.uniform3fv(p.u.uC0, g(C.sage)); gl.uniform3fv(p.u.uC1, g(C.paleSage)); gl.uniform3fv(p.u.uC2, g(C.cream));
        gl.uniform3fv(p.u.uFogC, g(mix(C.flame, C.ceiling, 0.35)));
        gl.bindBuffer(gl.ARRAY_BUFFER, B.rows);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, B.rowData.subarray(0, n * ROWF));
        const SB = ROWF * 4, l = [attrib(p, 'aP', 2, SB, 0), attrib(p, 'aR', 4, SB, 8)];
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, n);
        l.forEach(x => x >= 0 && gl.disableVertexAttribArray(x));
      });
    };

    const pourPuffs = (L, e, t, u, seed, k0) => {
      const n = 5 + Math.floor(h1(k0 * 3.7 + 0.5, seed) * 5);
      for (let j = 0; j < n; j++) {
        const r = q => h1(k0 * 17.3 + j * 5.1 + q * 1.37, seed);
        L.push({ t0: t + 0.09 * j, x: e.x + (r(1) - 0.55) * 60 * u, y: e.y - (2 + 14 * r(2)) * u, r: (20 + 16 * r(3)) * u, vx: ((r(4) - 0.6) * 24 + (e.lean ?? 0.4) * 16) * u, vy: -(55 + 70 * r(5)) * u, life: 1.3 + 0.2 * r(6), a: 0.95, nx: 40 * r(7), ny: 40 * r(8) });
      }
    };

    const drawPuffs = (s, c, t, dt) => {
      const p = P.puff, u = c.u;
      (s.steam || []).forEach((e, i) => {
        let S = st.puffs[i];
        if (!S) S = st.puffs[i] = { L: [], pour: e.pour, prev: 0, amb: 0, k: 0 };
        const tgt = clamp(e.amt ?? 0, 0, 1), seed = e.seed ?? 1.7;
        const list = [];
        if (c.rm) {
          const a = slew('pf' + i, tgt > 0.05 ? 0.8 : 0, dt, 0.5, 0.5);
          S.L.length = 0;
          if (a > 0.002) for (let j = 0; j < 6; j++) {
            const r = q => h1(j * 5.1 + q * 1.37, seed);
            list.push({ x: e.x + (r(1) - 0.55) * 64 * u, y: e.y - (6 + 26 * r(2)) * u, r: (13 + 13 * r(3)) * u, a: a * 0.9, nx: 40 * r(7), ny: 40 * r(8) });
          }
        } else {
          if ((e.pour != null && e.pour !== S.pour) || (S.prev < 0.05 && tgt >= 0.05)) { pourPuffs(S.L, e, t, u, seed, ++S.k); }
          S.pour = e.pour; S.prev = tgt;
          S.amb += dt * (tgt > 0.25 ? tgt : 0);
          if (S.amb > 0.35) {
            S.amb = 0; S.k++;
            const r = q => h1(S.k * 9.1 + q * 2.3, seed);
            S.L.push({ t0: t, x: e.x + (r(1) - 0.5) * 50 * u, y: e.y - 4 * u, r: (15 + 9 * r(2)) * u, vx: (r(3) - 0.4) * 16 * u, vy: -(40 + 30 * r(4)) * u, life: 1.5, a: 0.8, nx: 40 * r(5), ny: 40 * r(6) });
          }
          S.L = S.L.filter(q => t - q.t0 < q.life && t >= q.t0 - 1);
          while (S.L.length > 9) S.L.shift();
          for (const q of S.L) {
            const age = t - q.t0;
            if (age < 0) continue;
            const g = 1 - Math.pow(1 - Math.min(1, age / 0.4), 3), k = age / q.life;
            list.push({ x: q.x + q.vx * age, y: q.y + q.vy * age * (1 - 0.35 * k), r: q.r * (0.4 + 0.6 * g) * (1 + 0.6 * k), a: q.a * sstep(0, 0.08, age) * (1 - sstep(0.6, 1, k)), er: 0.75 * sstep(0.3, 1, k), nx: q.nx, ny: q.ny + age * 0.4 });
          }
        }
        if (!list.length) return;
        list.sort((a, b) => a.y - b.y);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        list.forEach((q, j) => {
          B.pp.set([q.x * dpr, q.y * dpr, q.r * dpr, q.a], j * 4); B.pq.set([q.nx, q.ny, 1, q.er || 0], j * 4);
          x0 = Math.min(x0, q.x - q.r * 1.6); x1 = Math.max(x1, q.x + q.r * 1.6); y0 = Math.min(y0, q.y - q.r * 1.6); y1 = Math.max(y1, q.y + q.r * 1.6);
        });
        gl.useProgram(p.pr); bindNoise(p);
        gl.uniform4fv(p.u.uP, B.pp); gl.uniform4fv(p.u.uQ, B.pq); gl.uniform1f(p.u.uNp, list.length);
        gl.uniform3fv(p.u.uTop, cyano(C.cream, c.colour)); gl.uniform3fv(p.u.uBot, cyano(C.puffShade, c.colour));
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        quadDraw(p, [x0 * dpr, y0 * dpr, (x1 - x0) * dpr, (y1 - y0) * dpr]);
      });
    };

    const api = {
      get ok() { return ok; },
      get canvas() { return cv; },
      init(target) {
        try {
          if (target && typeof target.createShader === 'function') { gl = target; own = false; cv = gl.canvas; }
          else {
            cv = target || document.createElement('canvas'); own = true;
            const o = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
            gl = cv.getContext('webgl2', o) || cv.getContext('webgl', o);
            if (!gl) return (ok = false);
            st.lostHandler = e => { e.preventDefault(); ok = false; };
            cv.addEventListener('webglcontextlost', st.lostHandler);
          }
          setup();
          ok = true;
        } catch (err) { console.warn('particles-steam', err); ok = false; }
        return ok;
      },
      resize(w, h, d = 1) {
        W = w; H = h; dpr = d;
        if (own && cv) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
      },
      render(t, s = {}) {
        if (!ok) return false;
        const dt = last === null ? 1 / 60 : clamp(t - last, 0, 0.05);
        last = t;
        const c = ctxState(s);
        advance(s, c, t, dt);
        if (s.backdrop && (st.bdKey !== s.backdrop || st.bdVer !== s.backdropVersion)) { st.bdKey = null; st.bdVer = s.backdropVersion; uploadBackdrop(s.backdrop, s.backdrop); }
        if (own) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, cv.width, cv.height);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          if (s.backdrop) drawBackdrop();
        }
        drawHaze(s, c, t, dt);
        drawSnow(s, c, t, dt, [0]);
        drawSteam(s, c, t, dt);
        drawPuffs(s, c, t, dt);
        drawSnow(s, c, t, dt, [1]);
        drawGlows(s, c, t, dt);
        drawSnow(s, c, t, dt, [2]);
        gl.disable(gl.BLEND);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.useProgram(null);
        gl.activeTexture(gl.TEXTURE0);
        return true;
      },
      destroy() {
        if (!gl) return;
        Object.values(P).forEach(p => gl.deleteProgram(p.pr));
        [B.quad, B.glow, B.rows, ...(B.snow || [])].forEach(b => b && gl.deleteBuffer(b));
        Object.values(T).forEach(t => gl.deleteTexture(t));
        if (st.lostHandler) cv.removeEventListener('webglcontextlost', st.lostHandler);
        if (own) { const l = gl.getExtension('WEBGL_lose_context'); l && l.loseContext(); }
        P = {}; B = {}; T = {}; gl = null; ok = false; last = null; st.trails.clear(); st.puffs.length = 0;
      },
    };
    return api;
  }

  const M = make();
  M.create = make;
  A.Shaders['particles-steam'] = M;
})();
