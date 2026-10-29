import { describe, expect, it } from 'vitest';
import { checkGateCoverage, discoverProjectIds, NATIVE_PROJECTS, NODE_PROJECTS } from './gate-projects-check.mjs';

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

  it('names packages/features/<name> for a stale feature-<name> entry', () => {
    const result = checkGateCoverage(['shared'], ['shared', 'feature-gone'], []);
    expect(result.message).toContain('feature-gone: listed in scripts/gate-projects-check.mjs but no packages/features/gone directory exists');
  });

  it('is trivially ok when nothing is discovered and nothing is listed', () => {
    expect(checkGateCoverage([], [], []).ok).toBe(true);
  });

  it('the real NODE_PROJECTS/NATIVE_PROJECTS lists cover the repo today, with no overlap', () => {
    const overlap = NODE_PROJECTS.filter((p) => NATIVE_PROJECTS.includes(p));
    expect(overlap).toEqual([]);
    // git-engine and desktop need dugite's bundled git / node-pty; runtime is
    // the main-process layer the safeStorage vault moves into (Phase 113).
    // Everything else is platform-agnostic and belongs on the 1x runner.
    expect(NATIVE_PROJECTS.sort()).toEqual(['desktop', 'git-engine', 'runtime']);
    expect(NODE_PROJECTS.sort()).toEqual(['app', 'db-engine', 'feature-api-client', 'feature-browser', 'feature-capture', 'feature-chats', 'feature-councils', 'feature-database', 'feature-finance', 'feature-forge', 'feature-forge-host', 'feature-mcp-tools', 'feature-media-audio', 'feature-media-core', 'feature-media-docs', 'feature-media-game', 'feature-media-images', 'feature-media-library', 'feature-media-map', 'feature-media-model', 'feature-media-sprite', 'feature-media-terrain', 'feature-media-video', 'feature-models', 'feature-monitor', 'feature-notes', 'feature-optimizer', 'feature-report', 'feature-sessions', 'feature-slides', 'feature-tasks', 'feature-tests', 'feature-vanguard', 'feature-vault', 'feature-workflows', 'frame', 'knowledge', 'shared', 'website']);
  });
});

describe('discoverProjectIds', () => {
  it('maps packages/<x> to <x> and packages/features/<name> to feature-<name>, skipping the features container', () => {
    expect(discoverProjectIds(['shared', 'features', 'app'], ['optimizer', 'monitor'])).toEqual([
      'shared',
      'app',
      'feature-optimizer',
      'feature-monitor',
    ]);
  });

  it('a new feature folder with no gate entry fails the coverage check', () => {
    const discovered = discoverProjectIds(['shared', 'features'], ['optimizer', 'vault']);
    const result = checkGateCoverage(discovered, ['shared', 'feature-optimizer'], []);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('feature-vault: in packages/ but not in NODE_PROJECTS');
  });

  it('maps packages/modules/<name> to module-<name>, skipping the container and _template', () => {
    expect(discoverProjectIds(['shared', 'modules'], [], ['coder', '_template'])).toEqual(['shared', 'module-coder']);
  });
});
