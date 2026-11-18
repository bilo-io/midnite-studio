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

// The one git-engine subpath mobile takes: the pure diff parser, from source (Phase 146 Theme D6).
const DIFF_PARSER = path.resolve(workspaceRoot, 'packages/git-engine/src/parsers/diff-parser.ts');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@midnite/studio-git-engine/diff') return { type: 'sourceFile', filePath: DIFF_PARSER };
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
