const assert = require('node:assert/strict');
const { test } = require('node:test');
const { performance } = require('node:perf_hooks');
const { runtime } = require('./helpers/i18nRuntime.cjs');
const { overlappingMapMarkers: markers, clusterExpansion, mapZoom, MAP_MAX_CLUSTER_ZOOM } = runtime().load('src/lib/mapClustering.ts');

const region = { latitude: 37.54, longitude: 127.05, latitudeDelta: 0.01, longitudeDelta: 0.01 };
const popup = (id, dx = 0, latitude = region.latitude) => Object.freeze({ id, name: id, latitude,
  longitude: region.longitude + dx * region.longitudeDelta / 400, tags: [] });
const members = items => items.flatMap(item => item.type === 'popup' ? [item.popup.id] : item.popupIds).sort();
const snapshot = items => items.map(item => item.type === 'popup' ? item.popup.id : item.popupIds);
const draw = (data, viewport = region, labels = true, previous) => markers(data, viewport, 400, 800, labels, 1, previous);

test('one popup renders alone; exact 2/3-coordinate groups stay clustered at every zoom with unique IDs', () => {
  assert.equal(draw([popup('single')])[0].type, 'popup');
  for (const count of [2, 3]) {
    const data = Object.freeze(Array.from({ length: count }, (_, i) => popup(String(i))));
    for (const delta of [0.1, 0.01, 0.001, 0.000001]) {
      const view = { ...region, latitudeDelta: delta, longitudeDelta: delta };
      const result = draw([...data, data[0]], view);
      assert.equal(result.length, 1); assert.equal(result[0].type, 'cluster');
      assert.equal(result[0].count, count); assert.equal(result[0].popupIds.length, count);
      assert.equal(clusterExpansion(data, view, 400), null);
    }
  }
});

test('different nearby coordinates cluster on screen and separate on zoom; viewport width changes the collision result', () => {
  const data = [popup('a'), popup('b', 30), popup('c', 60)];
  assert.equal(draw(data).length, 1);
  const expanded = { ...region, longitudeDelta: 0.001, latitudeDelta: 0.001 };
  assert.equal(draw(data, expanded).length, 3);
  assert.deepEqual(members(draw(data, expanded)), ['a', 'b', 'c']);
  const pair = [popup('a'), popup('b', 60)];
  assert.equal(markers(pair, region, 400, 800, true).length, 1);
  assert.equal(markers(pair, region, 800, 800, true).length, 2);
  assert.equal(draw(pair, region, false).length, 2, 'labels affect collisions without changing their design');
});

test('same-coordinate pair plus nearby popup separates into 2 + 1 and never duplicates any member', () => {
  const data = [popup('a'), popup('b'), popup('c', 40)];
  assert.equal(draw(data).length, 1);
  const expanded = { ...region, longitudeDelta: 0.001, latitudeDelta: 0.001 };
  const result = draw(data, expanded);
  assert.equal(result.length, 2);
  assert.deepEqual(result.find(item => item.type === 'cluster').popupIds, ['a', 'b']);
  assert.equal(result.find(item => item.type === 'popup').popup.id, 'c');
  assert.deepEqual(members(result), ['a', 'b', 'c']);
});

test('no rounding classifies distinct coordinates as identical, and maximum zoom opens the list', () => {
  const pair = [popup('a'), { ...popup('b'), longitude: region.longitude + 1e-10 }];
  const target = clusterExpansion(pair, region, 400);
  assert.ok(target); assert.ok(target.longitudeDelta < region.longitudeDelta);
  const longitudeDelta = 360 * 400 / (512 * 2 ** MAP_MAX_CLUSTER_ZOOM);
  const maximum = { ...region, longitudeDelta, latitudeDelta: longitudeDelta };
  assert.ok(Math.abs(mapZoom(maximum, 400) - MAP_MAX_CLUSTER_ZOOM) < 1e-10);
  assert.equal(clusterExpansion(pair, maximum, 400), null);
  assert.equal(draw(pair, maximum)[0].count, 2);
});

test('collision boundary hysteresis retains groups through small zoom changes, then releases them', () => {
  const original = draw([popup('a'), popup('b', 82)]);
  assert.equal(original.length, 1);
  const previous = new Map(original[0].popupIds.map(id => [id, original[0].id]));
  const close = [popup('a'), popup('b', 87)];
  assert.equal(draw(close).length, 2);
  assert.equal(draw(close, region, true, previous).length, 1);
  assert.equal(draw([popup('a'), popup('b', 100)], region, true, previous).length, 2);
});

test('panning, zooming and input reordering preserve exact membership and stable cluster keys', () => {
  const data = [popup('a'), popup('b', 20), popup('c', 300), popup('d', 310)];
  const original = draw(data), input = JSON.stringify(data);
  for (let i = 0; i < 30; i++) {
    const result = draw([...data].reverse(), { ...region, longitude: region.longitude + i * 0.00001 });
    assert.deepEqual(snapshot(result), snapshot(original));
    assert.deepEqual(members(result), ['a', 'b', 'c', 'd']);
    assert.deepEqual(result.filter(x => x.type === 'cluster').map(x => x.id), original.filter(x => x.type === 'cluster').map(x => x.id));
  }
  assert.equal(JSON.stringify(data), input);
});

test('invalid data is excluded and dateline neighbors cluster using wrapped screen distance', () => {
  const invalid = [NaN, Infinity, -Infinity, 91, -91, null, '37.54'].map((latitude, i) => ({ ...popup(`bad-${i}`), latitude }));
  assert.deepEqual(members(draw([popup('valid'), ...invalid])), ['valid']);
  for (const value of [NaN, Infinity, 0, -1]) assert.deepEqual(markers([popup('a')], region, value, 800, true), []);
  const data = [{ ...popup('west'), longitude: 179.999 }, { ...popup('east'), longitude: -179.999 }];
  const result = draw(data, { ...region, longitude: 180, longitudeDelta: 0.1 });
  assert.equal(result.length, 1); assert.equal(result[0].count, 2);
});

test('dense 10000-point view uses one rendered cluster and preserves every popup', t => {
  const data = Array.from({ length: 10000 }, (_, i) => popup(`dense-${i}`, i * 0.00001));
  const started = performance.now(), result = draw(data), elapsed = performance.now() - started;
  assert.equal(result.length, 1); assert.equal(result[0].count, data.length);
  assert.equal(new Set(result[0].popupIds).size, data.length);
  t.diagnostic(`10000 points -> 1 cluster in ${elapsed.toFixed(1)}ms (Node; native device profiling still required)`);
});
