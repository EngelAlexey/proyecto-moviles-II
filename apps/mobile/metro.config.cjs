const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

try {
  let exclusionList;
  try {
    exclusionList = require('metro-config/src/defaults/exclusionList');
  } catch (e) {
    // Fallback for older/private metro versions
    exclusionList = require('metro-config/private/defaults/exclusionList').default;
  }
  
  // Ignore transient pnpm temp directories that can disappear while Metro is attaching
  // Windows file watchers, which otherwise crashes the bundler with ENOENT.
  config.resolver.blockList = exclusionList([
    /node_modules\/\.pnpm\/.+_tmp_\d+_\d+(?:\/.*)?/,
  ]);
} catch (e) {
  console.warn("Metro bundler: Could not load metro-config exclusionList, skipping pnpm Windows temp dir patches.");
}

module.exports = config;