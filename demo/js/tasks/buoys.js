(() => {
  // M18 Buoy Trail: Trail Making part A. Drag a rope through buoys 1..8 in number order (taps on the next buoy also work).
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, ring, unit, dragCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, E = J.ease, R = Math.random, ID = 'buoys', N = 8, MAX = 20;

  const segDist = (x0, y0, x1, y1, cx, cy) => {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp(((cx - x0) * dx + (cy - y0) * dy) / l2, 0, 1) : 0;
    return Math.hypot(x0 + dx * t - cx, y0 + dy * t - cy);
  };

  // Spread positions in box units (u, v); distance measured with a typical 1.15 aspect.
  const place = () => {
    for (let md = 0.24; md > 0.08; md -= 0.02) {
      for (let tries = 0; tries < 60; tries++) {
        const pts = [];
        let guard = 0;
        while (pts.length < N && guard++ < 400) {
          const u = 0.12 + 0.76 * R(), v = 0.16 + 0.64 * R();
          if (pts.every(p => Math.hypot((p.u - u) * 1.15, p.v - v) >= md)) pts.push({ u, v });
        }
        if (pts.length === N) return pts;
      }
    }
    return Array.from({ length: N }, (_, i) => ({ u: 0.15 + 0.7 * ((i % 4) / 3), v: 0.25 + 0.4 * Math.floor(i / 4) }));
  };

  const ropeLine = (ctx, pts, U, a = 1) => {
    if (pts.length < 2 || a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = ctx.lineJoin = 'round';
    for (const [lw, k, c] of [[9, 0.12, C.amber], [4, 0.28, C.glow], [1.6, 0.9, C.flame]]) {
      ctx.strokeStyle = rgb(c, a * k); ctx.lineWidth = lw * U; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['flow', 'wake'], role: 'Trail Making A (buoys 1 to 8 in a night harbour)', minS: 15,
    make() {
      const buoys = place().map((p, i) => ({ ...p, n: i + 1, on: null, wob: -9, inside: false, ph: R() * 6.283, x: 0, y: 0, r: 14, hit: 26 }));
      const ripples = Array.from({ length: 22 }, () => ({ u: R(), v: 0.14 + 0.86 * R(), w: 0.04 + 0.08 * R(), ph: R() * 6.283 }));
      return base(ID, MAX, {
        buoys, ripples, next: 0, a0: J.at, b: null, bot: null, touching: false, touched: false, fp: null,
        t0: null, tLast: null, gaps: [], lifts: 0, outro: 1.4, doneAt: null,
        extra: { v: 1, n_buoys: N, completion_ms: null, ms_per_link_median: null, order_errors: 0, links: 0, lifts: 0 },

        lay(b) {
          const U = unit(b);
          for (const o of this.buoys) {
            o.x = b.x + o.u * b.w; o.y = b.y + o.v * b.h; o.r = 13 * U;
            const dmin = Math.min(...this.buoys.filter(q => q !== o).map(q => Math.hypot((q.u - o.u) * b.w, (q.v - o.v) * b.h)));
            o.hit = Math.max(22, Math.min(o.r + 12 * U, dmin * 0.48));
          }
          return U;
        },
        px(u, v) { const b = this.b; return [b.x + u * b.w, b.y + v * b.h]; },
        uv(x, y) { const b = this.b; return [(x - b.x) / b.w, (y - b.y) / b.h]; },
        target() { return this.buoys[this.next] || null; },
        last() { return this.next > 0 ? this.buoys[this.next - 1] : null; },
        at_(x, y) {
          let best = null, bd = Infinity;
          for (const o of this.buoys) { const d = Math.hypot(x - o.x, y - o.y); if (d < o.hit && d < bd) { bd = d; best = o; } }
          return best;
        },

        sync() {
          const links = Math.max(0, this.next - 1);
          Object.assign(this.extra, {
            completion_ms: this.t0 !== null && this.tLast !== null && links > 0 ? K.ms(this.tLast - this.t0) : null,
            ms_per_link_median: K.ms(K.median(this.gaps)), order_errors: this.errors, links, lifts: this.lifts,
          });
          this.items = this.next;
        },

        link(o, t) {
          o.on = J.at; o.inside = false;
          if (this.next === 0) this.t0 = t; else this.gaps.push(t - this.tLast);
          this.tLast = t; this.next++; this.lastIn = this.t;
          const U = unit(this.b);
          fx.burst(o.x, o.y, 8, C.glow, 120 * U, { kind: 'spark', size: [4 * U, 1] });
          J.bloom(o.x, o.y, o.r * 3 + 20 * U, C.glow, 0.35, 0.12, 0.35);
          J.border(this.next / N);
          if (this.next < N) { hap('light'); sfx('buoys_link', { i: this.next - 1, piano: [3 + ((this.next - 1) % 5), 0.12] }); }
          else {
            this.sync(); finish(this, t); this.doneAt = J.at; this.touching = false; this.fp = null;
            hap('success'); sfx('buoys_done'); J.border(1); J.spill(0.35);
          }
        },

        wrong(o) {
          this.errors++; o.wob = J.at; o.inside = true;
          const tg = this.target(); if (tg) tg.wob2 = J.at;
          hap('tick'); sfx('buoys_wrong');
          fx.drip(o.x, o.y + o.r);
        },

        touch(o, t) {
          if (!o || o.on !== null) return;
          if (o === this.target()) this.link(o, t);
          else if (!o.inside) this.wrong(o);
        },

        down(u, v, t) {
          if (this.done || !this.b) return;
          this.lay(this.b);
          const [x, y] = this.px(u, v);
          this.lastIn = this.t; this.touching = true; this.touched = true; this.fp = [x, y];
          this.touch(this.at_(x, y), t);
          this.sync();
        },

        move(u, v, t) {
          if (this.done || !this.touching || !this.fp || !this.b) return;
          const [x, y] = this.px(u, v), [x0, y0] = this.fp;
          this.fp = [x, y]; this.lastIn = this.t;
          const tg = this.target();
          if (tg && segDist(x0, y0, x, y, tg.x, tg.y) < tg.hit) { this.link(tg, t); this.sync(); return; }
          for (const o of this.buoys) {
            if (o.on !== null || o === tg) continue;
            const inn = Math.hypot(x - o.x, y - o.y) < o.hit;
            if (inn && !o.inside) this.wrong(o);
            else if (!inn && o.inside) o.inside = false;
          }
          this.sync();
        },

        up(u, v, t) {
          if (!this.touching) return;
          this.touching = false;
          for (const o of this.buoys) o.inside = false;
          if (this.done || !this.b) return;
          const [x, y] = this.px(u, v), l = this.last();
          if (l && this.next < N && Math.hypot(x - l.x, y - l.y) > l.hit) this.lifts++;
          this.fp = null;
          this.sync();
        },

        update(dt, now) {
          if (this.done) return;
          if (this.touching && this.fp && this.last() && !rm() && R() < dt * 12) {
            const l = this.last(), p = R();
            fx.trailMote(lerp(l.x, this.fp[0], p), lerp(l.y, this.fp[1], p), C.flame);
          }
        },

        auto(dt, now) {
          if (this.done || !this.b) return;
          const B = this.bot || (this.bot = { at: now + 0.8 + 0.4 * R(), path: null });
          if (now < B.at) return;
          const tg = this.target();
          if (!tg) return;
          if (B.path) {
            const p = clamp((now - B.path.t0) / B.path.dur, 0, 1), q = E.inOut(p);
            this.move(...this.uv(lerp(B.path.x0, B.path.x1, q), lerp(B.path.y0, B.path.y1, q)), now);
            if (p >= 1 || this.target() !== B.path.for) B.path = null;
            return;
          }
          if (!this.touching) { this.down(...this.uv(tg.x + (R() - 0.5) * 8, tg.y + (R() - 0.5) * 8), now); B.at = now + 0.08; return; }
          const [x0, y0] = this.fp, l = this.last();
          const wrongs = this.buoys.filter(o => o.on === null && o !== tg && !o.inside);
          if (wrongs.length && this.next > 1 && R() < 0.1) {
            const o = wrongs[Math.floor(R() * wrongs.length)];
            B.path = { t0: now, dur: 0.35, x0, y0, x1: o.x, y1: o.y, for: tg };
            return;
          }
          const d = l ? Math.hypot(tg.x - l.x, tg.y - l.y) / Math.max(1, this.b.w) : 0.3;
          B.path = { t0: now, dur: 0.4 + 0.5 * d + 0.12 * R(), x0, y0, x1: tg.x, y1: tg.y, for: tg };
        },

        drawBuoy(ctx, o, U, at) {
          const bob = rm() ? 0 : Math.sin(at * 1.4 + o.ph) * 1.6 * U, [wx] = J.wobble(at - o.wob);
          const x = o.x + wx * U, y = o.y + bob, r = o.r, lit = o.on !== null, tg = o === this.target() && !this.done;
          // reflection
          ctx.save(); ctx.globalAlpha *= 0.25;
          ctx.fillStyle = rgb(lit ? C.amber : mixc(C.coralSoft, C.night700, 0.4));
          ctx.beginPath(); ctx.ellipse(x, o.y + r * 1.25, r * 0.8, r * 0.35, 0, 0, 6.283); ctx.fill(); ctx.restore();
          if (!rm()) ring(ctx, x, o.y + r * 0.85, r * (1.15 + 0.08 * Math.sin(at * 1.4 + o.ph)), C.silver300, 0.18, 1 * U);
          if (lit) {
            const dt = at - o.on;
            glow(ctx, x, y, r * 3, C.amber, 0.45);
            if (dt < 0.4 && !rm()) ring(ctx, x, y, r * (1.3 + 2 * E.outSoft(dt / 0.4)), C.glow, 0.7 * (1 - dt / 0.4), 2 * U);
          } else if (tg && this.next > 0) {
            glow(ctx, x, y, r * 2.4, C.glow, 0.18 + (rm() ? 0 : 0.08 * Math.sin(at * 3)));
          }
          const w2 = at - (o.wob2 ?? -9);
          if (w2 >= 0 && w2 < 0.8) glow(ctx, x, y, r * 3, C.glow, 0.35 * Math.sin(Math.PI * w2 / 0.8));
          const body = lit ? mixc(C.amber, C.daylight, 0.25) : mixc(C.coralSoft, C.silver500, 0.35);
          disc(ctx, x, y, r, mixc(body, C.night900, 0.45));
          disc(ctx, x, y, r * 0.88, body);
          ctx.fillStyle = rgb(C.silver050, 0.85);
          ctx.fillRect(x - r * 0.88, y - r * 0.16, r * 1.76, r * 0.32);
          disc(ctx, x - r * 0.35, y - r * 0.42, r * 0.18, C.silver050, 0.5);
          ctx.fillStyle = rgb(C.night900, 0.92);
          ctx.font = '600 ' + Math.round(11 * U) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(o.n), x, y + 0.5 * U);
          if (lit) sprite(ctx, 'glow', C.glow, x, y - r * 1.05, 6 * U, 0.8, true);
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = this.lay(b), T = at - this.a0;
          K.card(ctx, b, mixc(C.night700, C.violet500, 0.15), C.night950);
          K.clip(ctx, b);
          K.star(ctx, b, 18, U, at, 18, 0.45);
          // far shore and pier lights
          const hz = b.y + b.h * 0.1;
          ctx.fillStyle = rgb(C.night900); ctx.beginPath(); ctx.moveTo(b.x, hz + 4 * U);
          for (let i = 0; i <= 10; i++) ctx.lineTo(b.x + b.w * i / 10, hz - (i % 3 === 1 ? 6 : 2) * U);
          ctx.lineTo(b.x + b.w, hz + 6 * U); ctx.lineTo(b.x, hz + 6 * U); ctx.fill();
          for (let i = 0; i < 5; i++) { const lx = b.x + b.w * (0.12 + 0.19 * i); glow(ctx, lx, hz - 2 * U, 7 * U, C.warm, 0.5); disc(ctx, lx, hz - 2 * U, 1.2 * U, C.sun); }
          const wg = ctx.createLinearGradient(0, hz, 0, b.y + b.h);
          wg.addColorStop(0, rgb(mixc(C.tealDeep, C.night800, 0.7))); wg.addColorStop(1, rgb(C.night900));
          ctx.fillStyle = wg; ctx.fillRect(b.x, hz + 4 * U, b.w, b.h);
          ctx.lineCap = 'round';
          for (const r of this.ripples) {
            const x = b.x + ((r.u + (rm() ? 0 : at * 0.004)) % 1) * b.w, y = b.y + r.v * b.h, a = 0.08 + (rm() ? 0.04 : 0.05 * Math.sin(at * 0.8 + r.ph));
            ctx.strokeStyle = rgb(C.silver300, a); ctx.lineWidth = 1.2 * U;
            ctx.beginPath(); ctx.moveTo(x - r.w * b.w / 2, y); ctx.lineTo(x + r.w * b.w / 2, y); ctx.stroke();
          }
          // rope
          const linked = this.buoys.slice(0, this.next).map(o => [o.x, o.y]);
          ropeLine(ctx, linked, U, 0.9);
          const l = this.last();
          if (l && this.touching && this.fp && !this.done) {
            ropeLine(ctx, [[l.x, l.y], this.fp], U, 0.6);
            sprite(ctx, 'glow', C.flame, this.fp[0], this.fp[1], 12 * U, 0.6, true);
          }
          for (const o of this.buoys) this.drawBuoy(ctx, o, U, at);
          K.progress(ctx, b, N, this.next, U);
          if (!this.done && !this.touched && T > 1.0) {
            const a = this.buoys[0], c = this.buoys[1];
            dragCue(ctx, m => [lerp(a.x, c.x, m), lerp(a.y, c.y, m)], U, T - 1.0, clamp((T - 1.0) / 0.4, 0, 1), 2.4);
          }
          ctx.restore();
        },
      });
    },
  });
})();
