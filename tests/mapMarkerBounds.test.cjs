const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const path = require('node:path');
const ts = require('typescript');
const moduleSource = ts.transpileModule(readFileSync(path.join(__dirname, '../src/lib/mapMarkerBounds.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', moduleSource)(loaded.exports);
const { expandedMarkerPopups: filter, hasValidCoordinates, isWithinMapBounds: contains,
  markerBoundsWithOverscan: overscan, MARKER_OVERSCAN_RATIO } = loaded.exports;
const bounds = { minLat: 37.53, maxLat: 37.55, minLng: 127.04, maxLng: 127.06 };
const point = (id, latitude = 37.54, longitude = 127.05) => ({ id, latitude, longitude, tags: [] });
const ids = (list) => list.map(p => p.id);

test('expanded bounds include visible and overscan points, exclude everything beyond the buffer', () => {
  assert.equal(MARKER_OVERSCAN_RATIO, 0.20);
  const input = [point('inside'), point('buffer', 37.553), point('far', 37.555), point('far-lng', 37.54, 127.065)];
  assert.deepEqual(ids(filter(input, bounds)), ['inside', 'buffer']);
  assert.equal(contains(input[1], bounds), false);
});

test('bounds and overscan edges are inclusive on all four sides', () => {
  for (const b of [bounds, overscan(bounds)]) {
    for (const lat of [b.minLat, b.maxLat]) for (const lng of [b.minLng, b.maxLng]) {
      assert.equal(contains(point('edge', lat, lng), b), true);
    }
  }
});

test('1000 dispersed points produce 30 marker targets, with explicit before/after counts', t => {
  const nearby = Array.from({ length: 30 }, (_, i) => point(`near-${i}`, 37.54 + i * 0.00001));
  const far = Array.from({ length: 970 }, (_, i) => point(`far-${i}`, 35.68, 139.76 + i * 0.00001));
  const all = [...nearby, ...far];
  const after = filter(all, bounds);
  assert.deepEqual(after, nearby);
  const pinned = filter(all, bounds, far[0].id);
  assert.equal(pinned.length, 31);
  t.diagnostic(JSON.stringify({ total: all.length, tagFiltered: all.length,
    beforeValidMarkers: all.filter(hasValidCoordinates).length,
    insideBounds: all.filter(p => contains(p, bounds)).length,
    overscanMarkers: after.length, selectedAdded: pinned.length - after.length }));
});

test('1000 dense visible points remain 1000: culling does not change clustering or cap density', () => {
  const dense = Array.from({ length: 1000 }, (_, i) => point(`dense-${i}`, 37.54 + i * 0.000001));
  assert.equal(filter(dense, bounds).length, 1000);
});

test('both native wrapped and region unwrapped longitude bounds include +/-180 edges', () => {
  const crossing = { minLat: -1, maxLat: 1, minLng: 179, maxLng: -179 };
  const unwrapped = { ...crossing, maxLng: 181 };
  const input = [point('west', 0, 179.5), point('east', 0, -179.5),
    point('positive-edge', 0, 180), point('negative-edge', 0, -180),
    point('overscan', 0, -178.8), point('far', 0, -178.5), point('opposite', 0, 0)];
  for (const b of [crossing, unwrapped]) {
    assert.deepEqual(ids(filter(input, b)), ['west', 'east', 'positive-edge', 'negative-edge', 'overscan']);
    assert.equal(contains(input[4], b), false);
  }
});

test('overscan clamps latitude and full-world longitude retains valid coordinates', () => {
  const polar = overscan({ minLat: 80, maxLat: 90, minLng: -180, maxLng: 180 });
  assert.equal(polar.maxLat, 90);
  assert.equal(overscan({ minLat: -90, maxLat: -80, minLng: 0, maxLng: 1 }).minLat, -90);
  for (const lng of [-180, -90, 0, 90, 180]) assert.equal(contains(point('world', 89, lng), polar), true);
});

test('invalid coordinates never render, including selected and pending IDs', () => {
  const bad = [NaN, Infinity, -Infinity, 91, -91, null, '37.54'];
  for (const lat of bad) assert.deepEqual(filter([point('bad', lat)], bounds, 'bad', 'bad'), []);
  for (const lng of [NaN, Infinity, -181, 181, null, '127.05']) {
    assert.deepEqual(filter([point('bad', 37.54, lng)], bounds, 'bad', 'bad'), []);
  }
});

test('unavailable or malformed bounds preserve valid data until initial bounds arrive', () => {
  const input = [point('near'), point('far', 35, 139), point('invalid', NaN)];
  for (const b of [null, { ...bounds, minLat: NaN }, { ...bounds, minLat: 50 }]) {
    assert.deepEqual(ids(filter(input, b)), ['near', 'far']);
  }
  assert.deepEqual(ids(filter(input, bounds)), ['near']);
});

test('only current valid selected/pending records are pinned, without duplicate additions', () => {
  const far = point('selected', 35, 139), pending = point('pending', 34, 135);
  const input = [point('near'), far, pending, point('unrelated', 32, 130)];
  assert.deepEqual(ids(filter(input, bounds, far.id, pending.id)), ['near', 'selected', 'pending']);
  assert.deepEqual(ids(filter(input, bounds, far.id, far.id)), ['near', 'selected']);
  assert.deepEqual(ids(filter(input, bounds, 'near', 'near')), ['near']);
});

test('tag exclusions/deletions cannot revive stale objects; pins use refreshed data', () => {
  const current = point('selected', 35, 139);
  assert.deepEqual(filter([point('near')], bounds, current.id, current.id), [point('near')]);
  const updated = { ...current, latitude: 36 };
  assert.equal(filter([updated], bounds, current.id)[0], updated);
});
