const { withAndroidManifest } = require('expo/config-plugins');

// Android 11+ package visibility: allow Linking.canOpenURL to find NAVER Maps.
module.exports = config => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  manifest.queries ??= [{}];
  const queries = manifest.queries[0];
  queries.package ??= [];
  if (!queries.package.some(entry => entry.$?.['android:name'] === 'com.nhn.android.nmap')) {
    queries.package.push({ $: { 'android:name': 'com.nhn.android.nmap' } });
  }
  return config;
});
