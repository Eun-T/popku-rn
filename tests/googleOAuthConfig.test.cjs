const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

const iosId = '123456789-test-ios.apps.googleusercontent.com';
const webId = '123456789-test-web.apps.googleusercontent.com';
const scheme = 'com.googleusercontent.apps.123456789-test-ios';

function configFor(value, config) {
  const module = { exports: {} };
  new Function('require', 'module', 'process', fs.readFileSync('app.config.js', 'utf8'))(
    name => name === './src/constants/apiEnvironment.js'
      ? require('../src/constants/apiEnvironment.js') : { DARK_MODE_ENABLED: false }, module,
    { env: { EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: value } },
  );
  return module.exports({ config });
}

test('iOS OAuth scheme uses dot reversal, preserves all existing config and is idempotent', () => {
  const original = structuredClone(require('../app.json').expo);
  original.ios.infoPlist.CFBundleURLTypes = [{ CFBundleURLSchemes: ['existing-callback'] }];
  const snapshot = structuredClone(original);
  const result = configFor(` ${iosId} `, original);
  assert.equal(result.scheme, 'popkurn');
  assert.equal(result.ios.bundleIdentifier, 'com.popku.app');
  assert.deepEqual(result.android, original.android);
  assert.deepEqual(result.plugins, [...original.plugins,
    ['react-native-nitro-google-signin', { iosUrlScheme: scheme }]]);
  assert.equal(result.ios.usesAppleSignIn, original.ios.usesAppleSignIn);
  assert.deepEqual(result.ios.infoPlist.LSApplicationQueriesSchemes, original.ios.infoPlist.LSApplicationQueriesSchemes);
  assert.deepEqual(result.ios.infoPlist, original.ios.infoPlist);
  assert.deepEqual(result.ios.scheme, [scheme]);
  const { IOSConfig } = require('@expo/config-plugins');
  const nativePlist = IOSConfig.Scheme.setScheme(result, {});
  const nativeSchemes = IOSConfig.Scheme.getSchemesFromPlist(nativePlist);
  assert.ok(nativeSchemes.includes('popkurn'));
  assert.ok(nativeSchemes.includes(scheme));
  assert.deepEqual(configFor(iosId, { ...original, ios: { ...original.ios, scheme: ['existing-ios'] } }).ios.scheme, ['existing-ios', scheme]);
  assert.deepEqual(configFor(iosId, result), result);
  assert.deepEqual(original, snapshot);
});

test('empty ID adds no fabricated scheme; malformed ID fails without exposing its value', () => {
  const original = require('../app.json').expo;
  assert.deepEqual(configFor('', original), { ...original, userInterfaceStyle: 'light' });
  const invalid = 'invalid-sensitive-value';
  assert.throws(() => configFor(invalid, original), error => !error.message.includes(invalid));
});

function authFor(platform, iosValue, webValue = webId) {
  const calls = [];
  const native = {
    GoogleOneTapSignIn: {
      configure: options => calls.push(options),
      checkPlayServices: async () => {},
      signIn: async () => ({ type: 'success', data: { idToken: 'test-token' } }),
    },
    isCancelledResponse: response => response.type === 'cancelled',
    isNoSavedCredentialFoundResponse: response => response.type === 'missing',
    isSuccessResponse: response => response.type === 'success',
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/lib/googleAuth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks = {
    'react-native': { Platform: { OS: platform } },
    '../constants/api': { API_BASE_URL: 'https://example.invalid' },
    './auth': { getDeviceId: async () => 'test-device' },
    'react-native-nitro-google-signin': native,
  };
  new Function('require', 'module', 'exports', 'process', '__DEV__', code)(
    name => { assert.ok(name in mocks); return mocks[name]; }, module, module.exports,
    { env: { EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: iosValue, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: webValue } }, false,
  );
  return { auth: module.exports, calls };
}

test('iOS passes both IDs; Android/Web keep web-only configuration', async () => {
  for (const platform of ['ios', 'android', 'web']) {
    const { auth, calls } = authFor(platform, ` ${iosId} `);
    assert.equal(await auth.getGoogleIdToken(), 'test-token');
    assert.deepEqual(calls, [platform === 'ios' ? { webClientId: webId, iosClientId: iosId } : { webClientId: webId }]);
  }
});

test('missing iOS ID fails before native configuration; Android needs no iOS ID', async () => {
  const ios = authFor('ios', ' ');
  await assert.rejects(ios.auth.getGoogleIdToken(), /Google 로그인 설정/);
  assert.deepEqual(ios.calls, []);
  const android = authFor('android', undefined);
  assert.equal(await android.auth.getGoogleIdToken(), 'test-token');
  const noWeb = authFor('ios', iosId, '');
  await assert.rejects(noWeb.auth.getGoogleIdToken(), /Google 로그인 설정/);
  assert.deepEqual(noWeb.calls, []);
});
