// vitest, node builtins only: a temp repo with two changelogs, one carrying the section and one not.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as shared from '../packages/shared/src/release.ts';
import { sectionWarnings } from './changelog-sections-check.mjs';

describe('sectionWarnings', () => {
  it('warns once, naming the file without the section', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cl-check-'));
    mkdirSync(path.join(root, 'apps/money'), { recursive: true });
    mkdirSync(path.join(root, 'apps/agents'), { recursive: true });
    writeFileSync(
      path.join(root, 'apps/money/CHANGELOG.md'),
      '# Changelog\n\n## [Unreleased]\n\n## [0.0.7] - 2026-11-20\n\n### Added\n- x\n',
    );
    writeFileSync(path.join(root, 'apps/agents/CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
    const warnings = await sectionWarnings('0.0.7', { root, ids: ['money', 'agents'], shared });
    expect(warnings).toEqual([
      '::warning::apps/agents/CHANGELOG.md has no section for 0.0.7; its in-app notes will be empty',
    ]);
  });
});
