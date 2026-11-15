// Run: node demo/tests/hubfind.test.js
// Settings › Home hub › Find on this Wi-Fi (js/hubfind.js): the iPhone plugin's answer (AfferentHubFinder.swift) becomes
// a hub address that keeps the key the phone already has, the advert is never asked for a key, and the wiring between
// the door on the Jetson (jetson/home_hub/door), Info.plist and the plugin names one Bonjour type. Addresses are test values.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { JS } = require('./harness');

const ROOT = path.join(JS, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KEY = '/k/0123456789abcdef0123456789abcdef0123456789abcdef';
const BRIDGE = 'http://10.0.33.66:8000' + KEY;              // what a phone paired through the Mac relay has saved
const DOOR = { name: 'Afferent home hub wendyos-hackathon-device-12', host: '10.0.32.31', port: 8800 };

// hubfind.js on its own, with a phone whose plugin answers `answer` (or throws it, when it is an Error)
const finder = ({ native = true, ios = true, answer = { state: 'ok', hubs: [DOOR] } } = {}) => {
  const asked = [];
  const plugin = { find: async opts => { asked.push(opts); if (answer instanceof Error) throw answer; return answer; } };
  const ctx = { console };
  ctx.window = ctx;
  if (native != null) {
    ctx.Capacitor = { isNativePlatform: () => native, isPluginAvailable: n => ios && n === 'AfferentHubFinder', Plugins: ios ? { AfferentHubFinder: plugin } : {} };
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx, { filename: 'util.js' });
  vm.runInContext(fs.readFileSync(path.join(JS, 'hubfind.js'), 'utf8'), ctx, { filename: 'hubfind.js' });
  return { F: ctx.A.HubFind, asked };
};

// main.js's own hub state and normHub, cut out as they are (the same cut as settings.test.js)
const hubStatus = (typed, saved = '') => {
  const main = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
  const norm = main.match(/\n  const normHub = [\s\S]*?\n  \};\n/)[0], status = main.match(/\n  const hubHasKey = [\s\S]*?\n  \};\n/)[0];
  return [...vm.runInNewContext(`${norm}\nconst savedHub = ${JSON.stringify(saved)};${status}\nhubStatus();`,
    { A: { Hub: { url: null, connected: false, retry: 0, httpBase: () => null } }, $: () => ({ value: typed }) })];
};

