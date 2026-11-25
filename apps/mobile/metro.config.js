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

// Source aliases: git-engine's pure diff parser (D6) and forge-github-core (its `main` is a CJS dist; E).
const DIFF_PARSER = path.resolve(workspaceRoot, 'packages/git-engine/src/parsers/diff-parser.ts');
const FORGE_CORE = path.resolve(workspaceRoot, 'packages/forge-github-core/src/index.ts');
// Phase 146 Theme H: tasks-core is TS source (exports point at src/index.ts).
const TASKS_CORE = path.resolve(workspaceRoot, 'packages/tasks-core/src/index.ts');
// Stand-in for the unpublished @bilo-io/ui-native 0.5.0 (vendor/ui-native/VENDORED.md).
const UI_NATIVE = path.resolve(projectRoot, 'vendor/ui-native/index.ts');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@midnite/studio-git-engine/diff') return { type: 'sourceFile', filePath: DIFF_PARSER };
  if (moduleName === '@midnite/forge-github-core') return { type: 'sourceFile', filePath: FORGE_CORE };
  if (moduleName === '@midnite/tasks-core') return { type: 'sourceFile', filePath: TASKS_CORE };
  // The vendored brand marks are Vite `?inline` imports; Metro takes a shim that resolves the asset to its URI.
  const inline = /midnite-logo-(dark|light)\.png\?inline$/.exec(moduleName);
  if (inline) return { type: 'sourceFile', filePath: path.resolve(projectRoot, `metro-shims/midnite-logo-${inline[1]}.png.inline.js`) };
  if (moduleName === '@bilo-io/ui-native') return { type: 'sourceFile', filePath: UI_NATIVE };
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
