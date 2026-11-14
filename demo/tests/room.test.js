// Run: node demo/tests/room.test.js
// Room climate on the phone: the home hub's `room` message into A.Sensors, the night hint (js/room.js), the
// "Your room" rows of the signals sheet and the session's context.room_temp_c. All numbers are test inputs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const room = (o = {}) => ({ type: 'room', temp_c: 21.5, humidity_pct: 40, source: 'modulino_thermo', simulated: false, age_s: 0, ...o });
const withRoom = (opts = {}) => {
  const t = load({ vitals: true, ...opts });
  const go = f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), t.ctx, { filename: f });
  go('hub.js');
  go('room.js');
  return { ...t, S: t.A.Sensors, R: t.A.Room };
};
const night = A => { A.night = () => true; };
const literals = js => (js.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g) || []).join('\n');
const groupOf = A => { const g = A.Vitals.model(A.now()).room; return g && plain(g); };

const tests = {
  'a: the hub message reaches A.Sensors.room as { celsius, humidity, source, at }'() {
    const { A, S, tick } = withRoom();
    assert.strictEqual(S.room(A.now()), null, 'nothing before the first message');
    tick(10);
    A.Hub.emit('room', room({ age_s: 4 }));
    assert.deepStrictEqual(plain(S.room(A.now())), { celsius: 21.5, humidity: 40, source: 'modulino_thermo', at: 6 }, 'at is on the A.now() clock, the reading\'s age taken off');
    tick(145.9);
    assert.ok(S.room(A.now()), 'still fresh a little under 150 s after the reading');
    tick(0.2);
    assert.strictEqual(S.room(A.now()), null, 'two missed readings: gone, never a stale number');
  },

  'b: simulated never counts as real, but is shown labelled'() {
    const { A, S, R } = withRoom();
    S.feedRoom(room({ simulated: true }));
    assert.strictEqual(S.room(A.now()), null);
    assert.strictEqual(S.roomFrame(A.now()).source, 'simulated');
    S.feedRoom(room({ source: 'simulated', simulated: false }));
    assert.strictEqual(S.room(A.now()), null);
    assert.deepStrictEqual(plain(R.rows(A.now()).map(r => [r.label, r.value, ...r.lines])), [['Room', '21.5', 'degrees Celsius · 40 % humidity', 'Simulated']]);
    night(A);
    S.feedRoom(room({ temp_c: 24, simulated: true }));
    assert.strictEqual(R.hint(A.now()), null, 'a simulated warm room never gives the hint');
  },

  'c: a fault or an unknown source is no reading, and a null clears the last one'() {
    const { A, S } = withRoom();
    for (const bad of [{ temp_c: 85 }, { temp_c: -40 }, { source: 'ky039' }, { source: undefined }]) {
      S.feedRoom(room());
      S.feedRoom(room(bad));
      assert.strictEqual(S.room(A.now()), null, JSON.stringify(bad));
    }
    assert.strictEqual(S.droppedRoom, 4);
    S.feedRoom(room({ humidity_pct: 140 }));
    assert.deepStrictEqual([S.room(A.now()).celsius, S.room(A.now()).humidity], [21.5, null], 'a humidity fault leaves the temperature');
    S.feedRoom(room({ temp_c: null, humidity_pct: null, source: null }));
    assert.strictEqual(S.room(A.now()), null);
    assert.strictEqual(S.droppedRoom, 4, 'a null from the hub is not a fault');
    S.feedRoom(room({ temp_c: '21.5' }));
    assert.strictEqual(S.room(A.now()), null, 'a string is not a number');
  },

  'd: the overlay line'() {
    const { A, S, R } = withRoom();
    assert.strictEqual(R.line(S.room(A.now())), null);
    S.feedRoom(room({ temp_c: 21.46, humidity_pct: 39.6 }));
    assert.strictEqual(R.line(S.room(A.now())), 'Room 21.5 °C · 40 %');
    S.feedRoom(room({ temp_c: 19, humidity_pct: null }));
    assert.strictEqual(R.line(S.room(A.now())), 'Room 19.0 °C');
  },

  'e: one gentle line at night when the room is warm, and only then'() {
    const { A, S, R } = withRoom();
    S.feedRoom(room({ temp_c: 22.5 }));
    assert.strictEqual(R.hint(A.now()), null, 'morning: nothing');
    night(A);
    assert.deepStrictEqual(plain(R.hint(A.now())), {
      celsius: 22.5, title: 'Your room is 22.5 °C tonight.', text: 'Sleep often comes more easily a little cooler, around 16 to 19 °C.',
    });
    S.feedRoom(room({ temp_c: 19.4 }));
    assert.strictEqual(R.hint(A.now()), null, 'within the range sleep research points to: nothing');
    S.feedRoom(room({ temp_c: 19.5 }));
    assert.ok(R.hint(A.now()));
    S.feedRoom(room({ temp_c: 15 }));
    assert.strictEqual(R.hint(A.now()), null, 'a cool room gets no advice');
    assert.strictEqual(R.hint(A.now(), false), null);
  },

  'f: the signals sheet has a "Your room" group, with icons from the font subset'() {
    const { A, S } = withRoom();
    assert.strictEqual(groupOf(A), null, 'no hub and no reading: no group');
    A.Hub.connected = true;
    assert.deepStrictEqual(groupOf(A), { title: 'Your room', rows: [{ icon: 'home', label: 'Room', value: null, lines: ['No reading from the bedside unit right now'] }] });
    S.feedRoom(room());
    assert.deepStrictEqual(groupOf(A).rows, [{ icon: 'home', label: 'Room', value: '21.5', lines: ['degrees Celsius · 40 % humidity', 'Bedside unit, through the home hub'] }]);
    assert.deepStrictEqual(A.Vitals.model(A.now()).rows[0].label, 'Pulse', 'the finger rows are untouched');
    const subset = fs.readFileSync(path.join(JS, '..', 'fonts', 'icon-names.txt'), 'utf8').split(',').map(x => x.trim());
    assert.ok(subset.includes('home') && subset.includes('bedtime'));
    assert.ok(fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8').includes('<span class="ms" aria-hidden="true">bedtime</span>'));
  },

  'g: the session records the measured room, and nothing for a simulated one'() {
    const go = sim => {
      const { A, S, tick } = withRoom();
      S.feedRoom(room({ temp_c: 20.84, simulated: sim }));
      let doc = null;
      A.bus.on('sessionEnd', d => { doc = d; });
      const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
      run(A, tick, s, 3);
      s.finish('partial');
      return plain(doc).context.room_temp_c;
    };
    assert.strictEqual(go(false), 20.8);
    assert.strictEqual(go(true), null);
  },

  'h: kind words only: no alarm, no orders, no claim of a lit room'() {
    const text = literals(fs.readFileSync(path.join(JS, 'room.js'), 'utf8'));
    for (const word of [/too (hot|warm|cold)/i, /warning/i, /danger/i, /\bshould\b/i, /\bmust\b/i, /unhealthy/i, /alert/i]) assert.strictEqual(word.test(text), false, String(word));
    assert.strictEqual(/(lights?|wakes?|fills?) (up )?(the|your) room|room (wakes|lights up)/i.test(text), false);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack || e.message); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
