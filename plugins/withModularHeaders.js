const { withPodfile } = require('expo/config-plugins');

module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    if (podfile.includes('use_modular_headers!')) {
      return config;
    }

    const marker = 'prepare_react_native_project!';

    if (!podfile.includes(marker)) {
      throw new Error(
        'Could not find prepare_react_native_project! in ios/Podfile'
      );
    }

    config.modResults.contents = podfile.replace(
      marker,
      `use_modular_headers!\n\n${marker}`
    );

    return config;
  });
};