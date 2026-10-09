const { DARK_MODE_ENABLED } = require('./src/theme/themeFeature.js');

// Preserve app.json; use the same flag for native launch appearance.
module.exports = ({ config }) => ({
  ...config,
  userInterfaceStyle: DARK_MODE_ENABLED ? 'automatic' : 'light',
});
