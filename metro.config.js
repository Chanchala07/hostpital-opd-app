const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

// Dev server only (not release bundling): keep a USB phone's ports 8081 and
// 4000 pointed at this PC, so the app reaches Metro and the API after a replug.
if (process.argv.includes('start')) {
  require('./scripts/keep-adb-reverse')();
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
