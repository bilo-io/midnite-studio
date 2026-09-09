import { describe, expect, it } from 'vitest';
import { checkGateCoverage, NATIVE_PROJECTS, NODE_PROJECTS } from './gate-projects-check.mjs';

describe('checkGateCoverage', () => {
  it('passes when every discovered package is claimed exactly once', () => {
    const result = checkGateCoverage(['shared', 'app', 'git-engine'], ['shared', 'app'], ['git-engine']);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/OK/);
  });

  it('fails when a discovered package is in neither list', () => {
    const result = checkGateCoverage(['shared', 'app', 'new-pkg'], ['shared', 'app'], []);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('new-pkg: in packages/ but not in NODE_PROJECTS or NATIVE_PROJECTS');
  });

  it('fails when a package is claimed by both lists', () => {
    const result = checkGateCoverage(['shared', 'app'], ['shared', 'app'], ['app']);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('app: claimed by BOTH gate-node and gate-native');
  });

  it('fails when a list names a package that no longer exists on disk', () => {
    const result = checkGateCoverage(['shared'], ['shared', 'removed-pkg'], []);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('removed-pkg: listed in scripts/gate-projects-check.mjs but no packages/removed-pkg directory exists');
  });

  it('is trivially ok when nothing is discovered and nothing is listed', () => {
    expect(checkGateCoverage([], [], []).ok).toBe(true);
  });

  it('the real NODE_PROJECTS/NATIVE_PROJECTS lists cover the repo today, with no overlap', () => {
    const overlap = NODE_PROJECTS.filter((p) => NATIVE_PROJECTS.includes(p));
    expect(overlap).toEqual([]);
    // git-engine and desktop are the only two that need dugite's bundled git /
    // node-pty; everything else is platform-agnostic and belongs on the 1x runner.
    expect(NATIVE_PROJECTS.sort()).toEqual(['desktop', 'git-engine']);
    expect(NODE_PROJECTS.sort()).toEqual(['app', 'db-engine', 'shared', 'website']);
  });
});
