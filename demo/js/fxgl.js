(() => {
  const q = new URLSearchParams(location.search);
  const FX = A.FXGL = { on: false, bloom: true, k: 0, present() {} };
  if (q.get('fx') === '0') return;

  const GRADES = {
    idle: { warmth: 0, contrast: 1.03, sat: 1, lift: [0.010, 0.012, 0.022], gain: [1, 1, 1.01], bloom: 0.5, vig: 0.14 },
    flow: { warmth: 0, contrast: 1.04, sat: 1.02, lift: [0.010, 0.012, 0.022], gain: [1, 1, 1.01], bloom: 0.5, vig: 0.14 },
    calm: { warmth: 0.05, contrast: 0.97, sat: 0.94, lift: [0.024, 0.015, 0.010], gain: [1.03, 1, 0.95], bloom: 0.45, vig: 0.17 },
    wake: { warmth: -0.04, contrast: 1.08, sat: 1.05, lift: [0.004, 0.010, 0.024], gain: [0.98, 1.01, 1.04], bloom: 0.6, vig: 0.11 },
    fatigue: { warmth: 0.02, contrast: 0.98, sat: 0.96, lift: [0.030, 0.030, 0.036], gain: [1.02, 1.02, 1], bloom: 0.35, vig: 0.09 },
    rest: { warmth: -0.02, contrast: 0.95, sat: 0.74, lift: [0.016, 0.010, 0.030], gain: [0.95, 0.94, 0.99], bloom: 0.35, vig: 0.2 },
    dawn: { warmth: 0.03, contrast: 1.04, sat: 1.1, lift: [0.018, 0.012, 0.034], gain: [1.03, 1, 0.97], bloom: 0.7, vig: 0.08 },
    nightEnd: { warmth: 0.05, contrast: 0.98, sat: 0.95, lift: [0.022, 0.013, 0.012], gain: [1, 0.97, 0.92], bloom: 0.55, vig: 0.16 },
    kind: { warmth: 0.03, contrast: 0.98, sat: 0.9, lift: [0.022, 0.016, 0.016], gain: [1.01, 1, 0.98], bloom: 0.55, vig: 0.12 },
  };
  const CORE = new Set(['rest', 'checkin', 'rt']);
  const KEYS = ['warmth', 'contrast', 'sat', 'bloom', 'vig'];

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const PRE = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 px;uniform float thr,knee;
    vec3 s(vec2 o){return texture2D(t,vec2(v.x+o.x,1.-v.y+o.y)).rgb;}
    void main(){vec3 c=(s(-px)+s(px)+s(vec2(px.x,-px.y))+s(vec2(-px.x,px.y)))*.25;
    float b=max(c.r,max(c.g,c.b));float r=clamp(b-thr+knee,0.,2.*knee);r=r*r/(4.*knee+1e-4);
    float w=max(r,b-thr)/max(b,1e-4);float warm=clamp(.55+1.6*(c.r-c.b),.35,1.);gl_FragColor=vec4(c*w*warm,1.);}`;
  const DOWN = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 px;
    void main(){gl_FragColor=(texture2D(t,v-px)+texture2D(t,v+px)+texture2D(t,v+vec2(px.x,-px.y))+texture2D(t,v+vec2(-px.x,px.y)))*.25;}`;
  const BLUR = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;
    void main(){vec4 c=texture2D(t,v)*.2270270;
    c+=(texture2D(t,v+d*1.3846154)+texture2D(t,v-d*1.3846154))*.3162162;
    c+=(texture2D(t,v+d*3.2307692)+texture2D(t,v-d*3.2307692))*.0702703;gl_FragColor=c;}`;
  const COMP = `precision mediump float;varying vec2 v;uniform sampler2D t,ba,bb;
    uniform float k,warmth,contrast,sat,bloom,vig,aspect;uniform vec3 lift,gain;uniform vec4 wv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    vec3 cy(float l){vec3 a=vec3(.055,.102,.18),b=vec3(.118,.192,.376),e=vec3(.204,.314,.557),f=vec3(.553,.659,.831),g=vec3(.949,.933,.902);
    return l<.16?mix(a,b,l/.16):l<.36?mix(b,e,(l-.16)/.2):l<.66?mix(e,f,(l-.36)/.3):mix(f,g,clamp((l-.66)/.34,0.,1.));}
    void main(){vec3 c=texture2D(t,vec2(v.x,1.-v.y)).rgb;vec3 o=c;
    c*=vec3(1.+warmth,1.+.25*warmth,1.-warmth);
    c=(c-.42)*contrast+.42;
    float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,sat);
    c=c*gain+lift*(1.-c);
    if(wv.w>0.){float o=smoothstep(wv.z-.05,wv.z+.05,length((vec2(v.x,1.-v.y)-wv.xy)*vec2(aspect,1.)));
    float lw=dot(c,vec3(.2126,.7152,.0722)),keep=smoothstep(.04,.2,c.r-c.b)*smoothstep(.3,.6,lw);
    c=mix(c,cy(clamp(lw,0.,1.)),wv.w*o*(1.-keep));}
    vec3 b=(texture2D(ba,v).rgb*.6+texture2D(bb,v).rgb*.9)*bloom;
    c=1.-(1.-clamp(c,0.,1.))*(1.-clamp(b,0.,1.));
    vec2 q=(v-vec2(.5,.46))*vec2(aspect,1.);c*=1.-vig*smoothstep(.35,.95,length(q)*1.25);
    c+=(h(floor(gl_FragCoord.xy))-.5)*.022;
    gl_FragColor=vec4(mix(o,c,k),1.);}`;

  let gl, cv, src, progs, quad, scene, A1, A2, B1, B2, fw = 0, fh = 0;
  const cur = { ...GRADES.idle, lift: [...GRADES.idle.lift], gain: [...GRADES.idle.gain] };

  const shader = (type, s) => { const x = gl.createShader(type); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const program = fs => {
    const pr = gl.createProgram();
    gl.attachShader(pr, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const u = {}, n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); u[a.name] = gl.getUniformLocation(pr, a.name); }
    return { pr, u };
  };
  const tex = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    return t;
  };
  const target = (w, h) => {
    const t = tex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  };
  const drop = r => { if (r) { gl.deleteTexture(r.t); gl.deleteFramebuffer(r.f); } };

  const init = canvas => {
    src = canvas;
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
    gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    progs = { pre: program(PRE), down: program(DOWN), blur: program(BLUR), comp: program(COMP) };
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    scene = tex();
    canvas.parentNode.insertBefore(cv, canvas);
    if (getComputedStyle(canvas).position === 'static') canvas.style.position = 'relative';
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); off(); });
    FX.on = true;
  };
  const off = () => { FX.on = false; FX.failed = true; if (cv) cv.style.display = 'none'; };

  const size = () => {
    if (cv.width === src.width && cv.height === src.height && A1) return;
    cv.width = fw = src.width; cv.height = fh = src.height;
    [A1, A2, B1, B2].forEach(drop);
    const aw = Math.max(1, fw >> 2), ah = Math.max(1, fh >> 2), bw = Math.max(1, fw >> 3), bh = Math.max(1, fh >> 3);
    A1 = target(aw, ah); A2 = target(aw, ah); B1 = target(bw, bh); B2 = target(bw, bh);
  };

  const pass = (p, out, inputs, set) => {
    gl.useProgram(p.pr);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : null);
    gl.viewport(0, 0, out ? out.w : fw, out ? out.h : fh);
    inputs.forEach(([name, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[name], i); });
    set?.(p.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const goal = (V, s) => {
    const mix = (a, b, x) => {
      const o = {};
      for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * x;
      o.lift = a.lift.map((v, i) => v + (b.lift[i] - v) * x); o.gain = a.gain.map((v, i) => v + (b.gain[i] - v) * x);
      return o;
    };
    let g = GRADES[s && !s.done ? s.mode : 'idle'] || GRADES.flow;
    if (V.profile === 'bad_day') g = mix(g, GRADES.kind, 0.6);
    const dawn = Math.max(V.sunP || 0, V.sat?.dawn || 0);
    if (dawn > 0) g = mix(g, s?.night ? GRADES.nightEnd : GRADES.dawn, Math.min(1, dawn));
    return g;
  };

  let last = 0, warm = 0, slow = 0, win = [];
  const govern = (now, cost) => {
    const dt = last ? now - last : 16; last = now;
    if (dt > 100) { win = []; return; }
    win.push([dt, cost]);
    if ((warm += dt) < 2000 || win.length < 60) return;
    const med = i => win.map(x => x[i]).sort((a, b) => a - b)[win.length >> 1];
    const iv = med(0), pc = med(1); win = [];
    if (iv < 19) { slow = 0; return; }
    if (++slow < 2) return;
    slow = 0;
    if (FX.bloom) FX.bloom = false;
    else if (pc > 5) off();
  };

  FX.present = (canvas, V, s) => {
    if (FX.failed) return;
    const t0 = performance.now();
    try {
      if (!gl) init(canvas);
      size();
      const dt = Math.min(0.1, last ? (t0 - last) / 1000 : 0.016);
      const core = !!s && !s.done && CORE.has(s.phase);
      FX.k += ((core ? 0 : 1) - FX.k) * (1 - Math.exp(-dt / (core ? 0.25 : 0.8)));
      if (core && FX.k < 0.002) FX.k = 0;
      const g = goal(V, s), a = 1 - Math.exp(-dt / 0.7);
      for (const k of KEYS) cur[k] += (g[k] - cur[k]) * a;
      for (let i = 0; i < 3; i++) { cur.lift[i] += (g.lift[i] - cur.lift[i]) * a; cur.gain[i] += (g.gain[i] - cur.gain[i]) * a; }

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      const bl = FX.bloom && FX.k > 0.001 && cur.bloom > 0.01;
      if (bl) {
        pass(progs.pre, A1, [['t', scene]], u => { gl.uniform2f(u.px, 1 / fw, 1 / fh); gl.uniform1f(u.thr, 0.66); gl.uniform1f(u.knee, 0.16); });
        pass(progs.blur, A2, [['t', A1.t]], u => gl.uniform2f(u.d, 1 / A1.w, 0));
        pass(progs.blur, A1, [['t', A2.t]], u => gl.uniform2f(u.d, 0, 1 / A1.h));
        pass(progs.down, B1, [['t', A1.t]], u => gl.uniform2f(u.px, 0.5 / A1.w, 0.5 / A1.h));
        pass(progs.blur, B2, [['t', B1.t]], u => gl.uniform2f(u.d, 1.5 / B1.w, 0));
        pass(progs.blur, B1, [['t', B2.t]], u => gl.uniform2f(u.d, 0, 1.5 / B1.h));
      }
      pass(progs.comp, null, [['t', scene], ['ba', A1.t], ['bb', B1.t]], u => {
        gl.uniform1f(u.k, FX.k); gl.uniform1f(u.warmth, cur.warmth); gl.uniform1f(u.contrast, cur.contrast); gl.uniform1f(u.sat, cur.sat);
        gl.uniform1f(u.bloom, bl ? cur.bloom * (s?.game || s?.panel ? 0.7 : 1) : 0); gl.uniform1f(u.vig, cur.vig); gl.uniform1f(u.aspect, fw / fh);
        gl.uniform3fv(u.lift, cur.lift); gl.uniform3fv(u.gain, cur.gain);
        const w = A.World?.wave?.();
        gl.uniform4f(u.wv, w ? w.x : 0, w ? w.y : 0, w ? w.r : 0, w ? w.k : 0);
      });
      if (gl.isContextLost()) { off(); return; }
      const c = canvas.getContext('2d');
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height); c.restore();
      govern(t0, performance.now() - t0);
    } catch (e) {
      console.warn('fxgl off:', e.message);
      off();
    }
  };
})();
