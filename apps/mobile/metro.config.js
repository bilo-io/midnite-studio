// Metro under pnpm's isolated layout (Phase 146 Theme B3). Expo's default config is the base; the workspace root is
// watched so `@midnite/studio-shared` resolves to its TS source. The root `.npmrc` node-linker is never changed.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
