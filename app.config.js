const { DARK_MODE_ENABLED } = require('./src/theme/themeFeature.js');
const { isReleaseEnvironment, resolveApiBaseUrl } = require('./src/constants/apiEnvironment.js');

// Preserve app.json; use the same flag for native launch appearance.
module.exports = ({ config }) => {
  // Validate before native build work; do not expose the supplied URL in errors.
  if (isReleaseEnvironment(process.env)) resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, false);
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const result = {
    ...config,
    userInterfaceStyle: DARK_MODE_ENABLED ? 'automatic' : 'light',
  };
  // No placeholder scheme while the user has not supplied an iOS OAuth ID.
  if (!iosClientId) return result;
  if (!/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(iosClientId)) {
    throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be a valid iOS OAuth client ID.');
  }
  // Reverse dot-separated components; preserve the complete numeric/string prefix.
  const scheme = iosClientId.split('.').reverse().join('.');
  const existingSchemes = config.ios?.scheme;
  const schemes = Array.isArray(existingSchemes) ? existingSchemes
    : existingSchemes ? [existingSchemes] : [];
  result.ios = {
    ...config.ios,
    scheme: schemes.includes(scheme) ? schemes : [...schemes, scheme],
  };
  const googleSignInPlugin = 'react-native-nitro-google-signin';
  const plugins = config.plugins ?? [];
  if (!plugins.some(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) === googleSignInPlugin)) {
    result.plugins = [...plugins, [googleSignInPlugin, { iosUrlScheme: scheme }]];
  }
  return result;
};
