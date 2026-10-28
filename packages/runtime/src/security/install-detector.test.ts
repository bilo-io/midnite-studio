import { describe, expect, it } from 'vitest';

import { parseInstallCommand, parseLockfileDiff } from './install-detector';

describe('install-detector', () => {
  describe('parseInstallCommand', () => {
    it('parses npm install commands with flags and version specifiers', () => {
      const candidates = parseInstallCommand('npm install -D lodash@^4.17.21 @types/node chalk');
      expect(candidates).toEqual([
        { ecosystem: 'npm', name: 'lodash', version: '^4.17.21', source: 'command', command: 'npm install -D lodash@^4.17.21 @types/node chalk' },
        { ecosystem: 'npm', name: '@types/node', version: undefined, source: 'command', command: 'npm install -D lodash@^4.17.21 @types/node chalk' },
        { ecosystem: 'npm', name: 'chalk', version: undefined, source: 'command', command: 'npm install -D lodash@^4.17.21 @types/node chalk' },
      ]);
    });

    it('parses pnpm add with workspace flag', () => {
      const candidates = parseInstallCommand('pnpm add -w vitest@latest');
      expect(candidates).toEqual([
        { ecosystem: 'npm', name: 'vitest', version: 'latest', source: 'command', command: 'pnpm add -w vitest@latest' },
      ]);
    });

    it('parses pip install with version constraints', () => {
      const candidates = parseInstallCommand('pip install requests>=2.28.0 urllib3==1.26.15 --no-cache-dir');
      expect(candidates).toEqual([
        { ecosystem: 'pypi', name: 'requests', version: '>=2.28.0', source: 'command', command: 'pip install requests>=2.28.0 urllib3==1.26.15 --no-cache-dir' },
        { ecosystem: 'pypi', name: 'urllib3', version: '==1.26.15', source: 'command', command: 'pip install requests>=2.28.0 urllib3==1.26.15 --no-cache-dir' },
      ]);
    });

    it('parses uv add and pipx install', () => {
      expect(parseInstallCommand('uv add fastapi')).toEqual([
        { ecosystem: 'pypi', name: 'fastapi', version: undefined, source: 'command', command: 'uv add fastapi' },
      ]);
      expect(parseInstallCommand('pipx install ruff')).toEqual([
        { ecosystem: 'pypi', name: 'ruff', version: undefined, source: 'command', command: 'pipx install ruff' },
      ]);
    });

    it('parses cargo add with feature flags', () => {
      const candidates = parseInstallCommand('cargo add serde --features derive tokio@1.0');
      expect(candidates).toEqual([
        { ecosystem: 'cargo', name: 'serde', version: undefined, source: 'command', command: 'cargo add serde --features derive tokio@1.0' },
        { ecosystem: 'cargo', name: 'tokio', version: '1.0', source: 'command', command: 'cargo add serde --features derive tokio@1.0' },
      ]);
    });

    it('parses brew, gem, and go get', () => {
      expect(parseInstallCommand('brew install ripgrep')).toEqual([
        { ecosystem: 'homebrew', name: 'ripgrep', version: undefined, source: 'command', command: 'brew install ripgrep' },
      ]);
      expect(parseInstallCommand('gem install rails')).toEqual([
        { ecosystem: 'rubygems', name: 'rails', version: undefined, source: 'command', command: 'gem install rails' },
      ]);
      expect(parseInstallCommand('go get github.com/gin-gonic/gin@v1.9.1')).toEqual([
        { ecosystem: 'go', name: 'github.com/gin-gonic/gin', version: 'v1.9.1', source: 'command', command: 'go get github.com/gin-gonic/gin@v1.9.1' },
      ]);
    });

    it('ignores non-install commands', () => {
      expect(parseInstallCommand('npm run build')).toEqual([]);
      expect(parseInstallCommand('git commit -m "feat: install something"')).toEqual([]);
      expect(parseInstallCommand('echo "npm i lodash"')).toEqual([]);
    });
  });

  describe('parseLockfileDiff', () => {
    it('parses package-lock.json diff additions', () => {
      const diff = `
@@ -10,6 +10,12 @@
+    "node_modules/lodash": {
+      "version": "4.17.21",
+      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"
+    },
`;
      const candidates = parseLockfileDiff('package-lock.json', diff);
      expect(candidates).toEqual([
        { ecosystem: 'npm', name: 'lodash', version: '4.17.21', source: 'lockfile', lockfile: 'package-lock.json' },
      ]);
    });

    it('parses pnpm-lock.yaml diff additions', () => {
      const diff = `
@@ -50,6 +50,7 @@ packages:
+  /@types/lodash@4.14.202:
+    resolution: {integrity: sha512-foo}
   /express@4.18.2:
`;
      const candidates = parseLockfileDiff('pnpm-lock.yaml', diff);
      expect(candidates).toEqual([
        { ecosystem: 'npm', name: '@types/lodash', version: '4.14.202', source: 'lockfile', lockfile: 'pnpm-lock.yaml' },
      ]);
    });

    it('parses Cargo.lock diff additions', () => {
      const diff = `
@@ -100,6 +100,11 @@
+[[package]]
+name = "syn"
+version = "2.0.48"
`;
      const candidates = parseLockfileDiff('Cargo.lock', diff);
      expect(candidates).toEqual([
        { ecosystem: 'cargo', name: 'syn', version: '2.0.48', source: 'lockfile', lockfile: 'Cargo.lock' },
      ]);
    });

    it('parses requirements.txt diff additions', () => {
      const diff = `
@@ -5,2 +5,3 @@
+requests==2.31.0
+pydantic>=2.0.0
`;
      const candidates = parseLockfileDiff('requirements.txt', diff);
      expect(candidates).toEqual([
        { ecosystem: 'pypi', name: 'requests', version: '==2.31.0', source: 'lockfile', lockfile: 'requirements.txt' },
        { ecosystem: 'pypi', name: 'pydantic', version: '>=2.0.0', source: 'lockfile', lockfile: 'requirements.txt' },
      ]);
    });
  });
});
