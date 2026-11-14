// Room climate in the app. The bedside unit's thermometer (Modulino Thermo) reaches the phone through the home hub,
// about one reading a minute, as a `room` message (hub/afferent_hub/bedside/controller.py); A.Sensors keeps it.
// The finger clips' Bluetooth packet carries no room climate.
//
// One gentle response: at night, on the start screen before the wind-down games, a room warmer than WARM_C gets one
// quiet line. Sleep research points to a cool bedroom, roughly 16 to 19 °C. The line asks nothing and changes nothing
// else, and only a measured room counts: a simulated reading never shows it.
(() => {
  const S = A.Sensors;
  const SLEEP_C = [16, 19], WARM_C = 19.5;
  const c1 = x => x.toFixed(1), pct = x => `${Math.round(x)} %`;

  // "Room 21.5 °C · 40 %": the one line for the live vitals overlay. null without a measured room.
  const line = r => r ? `Room ${c1(r.celsius)} °C${r.humidity == null ? '' : ` · ${pct(r.humidity)}`}` : null;

  // The night hint, or null. `night` defaults to the app's clock (A.night, main.js).
  const hint = (now, night = typeof A.night === 'function' && A.night()) => {
    const r = S.room(now);
    if (!night || !r || r.celsius < WARM_C) return null;
    return {
      celsius: r.celsius,
      title: `Your room is ${c1(r.celsius)} °C tonight.`,
      text: `Sleep often comes more easily a little cooler, around ${SLEEP_C[0]} to ${SLEEP_C[1]} °C.`,
    };
  };

  // The "Your room" rows of the signals sheet (vitals.js). A simulated reading is shown, labelled.
  const rows = now => {
    const r = S.roomFrame(now);
    if (!r) return A.Hub?.connected ? [{ icon: 'home', label: 'Room', value: null, lines: ['No reading from the bedside unit right now'] }] : [];
    const unit = r.humidity == null ? 'degrees Celsius' : `degrees Celsius · ${pct(r.humidity)} humidity`;
    return [{ icon: 'home', label: 'Room', value: c1(r.celsius), lines: [unit, r.source === 'simulated' ? 'Simulated' : 'Bedside unit, through the home hub'] }];
  };

  const render = () => {
    const el = typeof document !== 'undefined' && document.getElementById?.('roomHint');
    if (!el || typeof A.now !== 'function') return;
    const h = hint(A.now()), key = h ? h.title : '';
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.hidden = !h;
    if (h) { el.querySelector('.rh-title').textContent = h.title; el.querySelector('.rh-text').textContent = h.text; }
  };

  A.Hub?.on('room', d => { S.feedRoom(d); render(); });
  A.bus?.on('home', render);
  if (typeof document !== 'undefined' && document.getElementById) { setInterval(render, 1000); addEventListener('load', render); }

  A.Room = { SLEEP_C, WARM_C, line, hint, rows, render };
})();
