const { savedToken } = require('./helpers/authStorage.cjs');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

const localUrl = 'http://192.168.50.146:8080';
const productionUrl = 'https://api.popchive.com';
function load(file, mocks = {}, globals = {}) {
  const { __DEV__: development = false, ...variables } = globals;
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', ...Object.keys(variables), source)(name => {
    assert.ok(name in mocks, `Missing mock ${name}`); return mocks[name];
  }, module, module.exports, development, ...Object.values(variables));
  return module.exports;
}
function apiFor(url, { development = true, appEnvironment } = {}) {
  // Isolated process object: no changes to the real CLI environment or .env.
  return load('src/constants/api.ts', { './apiEnvironment': require('../src/constants/apiEnvironment.js') }, {
    __DEV__: development, process: { env: { EXPO_PUBLIC_API_URL: url, EXPO_PUBLIC_APP_ENV: appEnvironment } },
  });
}
function environment(url, storage = new Map(), options = {}) {
  const api = apiFor(url, options), requests = [], reads = [], writes = [], deletes = [];
  const secureStore = {
    isAvailableAsync: async () => true,
    getItemAsync: async key => { reads.push(key); return storage.get(key) ?? null; },
    setItemAsync: async (key, value) => {
      assert.match(key, /^[A-Za-z0-9._-]+$/, 'SecureStore accepts only these key characters');
      writes.push(key);
      if (options.failRefreshWrite && key.endsWith('session.v1')) throw new Error('storage unavailable');
      storage.set(key, value);
    },
    deleteItemAsync: async key => { deletes.push(key); storage.delete(key); },
  };
  const fetch = async (url, init = {}) => {
    // All HTTP is mocked, including URLs for AWS. No network tool is invoked.
    requests.push({ url, ...init });
    const status = url.endsWith('/users/me') ? options.profileStatus ?? 200 : 200;
    return { ok: status < 400, status, json: async () => url.includes('/api/popups/')
      ? { publicId: 'popup-one', coverImageUrl: null, contentImageUrls: [] }
      : { email: 'member@test', nickname: 'member' } };
  };
  const auth = load('src/lib/auth.ts', {
    './deviceId': { getDeviceId: async () => 'device' },
    'expo-secure-store': secureStore, '../constants/api': api,
    './favoriteCache': { clearFavoriteCache() {} }, './communityFeedRefresh': { clearCommunityLikes() {} },
  }, { fetch });
  const popups = load('src/lib/popups.ts', {
    '../constants/api': api, '../locales': { getApiLocale: () => 'ko' },
  }, { fetch });
  return { api, auth, popups, storage, requests, reads, writes, deletes };
}
const legacyStorage = () => new Map([['accessToken', 'local-access'], ['refreshToken', 'local-refresh']]);
const productionTokens = { accessToken: 'production-access', refreshToken: 'production-refresh' };

for (const value of [undefined, '', '   ', localUrl, ` ${localUrl}/// `]) {
  test(`default/explicit local address ${JSON.stringify(value)} retains the existing URL and token keys`, async () => {
    const s = environment(value, legacyStorage());
    assert.equal(s.api.API_BASE_URL, localUrl);
    assert.equal(await s.auth.getSavedAccessToken(), 'local-access');
    await s.auth.refreshAuthUser();
    assert.equal(s.auth.getAuthUser().nickname, 'member');
    assert.deepEqual(s.reads, ['session.v1', 'accessToken', 'session.v1', 'accessToken']);
    assert.equal(s.requests[0].url, `${localUrl}/api/users/me`);
    assert.equal(s.requests[0].headers.Authorization, 'Bearer local-access');
    assert.equal(savedToken(s.storage, 'refreshToken'), 'local-refresh');
  });
}

test('AWS address trims whitespace and trailing slashes; anonymous detail never sends a legacy local token', async () => {
  const s = environment(` ${productionUrl}/// `, legacyStorage());
  assert.equal(s.api.API_BASE_URL, productionUrl);
  const session = await s.auth.getAuthSession();
  assert.equal(session.accessToken, null);
  await s.auth.refreshAuthUser();
  assert.equal(s.auth.getAuthUser(), null);
  assert.equal(s.requests.length, 0, 'anonymous session restoration makes no authenticated HTTP call');
  await s.popups.getPopupDetail('popup-one', new AbortController().signal, session.accessToken ?? undefined);
  assert.equal(s.requests[0].url, `${productionUrl}/api/popups/popup-one?languageCode=ko`);
  assert.equal(s.requests[0].headers, undefined);
  assert.ok(s.reads.every(key => key !== 'accessToken' && key !== 'refreshToken'));
  assert.deepEqual(s.storage, legacyStorage());
});

