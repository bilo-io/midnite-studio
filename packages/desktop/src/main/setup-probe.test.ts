import { describe, expect, it, vi } from 'vitest';

import { expandProbePath, firstVersionLine, probeSetupItems } from './setup-probe';

describe('firstVersionLine', () => {
  it('keeps only the first non-empty line', () => {
    expect(firstVersionLine('gh version 2.60.0 (2024-10-01)\nhttps://github.com/cli/cli/releases/tag/v2.60.0\n')).toBe(
      'gh version 2.60.0 (2024-10-01)',
    );
    expect(firstVersionLine('\n\n  git version 2.45.0  \n')).toBe('git version 2.45.0');
  });

  it('is null for no output', () => {
    expect(firstVersionLine(null)).toBeNull();
    expect(firstVersionLine(undefined)).toBeNull();
    expect(firstVersionLine('  \n \n')).toBeNull();
  });
});

describe('expandProbePath', () => {
  it('expands ~/ against the home directory and leaves absolute paths alone', () => {
    expect(expandProbePath('~/.proto/bin/node', '/Users/me')).toBe('/Users/me/.proto/bin/node');
    expect(expandProbePath('/usr/bin/git', '/Users/me')).toBe('/usr/bin/git');
  });
});

describe('probeSetupItems', () => {
  it("drives probeBinary from the catalogue's own bin, paths and version argument", async () => {
    const probe = vi.fn().mockResolvedValue({ path: '/usr/bin/git', version: 'git version 2.45.0\n' });
    const { results } = await probeSetupItems(['git'], probe, '/Users/me');
    expect(probe).toHaveBeenCalledWith(
      'git',
      ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'],
      '--version',
    );
    expect(results).toEqual([{ id: 'git', installed: true, version: 'git version 2.45.0', path: '/usr/bin/git' }]);
  });

  it('reports a missing binary as not installed', async () => {
    const probe = vi.fn().mockResolvedValue({ path: null, version: null });
    const { results } = await probeSetupItems(['homebrew'], probe);
    expect(results).toEqual([{ id: 'homebrew', installed: false, version: null, path: null }]);
  });

  it('drops unknown ids and duplicates rather than guessing', async () => {
    const probe = vi.fn().mockResolvedValue({ path: null, version: null });
    const { results } = await probeSetupItems(['git', 'rm -rf', 'git'], probe);
    expect(results.map((r) => r.id)).toEqual(['git']);
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
