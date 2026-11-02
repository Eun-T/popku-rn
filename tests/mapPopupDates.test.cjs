const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const { runtime, flush } = require('./helpers/i18nRuntime.cjs');
const dates = runtime().load('src/lib/mapPopupDates.ts');
const today = dates.mapPopupDays(Date.parse('2026-10-14T15:00:00Z'));

for (const countryCode of ['KR', 'JP', undefined]) {
  for (const [name, startDate, endDate, expected] of [
    ['ended yesterday', '2026-10-01', '2026-10-14', false],
    ['ends today', '2026-10-01', '2026-10-15', true],
    ['ends tomorrow', '2026-10-01', '2026-10-16', true],
    ['starts tomorrow', '2026-10-16', '2026-10-20', false],
    ['starts today', '2026-10-15', '2026-10-20', true],
    ['both today', '2026-10-15', '2026-10-15', true],
  ]) {
    test(`${countryCode ?? 'legacy without country'}: ${name}`, () => {
      const popup = Object.freeze({ startDate, endDate, countryCode });
      const result = dates.filterOngoingMapPopups([popup], today);
      assert.equal(result.length, expected ? 1 : 0);
      if (expected) assert.equal(result[0], popup, 'original records and order are preserved');
    });
  }
}

test('Seoul and Tokyo cross midnight together, independently of the device/UTC calendar', () => {
  for (const instant of ['2026-10-14T14:59:59.999Z', '2026-10-14T07:59:59.999-07:00']) {
    const now = Date.parse(instant);
    assert.deepEqual(dates.mapPopupDays(now), { KR: '2026-10-14', JP: '2026-10-14' });
    assert.equal(dates.nextMapDayDelay(now), 1);
    assert.deepEqual(dates.mapPopupDays(now + 1), { KR: '2026-10-15', JP: '2026-10-15' });
    assert.equal(dates.nextMapDayDelay(now + 1), 86400000);
  }
  assert.deepEqual(dates.mapPopupDays(Date.parse('2026-12-31T15:00:00Z')), { KR: '2027-01-01', JP: '2027-01-01' });
});

test('missing, malformed, impossible or reversed date ranges never become ongoing', () => {
  for (const [startDate, endDate] of [
    [null, '2026-10-15'], ['2026-10-15', null], [undefined, undefined],
    ['', '2026-10-15'], ['2026-10-15', ' '], ['2026-10-16', '2026-10-15'],
    ['2026-02-29', '2026-10-15'], ['2026-10-01', '2026-11-31'],
    ['2026-13-01', '2026-12-31'], ['2026-10-15T00:00:00Z', '2026-10-15'],
    ['0000-01-01', '2026-10-15'], [20261015, '2026-10-15'],
  ]) assert.deepEqual(dates.filterOngoingMapPopups([{ startDate, endDate }], today), []);
  assert.equal(dates.filterOngoingMapPopups([{ startDate: '2024-02-29', endDate: '2026-10-15' }], today).length, 1);
});

// Execute the real hook with a controllable clock and native AppState/timer I/O.
async function hookApp(initial, timestamp = '2026-10-15T14:59:59.999Z') {
  let now = Date.parse(timestamp), sequence = 0, calls = 0, response = async () => initial;
  const timers = new Map(), listeners = new Set(), ui = runtime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const load = (file, dependencies) => {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    new Function('require', 'module', 'exports', 'Date', 'setTimeout', 'clearTimeout', code)(
      name => { assert.ok(name in dependencies, `Missing ${name}`); return dependencies[name]; }, module, module.exports, Clock,
      (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, id => timers.delete(id),
    );
    return module.exports;
  };
  const dateUtility = load('src/lib/mapPopupDates.ts', { './placeDatePeriod': runtime().load('src/lib/placeDatePeriod.ts') });
  const { useMapPopups } = load('src/hooks/useMapPopups.ts', {
    react: ui.react, 'expo-router': { useFocusEffect: fn => ui.react.useEffect(fn, [fn]) },
    'react-native': { AppState: { addEventListener: (_, listener) => {
      listeners.add(listener); return { remove: () => listeners.delete(listener) };
    } } },
    '../lib/mapPopupDates': dateUtility,
    '../lib/popups': { getPopupMap: () => { calls++; return response(); } },
  });
  const root = ui.mount(() => useMapPopups('ko')); await flush();
  return { root, timers, listeners, get calls() { return calls; },
    advance(value) { now = Date.parse(value); },
    midnight() { const entry = timers.entries().next().value; timers.delete(entry[0]); entry[1].fn(); },
    foreground() { listeners.forEach(listener => listener('active')); },
    response(fn) { response = fn; }, dispose: ui.dispose,
  };
}

const dayRows = [
  { id: 'ends-today', startDate: '2026-10-01', endDate: '2026-10-15' },
  { id: 'ongoing', startDate: '2026-10-01', endDate: '2026-10-20' },
  { id: 'starts-tomorrow', startDate: '2026-10-16', endDate: '2026-10-20' },
  { id: 'old', startDate: '2026-10-01', endDate: '2026-10-12' },
];
test('mounted map changes dates at local midnight without a refetch and retains stable data within the same day', async () => {
  const s = await hookApp(dayRows);
  try {
    assert.deepEqual(s.root.tree.popups.map(p => p.id), ['ends-today', 'ongoing']);
    const before = s.root.tree.popups;
    s.foreground(); assert.equal(s.root.tree.popups, before);
    assert.equal(s.timers.values().next().value.delay, 1);
    s.advance('2026-10-15T15:00:00Z'); s.midnight();
    assert.deepEqual(s.root.tree.popups.map(p => p.id), ['ongoing', 'starts-tomorrow']);
    assert.equal(s.calls, 1); assert.equal(s.timers.size, 1);
  } finally { s.dispose(); }
  assert.equal(s.timers.size, 0); assert.equal(s.listeners.size, 0);
});

test('foreground corrects a suspended clock across multiple days and refresh never returns an expired target', async () => {
  const s = await hookApp(dayRows);
  try {
    assert.deepEqual((await s.root.tree.refresh()).map(p => p.id), ['ends-today', 'ongoing']);
    s.advance('2026-10-20T15:00:00Z'); s.foreground();
    assert.deepEqual(s.root.tree.popups, []);
    assert.deepEqual(await s.root.tree.refresh(), []);
    assert.equal(s.calls, 3);
    assert.equal(s.timers.size, 1);
  } finally { s.dispose(); }
});

test('a failed refresh retains data but cannot retain expired markers after midnight', async () => {
  const s = await hookApp(dayRows);
  try {
    s.response(async () => { throw new Error('offline'); });
    await assert.rejects(s.root.tree.refresh(), /offline/);
    assert.equal(s.root.tree.status, 'error');
    s.advance('2026-10-15T15:00:00Z'); s.midnight();
    assert.deepEqual(s.root.tree.popups.map(p => p.id), ['ongoing', 'starts-tomorrow']);
    assert.equal(s.calls, 2);
  } finally { s.dispose(); }
});