test('AWS login tokens persist separately; selecting local again restores the untouched existing session', async () => {
  const storage = legacyStorage(), production = environment(productionUrl, storage);
  await production.auth.saveTokens(productionTokens);
  assert.equal(await production.auth.getSavedAccessToken(), productionTokens.accessToken);
  assert.equal(savedToken(storage, 'accessToken'), 'local-access');
  assert.equal(savedToken(storage, 'refreshToken'), 'local-refresh');
  assert.equal(storage.size, 3);
  const reloadedProduction = environment(`${productionUrl}/`, storage);
  assert.equal(await reloadedProduction.auth.getSavedAccessToken(), productionTokens.accessToken);
  await reloadedProduction.auth.refreshAuthUser();
  assert.equal(reloadedProduction.requests[0].headers.Authorization, 'Bearer production-access');
  const local = environment(undefined, storage);
  assert.equal(await local.auth.getSavedAccessToken(), 'local-access');
});

test('AWS logout without an AWS session never submits the legacy local refresh token or clears it', async () => {
  const s = environment(productionUrl, legacyStorage());
  await s.auth.logout();
  assert.equal(s.requests.length, 0);
  assert.ok(s.reads.every(key => key !== 'refreshToken'));
  assert.ok(s.deletes.every(key => key !== 'accessToken' && key !== 'refreshToken'));
  assert.deepEqual(s.storage, legacyStorage());
});

test('AWS logout sends only the AWS refresh token and removes only its own keys', async () => {
  const s = environment(productionUrl, legacyStorage());
  await s.auth.saveTokens(productionTokens);
  await s.auth.logout();
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].url, `${productionUrl}/api/auth/logout`);
  assert.equal(JSON.parse(s.requests[0].body).refreshToken, 'production-refresh');
  assert.deepEqual(s.storage, legacyStorage());
});

test('local logout preserves the stored AWS session', async () => {
  const storage = legacyStorage(), production = environment(productionUrl, storage);
  await production.auth.saveTokens(productionTokens);
  const local = environment(undefined, storage);
  await local.auth.logout();
  assert.equal(local.requests[0].url, `${localUrl}/api/auth/logout`);
  assert.equal(JSON.parse(local.requests[0].body).refreshToken, 'local-refresh');
  assert.equal(storage.has('accessToken'), false);
  assert.equal(storage.has('refreshToken'), false);
  assert.equal(await production.auth.getSavedAccessToken(), 'production-access');
  assert.equal(storage.size, 1);
});

test('AWS profile 401 and failed token persistence clean up AWS keys without affecting local login', async () => {
  const expired = environment(productionUrl, legacyStorage(), { profileStatus: 401 });
  await expired.auth.saveTokens(productionTokens);
  await expired.auth.refreshAuthUser();
  assert.equal(expired.auth.getAuthUser(), null);
  assert.equal(await expired.auth.getSavedAccessToken(), null);
  assert.deepEqual(expired.storage, legacyStorage());
  const failed = environment(productionUrl, legacyStorage(), { failRefreshWrite: true });
  await assert.rejects(failed.auth.saveTokens(productionTokens), /storage unavailable/);
  assert.deepEqual(failed.storage, legacyStorage());
});

test('other API URLs have distinct token namespaces instead of inheriting a local or AWS session', async () => {
  const storage = legacyStorage(), production = environment(productionUrl, storage);
  await production.auth.saveTokens(productionTokens);
  const another = environment('https://api.popchive.com:8443', storage);
  assert.equal(await another.auth.getSavedAccessToken(), null);
  await another.auth.saveTokens({ accessToken: 'another-access', refreshToken: 'another-refresh' });
  assert.equal(await production.auth.getSavedAccessToken(), 'production-access');
  assert.equal(savedToken(storage, 'accessToken'), 'local-access');
  assert.equal(storage.size, 4);
});
