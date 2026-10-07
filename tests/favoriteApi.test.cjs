const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks, globals = {}) {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(
    (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    module, module.exports, ...Object.values(globals),
  );
  return module.exports;
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('favorites list uses JWT identity and returns only server rows', async () => {
  const calls = [];
  const client = load('src/lib/favorites.ts', {
    '../constants/api': { API_BASE_URL: 'http://api' },
    './auth': { getAuthSession: async () => ({ accessToken: 'access-token', generation: 0 }) },
    './favoriteCache': { favoriteCacheGeneration: () => 1, favoriteSessionGeneration: () => 1, saveFavoriteCache: () => {}, updateFavoriteCache: () => {} },
  }, { __DEV__: false, fetch: async (url, options) => {
    calls.push({ url, options });
    return response({ popups: [{ publicId: 'public-1', name: '찜한 팝업' }] });
  } });
  assert.deepEqual(await client.getFavoritePopups(), [{ publicId: 'public-1', name: '찜한 팝업' }]);
  assert.equal(calls[0].url, 'http://api/api/users/me/favorites');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token');
  assert.equal(calls[0].options.body, undefined);
});

test('no access token sends no favorites list request', async () => {
  let calls = 0;
  const client = load('src/lib/favorites.ts', {
    '../constants/api': { API_BASE_URL: 'http://api' },
    './auth': { getAuthSession: async () => ({ accessToken: null, generation: 0 }) },
    './favoriteCache': { favoriteCacheGeneration: () => 1, favoriteSessionGeneration: () => 1, saveFavoriteCache: () => {}, updateFavoriteCache: () => {} },
  }, { __DEV__: false, fetch: async () => { calls += 1; return response({}); } });
  await assert.rejects(client.getFavoritePopups(), client.FavoriteUnauthorizedError);
  assert.equal(calls, 0);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function favoriteClient(cache, fetch) {
  return load('src/lib/favorites.ts', {
    '../constants/api': { API_BASE_URL: 'http://api' },
    './auth': { getAuthSession: async () => ({ accessToken: 'a-token', generation: 0 }) },
    './favoriteCache': cache,
  }, { __DEV__: false, fetch });
}

for (const [method, isFavorited] of [['POST', true], ['DELETE', false]]) {
  test(`late ${method} response returns A result without changing B cache`, async () => {
    const cache = load('src/lib/favoriteCache.ts', {});
    const aPopup = { publicId: 'a-popup' };
    const bPopup = { publicId: 'b-popup' };
    cache.saveFavoriteCache(isFavorited ? [] : [aPopup], cache.favoriteCacheGeneration());
    const pending = deferred();
    const client = favoriteClient(cache, async (_url, options) => {
      assert.equal(options.method, method);
      return pending.promise;
    });
    const request = method === 'POST'
      ? client.favoritePopup(aPopup.publicId, aPopup)
      : client.unfavoritePopup(aPopup.publicId);
    await Promise.resolve();

    cache.clearFavoriteCache();
    cache.saveFavoriteCache([bPopup], cache.favoriteCacheGeneration());
    const aResult = { publicId: aPopup.publicId, isFavorited, favoriteCount: isFavorited ? 1 : 0 };
    pending.resolve(response(aResult));

    assert.deepEqual(await request, aResult);
    assert.deepEqual(cache.getFavoriteCache(), [bPopup]);
    assert.deepEqual([...cache.getFavoriteIds()], ['b-popup']);
  });
}

test('POST and DELETE update cache when generation stays the same', async () => {
  const cache = load('src/lib/favoriteCache.ts', {});
  const popup = { publicId: 'popup' };
  cache.saveFavoriteCache([], cache.favoriteCacheGeneration());
  const client = favoriteClient(cache, async (_url, options) => response({
    publicId: popup.publicId,
    isFavorited: options.method === 'POST',
    favoriteCount: options.method === 'POST' ? 1 : 0,
  }));

  await client.favoritePopup(popup.publicId, popup);
  assert.deepEqual(cache.getFavoriteCache(), [popup]);
  assert.deepEqual([...cache.getFavoriteIds()], [popup.publicId]);

  await client.unfavoritePopup(popup.publicId);
  assert.deepEqual(cache.getFavoriteCache(), []);
  assert.deepEqual([...cache.getFavoriteIds()], []);
});

test('concurrent favorites for different popups both update the same session cache', async () => {
  const cache = load('src/lib/favoriteCache.ts', {});
  cache.saveFavoriteCache([], cache.favoriteCacheGeneration());
  const pending = new Map();
  const client = favoriteClient(cache, async (url) => {
    const request = deferred();
    pending.set(url.split('/').at(-2), request);
    return request.promise;
  });
  const first = { publicId: 'one' };
  const second = { publicId: 'two' };
  const firstRequest = client.favoritePopup(first.publicId, first);
  const secondRequest = client.favoritePopup(second.publicId, second);
  await Promise.resolve();

  pending.get('one').resolve(response({ publicId: 'one', isFavorited: true, favoriteCount: 1 }));
  await firstRequest;
  pending.get('two').resolve(response({ publicId: 'two', isFavorited: true, favoriteCount: 1 }));
  await secondRequest;
  assert.deepEqual([...cache.getFavoriteIds()], ['one', 'two']);
  assert.deepEqual(cache.getFavoriteCache(), [first, second]);
});