const tests = {
  'a: a phone paired through the Mac moves to the door and keeps its key'() {
    return (async () => {
      const { F, asked } = finder();
      assert.strictEqual(F.available(), true);
      const r = await F.find(BRIDGE);
      assert.strictEqual(r.state, 'found');
      assert.strictEqual(r.address, '10.0.32.31:8800' + KEY);
      assert.strictEqual(r.keyed, true);
      assert.strictEqual(r.say, F.SAY.keyed);
      assert.deepStrictEqual(hubStatus(r.address, BRIDGE), ['none', 'Not connected yet. Tap Connect'], 'Connect is the next step');
      assert.deepStrictEqual(JSON.parse(JSON.stringify(asked)), [{ timeoutMs: 4000 }], 'the plugin is asked how long to look, nothing else: never the key');
    })();
  },

  'b: without a key the address is filled and the key is still missing'() {
    return (async () => {
      const { F } = finder();
      for (const current of ['', '10.0.33.66:8000', '10.0.33.66:8000/k/']) {
        const r = await F.find(current);
        assert.strictEqual(r.address, '10.0.32.31:8800/k/', current);
        assert.strictEqual(r.keyed, false);
        assert.strictEqual(r.say, F.SAY.unkeyed);
        assert.deepStrictEqual(hubStatus(r.address), ['warn', 'Key missing'], 'the state line says what is missing');
      }
    })();
  },

  'c: the hub the phone knows is kept when several answer; names, IPv6 and odd ports are left out'() {
    return (async () => {
      const other = { name: 'Another hub', host: '10.0.40.7', port: 8800 };
      const odd = [{ host: 'wendyos-hackathon-device-12.local', port: 8800 }, { host: 'fd45::1', port: 8800 },
        { host: '10.0.32.31', port: 0 }, { host: '10.0.32.31', port: '8800' }, { host: '999.0.0.1', port: 8800 }, null];
      const { F } = finder({ answer: { state: 'ok', hubs: [...odd, other, DOOR] } });
      assert.strictEqual((await F.find('10.0.32.31:8800' + KEY)).address, '10.0.32.31:8800' + KEY, 'the known host');
      assert.strictEqual((await F.find(BRIDGE)).address, '10.0.40.7:8800' + KEY, 'else the first valid one');
      const r = await F.find(BRIDGE);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(r.hubs)), [other, DOOR]);
    })();
  },

  'd: nothing found, no permission, a failure: a sentence and no address'() {
    return (async () => {
      const cases = [[{ state: 'ok', hubs: [] }, 'none'], [{ state: 'denied', hubs: [] }, 'denied'],
        [{ state: 'failed', hubs: [] }, 'failed'], [new Error('plugin gone'), 'failed'], [null, 'none']];
      for (const [answer, state] of cases) {
        const { F } = finder({ answer });
        const r = await F.find(BRIDGE);
        assert.strictEqual(r.state, state, String(answer && answer.state));
        assert.strictEqual(r.address, null);
        assert.strictEqual(r.say, F.SAY[state]);
      }
      const { F } = finder();
      assert.ok(/paste/i.test(F.SAY.none), 'with nothing found, the way that always works');
      assert.ok(/Local Network/.test(F.SAY.denied), 'names the iPhone setting');
    })();
  },

  'e: only on a phone with the plugin: the browser demo and Android keep the button hidden'() {
    return (async () => {
      for (const opts of [{ native: null }, { native: false }, { ios: false }]) {
        const { F, asked } = finder(opts);
        assert.strictEqual(F.available(), false, JSON.stringify(opts));
        assert.strictEqual((await F.find(BRIDGE)).state, 'unavailable');
        assert.deepStrictEqual(asked, []);
      }
    })();
  },

  'f: the button sits on the Home hub page, hidden until main.js knows the plugin is there'() {
    const shell = fs.readFileSync(path.join(JS, 'gui', 'shell.js'), 'utf8'), main = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
    const page = shell.slice(shell.indexOf("page: 'hub'"), shell.indexOf("page: 'about'"));
    assert.ok(/<button type="button" id="hubFind" class="btn tonal small state" hidden>Find on this Wi-Fi<\/button>/.test(page));
    assert.ok(page.indexOf('id="hubFind"') < page.indexOf('type="submit"'), 'before Connect');
    assert.ok(/\$\('hubFind'\)\.hidden = !A\.HubFind\?\.available\(\);/.test(main));
    assert.ok(/A\.HubFind\.find\(\$\('hubAddr'\)\.value\.trim\(\) \|\| savedHub\)/.test(main), 'the key comes from the field, else the saved address');
    const html = read('demo/index.html');
    assert.ok(html.indexOf('js/hubfind.js') > html.indexOf('js/hub.js') && html.indexOf('js/hubfind.js') < html.indexOf('js/main.js'));
  },

  'g: one Bonjour type from the door to Info.plist to the plugin, and the plugin is registered'() {
    const door = read('jetson/home_hub/door/door.py'), swift = read('ios/App/App/AfferentHubFinder.swift');
    const plist = read('ios/App/App/Info.plist'), eyes = read('ios/App/App/AfferentEyes.swift');
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    assert.ok(door.includes('LAN_SERVICE = "_afferent-hub._tcp.local."'));
    assert.ok(swift.includes('static let serviceType = "_afferent-hub._tcp"'));
    const bonjour = plist.slice(plist.indexOf('<key>NSBonjourServices</key>'), plist.indexOf('</array>', plist.indexOf('<key>NSBonjourServices</key>')));
    assert.ok(bonjour.includes('<string>_afferent-hub._tcp</string>'), 'iOS refuses to browse a type missing here');
    assert.ok(/<key>NSLocalNetworkUsageDescription<\/key>\s*<string>[^<]*hub/.test(plist), 'the Local Network prompt names the hub');
    assert.ok(eyes.includes('bridge?.registerPluginInstance(AfferentHubFinderPlugin())'));
    assert.ok(swift.includes('public let jsName = "AfferentHubFinder"'));
    assert.ok(/AfferentHubFinder\.swift in Sources \*\/,/.test(pbx), 'compiled into the app target');
    const code = swift.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/token|\/k\/|\bkey\b/i.test(code), 'the plugin never handles a key');
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
