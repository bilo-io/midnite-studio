import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCargoLock, parseGoSum, parseLockfile, parsePackageLock, parsePnpmLock, parseRequirementsTxt, parseYarnLock } from './parsers';

const path = 'x/lock';

describe('lockfile parsers (Phase 122 Theme B)', () => {
  it('pnpm v9: packages section, peer suffixes stripped, importer deps are direct', () => {
    const body = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      lodash:
        specifier: ^4.0.0
        version: 4.17.20
    devDependencies:
      '@scope/dev':
        specifier: ^1.0.0
        version: 1.2.3(react@18.0.0)

packages:

  lodash@4.17.20:
    resolution: {integrity: sha512-x}

  '@scope/dev@1.2.3':
    resolution: {integrity: sha512-y}

  inner@0.1.0:
    resolution: {integrity: sha512-z}

snapshots:

  lodash@4.17.20: {}
`;
    const pkgs = parsePnpmLock(body, { path });
    expect(pkgs).toEqual([
      { ecosystem: 'npm', name: 'lodash', version: '4.17.20', direct: true, path },
      { ecosystem: 'npm', name: '@scope/dev', version: '1.2.3', direct: true, path },
      { ecosystem: 'npm', name: 'inner', version: '0.1.0', direct: false, path },
    ]);
  });

  it('pnpm v6 and v5 key forms', () => {
    const v6 = `lockfileVersion: '6.0'\n\ndependencies:\n  foo:\n    specifier: ^1\n    version: 1.0.0\n\npackages:\n\n  /foo@1.0.0:\n    resolution: {}\n  /@a/b@2.0.0(x@1.0.0):\n    resolution: {}\n`;
    expect(parsePnpmLock(v6, { path }).map((p) => `${p.name}@${p.version}:${p.direct}`)).toEqual(['foo@1.0.0:true', '@a/b@2.0.0:false']);
    const v5 = `lockfileVersion: 5.4\n\npackages:\n\n  /foo/1.0.0:\n    resolution: {}\n  /@a/b/2.0.0_peer@1.0.0:\n    resolution: {}\n`;
    expect(parsePnpmLock(v5, { path }).map((p) => `${p.name}@${p.version}`)).toEqual(['foo@1.0.0', '@a/b@2.0.0']);
  });

  it('package-lock v3: nested node_modules take the innermost name; links are skipped', () => {
    const body = JSON.stringify({
      packages: {
        '': { dependencies: { a: '^1' } },
        'node_modules/a': { version: '1.0.0' },
        'node_modules/a/node_modules/b': { version: '2.0.0' },
        'node_modules/local': { link: true },
      },
    });
    const pkgs = parsePackageLock(body, { path });
    expect(pkgs.map((p) => `${p.name}@${p.version}:${p.direct}`)).toEqual(['a@1.0.0:true', 'b@2.0.0:false']);
  });

  it('package-lock v1 walks nested dependencies', () => {
    const body = JSON.stringify({ dependencies: { a: { version: '1.0.0', dependencies: { b: { version: '2.0.0' } } } } });
    expect(parsePackageLock(body, { path }).map((p) => `${p.name}@${p.version}:${p.direct}`)).toEqual(['a@1.0.0:true', 'b@2.0.0:false']);
  });

  it('yarn classic: one package per name in a multi-spec header', () => {
    const body = `# yarn lockfile v1\n\n"@a/b@^1.0.0", "@a/b@^1.1.0":\n  version "1.1.5"\n  resolved "x"\n\nfoo@^2.0.0:\n  version "2.3.0"\n`;
    expect(parseYarnLock(body, { path, directNames: new Set(['foo']) }).map((p) => `${p.name}@${p.version}:${p.direct}`)).toEqual(['@a/b@1.1.5:false', 'foo@2.3.0:true']);
  });

  it('requirements.txt reads only exact pins', () => {
    const body = `# c\nDjango==3.0.1\nrequests[security]==2.0.0 ; python_version>"3"\nflask>=1.0\n-e git+https://x\nPyYAML_x==5.1  # note\n`;
    expect(parseRequirementsTxt(body, { path }).map((p) => `${p.name}@${p.version}`)).toEqual(['django@3.0.1', 'requests@2.0.0', 'pyyaml-x@5.1']);
  });

  it('Cargo.lock skips workspace crates without a source', () => {
    const body = `[[package]]\nname = "me"\nversion = "0.1.0"\n\n[[package]]\nname = "serde"\nversion = "1.0.100"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`;
    expect(parseCargoLock(body, { path }).map((p) => `${p.ecosystem}:${p.name}@${p.version}`)).toEqual(['crates.io:serde@1.0.100']);
  });

  it('go.sum drops the /go.mod duplicates and the v prefix', () => {
    const body = `github.com/a/b v1.2.3 h1:x=\ngithub.com/a/b v1.2.3/go.mod h1:y=\n`;
    expect(parseGoSum(body, { path }).map((p) => `${p.name}@${p.version}`)).toEqual(['github.com/a/b@1.2.3']);
  });

  it('pnpm v6 scoped names with a numeric second segment are not read as v5', () => {
    const body = `packages:\n\n  '@scope/2fa@1.0.0':\n    resolution: {}\n`;
    expect(parsePnpmLock(body, { path }).map((p) => `${p.name}@${p.version}`)).toEqual(['@scope/2fa@1.0.0']);
    expect(parseLockfile('constructor', 'x', { path })).toEqual([]);
  });

  it('parseLockfile dispatches by basename and never throws on garbage', () => {
    expect(parseLockfile('package-lock.json', '{not json', { path })).toEqual([]);
    expect(parseLockfile('unknown.lock', 'x', { path })).toEqual([]);
  });

  it("parses this repo's own pnpm-lock.yaml into a large, well-formed set", () => {
    const file = resolve(__dirname, '../../../../../pnpm-lock.yaml');
    if (!existsSync(file)) return;
    const pkgs = parsePnpmLock(readFileSync(file, 'utf8'), { path: file });
    expect(pkgs.length).toBeGreaterThan(500);
    expect(pkgs.every((p) => /^\d/.test(p.version) && p.name.length > 0)).toBe(true);
    expect(pkgs.some((p) => p.direct)).toBe(true);
  });
});
