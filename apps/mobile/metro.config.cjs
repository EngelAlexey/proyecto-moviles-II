const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;

const config = getDefaultConfig(__dirname);

// Ignore transient pnpm temp directories that can disappear while Metro is attaching
// Windows file watchers, which otherwise crashes the bundler with ENOENT.
config.resolver.blockList = exclusionList([
  /node_modules\/\.pnpm\/.+_tmp_\d+_\d+(?:\/.*)?/,
]);

module.exports = config;