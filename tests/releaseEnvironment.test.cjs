const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const environment = require('../src/constants/apiEnvironment.js');
const publicUrl = 'https://api.example.com';

function load(file, mocks, env, development, fetch) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', 'process', '__DEV__', 'fetch', code)(name => {
    assert.ok(name in mocks, `Missing mock ${name}`); return mocks[name];
  }, module, module.exports, { env }, development, fetch);
  return module.exports;
}
function api(env, development) {
  return load('src/constants/api.ts', { './apiEnvironment': environment }, env, development);
}
function config(env) {
  const module = { exports: {} };
  new Function('require', 'module', 'process', readFileSync('app.config.js', 'utf8'))(name =>
    name.includes('apiEnvironment') ? environment : { DARK_MODE_ENABLED: false }, module, { env });
  return module.exports({ config: { name: 'test', ios: {} } });
}

test('development preserves the local fallback and explicit HTTP URLs', () => {
  assert.equal(api({}, true).API_BASE_URL, environment.LOCAL_API_URL);
  assert.equal(api({ EXPO_PUBLIC_API_URL: ' http://localhost:8080/// ' }, true).API_BASE_URL, 'http://localhost:8080');
  assert.equal(config({}).name, 'test');
  assert.equal(config({ EAS_BUILD_PROFILE: 'development', NODE_ENV: 'production' }).name, 'test');
});

for (const value of [undefined, '', ' ', 'not-a-url', 'http://api.example.com',
  'https://localhost', 'https://localhost.', 'https://api.localhost', 'https://api.local',
  'https://127.0.0.1', 'https://127.1', 'https://2130706433', 'https://0x7f000001',
  'https://10.1.2.3', 'https://172.16.0.1', 'https://172.31.255.254', 'https://192.168.50.146',
  'https://169.254.169.254', 'https://100.64.0.1', 'https://[::]', 'https://[::1]',
  'https://[fc00::1]', 'https://[fd12::1]', 'https://[fe80::1]',
  'https://[::ffff:127.0.0.1]', 'https://[::ffff:c0a8:1]',
  'https://user:password@api.example.com', 'https://api.example.com?token=test',
  'https://api.example.com#test', 'https://api.example.com\\@localhost']) {
  test(`release refuses missing/unsafe URL ${JSON.stringify(value)}`, () => {
    assert.throws(() => api({ EXPO_PUBLIC_API_URL: value }, false), /EXPO_PUBLIC_API_URL/);
  });
}

test('release accepts public HTTPS and normalizes slashes without changing token namespace', () => {
  const release = api({ EXPO_PUBLIC_API_URL: ` ${publicUrl}/// ` }, false);
  assert.equal(release.API_BASE_URL, publicUrl);
  assert.equal(release.IS_DEVELOPMENT_ENVIRONMENT, false);
  assert.equal(release.API_TOKEN_STORAGE_NAMESPACE, api({ EXPO_PUBLIC_API_URL: publicUrl }, true).API_TOKEN_STORAGE_NAMESPACE);
  assert.equal(api({ EXPO_PUBLIC_API_URL: 'https://172.32.0.1:8443' }, false).API_BASE_URL, 'https://172.32.0.1:8443');
  assert.equal(api({ EXPO_PUBLIC_API_URL: 'https://[2606:4700:4700::1111]' }, false).API_BASE_URL, 'https://[2606:4700:4700::1111]');
});

test('development marker cannot bypass release validation; production marker also protects debug bundles', () => {
  assert.throws(() => api({ EXPO_PUBLIC_APP_ENV: 'development' }, false), /EXPO_PUBLIC_API_URL/);
  assert.throws(() => config({ EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_APP_ENV: 'production' }), /EXPO_PUBLIC_API_URL/);
  for (const marker of ['production', 'preview']) {
    assert.throws(() => api({ EXPO_PUBLIC_APP_ENV: marker }, true), /EXPO_PUBLIC_API_URL/);
    assert.equal(api({ EXPO_PUBLIC_APP_ENV: marker, EXPO_PUBLIC_API_URL: publicUrl }, true).IS_DEVELOPMENT_ENVIRONMENT, false);
  }
});

test('config rejects unsafe release profiles/markers before build without printing supplied credentials', () => {
  for (const env of [{ EAS_BUILD_PROFILE: 'production' }, { EAS_BUILD_PROFILE: 'preview' },
    { EXPO_PUBLIC_APP_ENV: 'production' }, { NODE_ENV: 'production' }]) {
    assert.throws(() => config(env), /EXPO_PUBLIC_API_URL/);
    assert.throws(() => config({ ...env, EXPO_PUBLIC_API_URL: 'https://user:private-value@localhost' }), error =>
      error.message.includes('EXPO_PUBLIC_API_URL') && !error.message.includes('private-value'));
    assert.equal(config({ ...env, EXPO_PUBLIC_API_URL: publicUrl }).name, 'test');
  }
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_APP_ENV, 'production');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_API_URL, undefined, 'actual API URL is supplied through EAS, never fabricated');
});

test('Places autocomplete and resolve never reach fetch in release, including direct service callers', async () => {
  for (const [development, env] of [[false, {}], [false, { EXPO_PUBLIC_APP_ENV: 'development' }],
    [true, { EXPO_PUBLIC_APP_ENV: 'production' }]]) {
    let requests = 0;
    const constants = api({ ...env, EXPO_PUBLIC_API_URL: publicUrl }, development);
    const places = load('src/lib/placeSearch.ts', { '../constants/api': constants }, env, development,
      async () => { requests++; throw new Error('fetch must not run'); });
    assert.equal(places.GOOGLE_PLACES_SEARCH_ENABLED, false);
    await assert.rejects(places.autocompletePlaces({ query: '서울', languageCode: 'ko', sessionToken: 'fixture' }), /place_search_disabled/);
    await assert.rejects(places.resolvePlace({ placeId: 'fixture', sessionToken: 'fixture' }), /place_search_disabled/);
    assert.equal(requests, 0);
  }
});

test('development keeps both Places endpoints available', async () => {
  const requests = [];
  const places = load('src/lib/placeSearch.ts', { '../constants/api': api({}, true) }, {}, true,
    async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ suggestions: [] }) }; });
  assert.equal(places.GOOGLE_PLACES_SEARCH_ENABLED, true);
  await places.autocompletePlaces({ query: '서울', languageCode: 'ko', sessionToken: 'fixture' });
  await places.resolvePlace({ placeId: 'fixture', sessionToken: 'fixture' });
  assert.deepEqual(requests.map(request => request.url), [
    `${environment.LOCAL_API_URL}/api/place-search/autocomplete`, `${environment.LOCAL_API_URL}/api/place-search/resolve`,
  ]);
});
