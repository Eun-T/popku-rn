const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks) {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => { if (!(name in mocks)) throw new Error(`Missing mock: ${name}`); return mocks[name]; },
    module, module.exports,
  );
  return module.exports;
}

test('cache keeps rows for reentry, removes favorites, and rejects stale fetches', () => {
  const cache = load('src/lib/favoriteCache.ts', {});
  const first = { publicId: 'one' };
  const second = { publicId: 'two' };
  const generation = cache.favoriteCacheGeneration();
  cache.saveFavoriteCache([first, second], generation);
  assert.deepEqual(cache.getFavoriteCache(), [first, second]);
  assert.deepEqual([...cache.getFavoriteIds()], ['one', 'two']);
  cache.updateFavoriteCache('one', false);
  assert.deepEqual(cache.getFavoriteCache(), [second]);
  assert.deepEqual([...cache.getFavoriteIds()], ['two']);
  cache.saveFavoriteCache([first, second], generation);
  assert.deepEqual(cache.getFavoriteCache(), [second]);
  cache.updateFavoriteCache('three', true);
  assert.deepEqual(cache.getFavoriteCache(), [second]);
  assert.deepEqual([...cache.getFavoriteIds()], ['two', 'three']);
  const fourth = { publicId: 'four' };
  cache.updateFavoriteCache('four', true, fourth);
  assert.deepEqual(cache.getFavoriteCache(), [second, fourth]);
  assert.deepEqual([...cache.getFavoriteIds()], ['two', 'three', 'four']);
  cache.clearFavoriteCache();
  assert.equal(cache.getFavoriteCache(), null);
  assert.equal(cache.getFavoriteIds(), null);
});

test('logout and account changes clear cached rows before another account can see them', async () => {
  const cache = load('src/lib/favoriteCache.ts', {});
  const secure = new Map();
  const auth = load('src/lib/auth.ts', {
    'expo-secure-store': {
      isAvailableAsync: async () => true,
      setItemAsync: async (key, value) => { secure.set(key, value); },
      getItemAsync: async (key) => secure.get(key) ?? null,
      deleteItemAsync: async (key) => { secure.delete(key); },
    },
    '../constants/api': { API_BASE_URL: 'http://api' },
    './favoriteCache': cache,
    './communityFeedRefresh': load('src/lib/communityFeedRefresh.ts', {}),
  });
  await auth.saveTokens({ accessToken: 'a', refreshToken: 'a-refresh' });
  auth.setAuthUser({ email: 'a@example.com', nickname: 'A' });
  cache.saveFavoriteCache([{ publicId: 'private-a' }], cache.favoriteCacheGeneration());
  auth.setAuthUser({ email: 'b@example.com', nickname: 'B' });
  assert.equal(cache.getFavoriteCache(), null);
  cache.saveFavoriteCache([{ publicId: 'private-b' }], cache.favoriteCacheGeneration());
  await auth.clearTokens();
  assert.equal(cache.getFavoriteCache(), null);
  assert.equal(await auth.getSavedAccessToken(), null);
});
