const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

function resolve(env = {}, config = structuredClone(require('../app.json').expo)) {
  const module = { exports: {} };
  new Function('require', 'module', 'process', readFileSync('app.config.js', 'utf8'))(
    name => name.includes('apiEnvironment') ? require('../src/constants/apiEnvironment.js')
      : { DARK_MODE_ENABLED: false }, module, { env },
  );
  return module.exports({ config });
}

test('default and explicit production preserve the existing native configuration', () => {
  const config = structuredClone(require('../app.json').expo);
  config.ios.enableSceneSupport = true;
  config.ios.infoPlist.UIApplicationSceneManifest = { existing: 'scene configuration' };
  config.ios.infoPlist.CFBundleDisplayName = '기존 운영 이름';
  for (const env of [{}, { APP_VARIANT: 'production' }, {
    EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_APP_ENV: 'production',
    EXPO_PUBLIC_API_URL: 'https://api.example.com',
  }]) {
    assert.deepEqual(resolve(env, config), { ...config, userInterfaceStyle: 'light' });
  }
});

test('development separates iOS identity and preserves scene, Maps, Apple and Android settings', () => {
  const config = structuredClone(require('../app.json').expo);
  config.ios.enableSceneSupport = true;
  config.ios.infoPlist.UIApplicationSceneManifest = { existing: 'scene configuration' };
  const snapshot = structuredClone(config);
  const result = resolve({ APP_VARIANT: 'development' }, config);
  assert.equal(result.name, '팝카이브 DEV');
  assert.equal(result.scheme, 'popkurn-dev');
  assert.equal(result.ios.bundleIdentifier, 'com.popku.app.dev');
  assert.deepEqual(result.ios, { ...config.ios, bundleIdentifier: 'com.popku.app.dev',
    infoPlist: { ...config.ios.infoPlist, CFBundleDisplayName: '팝카이브 DEV' } });
  assert.deepEqual(result.plugins, config.plugins);
  assert.deepEqual(result.android, config.android);
  assert.deepEqual(result.extra, config.extra);
  assert.deepEqual(config, snapshot);
});

test('Google callback configuration cannot overwrite the DEV identity', () => {
  const id = '123456789-dev-ios.apps.googleusercontent.com';
  const result = resolve({ APP_VARIANT: 'development', EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: id });
  assert.equal(result.ios.bundleIdentifier, 'com.popku.app.dev');
  assert.equal(result.ios.infoPlist.CFBundleDisplayName, '팝카이브 DEV');
  assert.deepEqual(result.ios.scheme, ['com.googleusercontent.apps.123456789-dev-ios']);
  assert.deepEqual(resolve({ APP_VARIANT: 'development', EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: id }, result), result);
});

test('release markers reject a stale DEV variant; development clients allow NODE_ENV=production', () => {
  for (const marker of [{ EAS_BUILD_PROFILE: 'production' }, { EAS_BUILD_PROFILE: 'preview' },
    { EXPO_PUBLIC_APP_ENV: 'production' }, { EXPO_PUBLIC_APP_ENV: 'preview' }, { CONFIGURATION: 'Release' }]) {
    assert.throws(() => resolve({ ...marker, APP_VARIANT: 'development' }), /development app variant/);
  }
  assert.throws(() => resolve({ APP_VARIANT: 'unknown' }), /APP_VARIANT/);
  assert.equal(resolve({ APP_VARIANT: 'development', EAS_BUILD_PROFILE: 'development', NODE_ENV: 'production' }).name, '팝카이브 DEV');
  const eas = require('../eas.json');
  assert.equal(eas.build.development.ios.buildConfiguration, 'Debug');
  assert.equal(eas.build.development.ios.env.APP_VARIANT, 'development');
  assert.equal(eas.build.development.env, undefined, 'DEV identity applies only to iOS EAS builds');
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.production.env.APP_VARIANT, undefined);
  assert.deepEqual(eas.build.production, { autoIncrement: true, environment: 'production',
    env: { EXPO_PUBLIC_APP_ENV: 'production' } });
  assert.deepEqual(eas.build.preview, { distribution: 'internal' });
  assert.deepEqual(eas.submit, { production: {} });
});
