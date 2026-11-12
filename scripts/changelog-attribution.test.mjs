// vitest, node builtins only: pure attribution over an in-memory project map; the two literal lists
// are pinned to shared's source the way affected-apps.test.mjs pins PLACEMENT_APPS.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHANGELOG_APP_IDS,
  RETIRED_SUITE_APP_HOSTS,
  appsForFile,
  attribute,
  parseTags,
  readProjectTags,
} from './changelog-attribution.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');

const projects = new Map([
  ['packages/modules/coder', ['app-agents']],
  ['packages/modules/old', ['app-coder']],
  ['packages/frame', ['app-all']],
  ['packages/features', ['app-money']],
  ['packages/features/media-core', ['app-media']],
  ['apps/launcher', []],
]);

describe('appsForFile', () => {
  it('maps a module tagged app-agents to agents', () => {
    expect([...appsForFile('packages/modules/coder/main/x.ts', projects)]).toEqual(['agents']);
  });
  it('maps a retired id to its host', () => {
    expect([...appsForFile('packages/modules/old/a.ts', projects)]).toEqual(['agents']);
  });
  it('app-all is the wildcard', () => {
    expect([...appsForFile('packages/frame/src/a.tsx', projects)]).toEqual(['*']);
  });
  it('a file under no project names nothing', () => {
    expect(appsForFile('README.md', projects).size).toBe(0);
  });
  it('the launcher is its own app', () => {
    expect([...appsForFile('apps/launcher/src/main/ipc.ts', projects)]).toEqual(['launcher']);
  });
  it('the deeper nested project wins', () => {
    expect([...appsForFile('packages/features/media-core/a.ts', projects)]).toEqual(['media']);
  });
  it('drops ids outside the changelog list', () => {
    const p = new Map([['packages/x', ['app-simulator', 'app-health']]]);
    expect(appsForFile('packages/x/a.ts', p).size).toBe(0);
  });
});

describe('attribute', () => {
  it('lists a commit once per app, studio gets every app-reaching commit', () => {
    const out = attribute(
      [{ sha: 'a1', subject: 'feat: x', files: ['packages/modules/coder/a.ts', 'packages/modules/coder/b.ts'] }],
      projects,
    );
    expect(out.agents).toEqual([{ sha: 'a1', subject: 'feat: x', suite: false }]);
    expect(out.studio).toHaveLength(1);
    expect(out.money).toEqual([]);
  });
  it('app-all lands under every id with suite: true', () => {
    const out = attribute([{ sha: 'b2', subject: 'fix: y', files: ['packages/frame/src/a.tsx'] }], projects);
    for (const id of CHANGELOG_APP_IDS) expect(out[id]).toEqual([{ sha: 'b2', subject: 'fix: y', suite: true }]);
  });
  it('a direct hit beats the suite-wide flag; unowned commits are dropped', () => {
    const out = attribute(
      [
        { sha: 'c3', subject: 'feat: z', files: ['packages/frame/a.ts', 'packages/modules/coder/a.ts'] },
        { sha: 'd4', subject: 'docs: w', files: ['README.md'] },
      ],
      projects,
    );
    expect(out.agents.find((c) => c.sha === 'c3').suite).toBe(false);
    expect(Object.values(out).flat().some((c) => c.sha === 'd4')).toBe(false);
  });
});

describe('parseTags', () => {
  it('reads quoted and bare items until the next key', () => {
    expect(parseTags("id: x\ntags:\n  - 'layer-app'\n  - app-money\nlanguage: ts\n")).toEqual(['layer-app', 'app-money']);
  });
});

describe('literal lists stay pinned to shared', () => {
  it('CHANGELOG_APP_IDS', () => {
    const src = read('packages/shared/src/release.ts');
    const ids = [...src.match(/CHANGELOG_APP_IDS = \[([^\]]*)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(CHANGELOG_APP_IDS).toEqual(ids);
  });
  it('RETIRED_SUITE_APP_HOSTS', () => {
    const src = read('packages/shared/src/suite-apps.ts');
    const body = src.match(/RETIRED_SUITE_APP_HOSTS = \{([^}]*)\}/)[1];
    const pairs = Object.fromEntries([...body.matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
    expect(RETIRED_SUITE_APP_HOSTS).toEqual(pairs);
  });
});

describe('readProjectTags (real tree)', () => {
  it('finds the money app and shared', () => {
    const real = readProjectTags(repoRoot);
    expect(real.get('apps/money')).toContain('app-money');
    expect(real.get('packages/shared')).toContain('app-all');
  });
});
