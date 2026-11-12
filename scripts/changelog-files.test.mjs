// vitest, node builtins only: pins CHANGELOG_APP_IDS (packages/shared/src/release.ts) to the apps/*
// directories and checks every per-app changelog is shaped the way extractLatestSections reads it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseSrc = readFileSync(join(root, 'packages/shared/src/release.ts'), 'utf8');

const ids = [...releaseSrc.match(/CHANGELOG_APP_IDS = \[([^\]]*)\]/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

const appDirs = readdirSync(join(root, 'apps'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, 'apps', d.name, 'moon.yml')))
  .map((d) => d.name)
  .filter((n) => n !== 'studio' && n !== 'launcher')
  .sort();

const sourcePath = (id) => (id === 'studio' ? 'CHANGELOG.md' : `apps/${id}/CHANGELOG.md`);
const HEADING = /^## \[(Unreleased|\d+\.\d+\.\d+)\]( - \d{4}-\d{2}-\d{2})?$/;

describe('per-app changelog files', () => {
  it('CHANGELOG_APP_IDS lists studio, launcher, then every app directory', () => {
    expect(ids).toEqual(['studio', 'launcher', ...appDirs]);
  });

  for (const id of ids) {
    describe(id, () => {
      const file = join(root, sourcePath(id));
      it('exists, starts "# Changelog" and has one [Unreleased]', () => {
        expect(existsSync(file)).toBe(true);
        const text = readFileSync(file, 'utf8');
        expect(text.split('\n')[0].startsWith('# Changelog')).toBe(true);
        expect(text.split('\n').filter((l) => l === '## [Unreleased]')).toHaveLength(1);
      });
      it('has only parseable section headings', () => {
        const headings = readFileSync(file, 'utf8')
          .split('\n')
          .filter((l) => l.startsWith('## '));
        for (const h of headings) expect(h).toMatch(HEADING);
      });
    });
  }
});
