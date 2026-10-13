const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');

function device(storage = new Map(), markers = new Map(), options = {}) {
  const calls = [];
  const module = { exports: {} };
  const mocks = {
    'expo-secure-store': { getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => { if (options.failStore) throw new Error('storage unavailable'); storage.set(key, value); } },
    'expo-modules-core': { uuid: { v4: () => { calls.push('generate'); return randomUUID(); } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => markers.get(key) ?? null,
      setItem: async (key, value) => { if (options.failMarker) throw new Error('marker unavailable'); markers.set(key, value); },
    } },
  };
  const code = ts.transpileModule(readFileSync('src/lib/deviceId.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => mocks[name], module, module.exports);
  return { ...module.exports, storage, markers, calls };
}

test('first installation generates one native UUID v4 across concurrent callers and persists in SecureStore', async () => {
  const s = device(); const values = await Promise.all(Array.from({ length: 10 }, () => s.getDeviceId()));
  assert.equal(new Set(values).size, 1); assert.equal(s.calls.length, 1);
  assert.match(values[0], /^[0-9a-f-]{36}$/);
  assert.equal([...s.storage.values()][0], values[0]);
  assert.deepEqual([...s.markers.values()], ['1'], 'AsyncStorage contains only a non-secret installation marker');
});
test('restart reuses the same ID; another installation has a different ID', async () => {
  const first = device(); const id = await first.getDeviceId();
  const restart = device(first.storage, first.markers);
  assert.equal(await restart.getDeviceId(), id); assert.equal(restart.calls.length, 0);
  assert.notEqual(await device().getDeviceId(), id);
});
test('iOS retained Keychain with a missing installation marker generates a new ID', async () => {
  const first = device(); const prior = await first.getDeviceId();
  const reinstall = device(first.storage, new Map());
  assert.notEqual(await reinstall.getDeviceId(), prior);
});
test('storage/marker failure rejects instead of using an ephemeral or fixed device ID; retry remains possible', async () => {
  for (const failure of ['failStore', 'failMarker']) {
    const options = { [failure]: true }; const s = device(new Map(), new Map(), options);
    await assert.rejects(s.getDeviceId(), /unavailable/); options[failure] = false;
    assert.match(await s.getDeviceId(), /^[0-9a-f-]{36}$/);
  }
});
