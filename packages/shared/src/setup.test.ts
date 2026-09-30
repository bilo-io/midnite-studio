import { describe, expect, it } from 'vitest';

import {
  composeBrewInstall,
  HOMEBREW_INSTALL_COMMAND,
  planSetupInstall,
  SETUP_CATALOGUE,
  SetupItemSchema,
  SetupProbeRequest,
  SetupProbeResponse,
  setupItem,
  setupVersionNumber,
  XCODE_CLT_INSTALL_COMMAND,
  type SetupItem,
} from './setup';

const item = (id: string, install: SetupItem['install']): SetupItem => ({
  id,
  label: id,
  group: 'core',
  probe: { bin: id, versionArg: '--version', paths: [] },
  install,
  icon: { set: 'lu', name: 'LuBox' },
  brandColor: '#000000',
});

describe('SETUP_CATALOGUE', () => {
  it('round-trips every row through its schema unchanged', () => {
    for (const row of SETUP_CATALOGUE) expect(SetupItemSchema.parse(row)).toEqual(row);
  });

  it('has unique ids, and setupItem finds each one', () => {
    const ids = SETUP_CATALOGUE.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(setupItem(id)?.id).toBe(id);
    expect(setupItem('nope')).toBeUndefined();
  });

  it('rejects shell-shaped probes and a brew install naming both a formula and a cask', () => {
    const base = item('x', null);
    expect(SetupItemSchema.safeParse({ ...base, probe: { ...base.probe, bin: 'git; rm -rf ~' } }).success).toBe(false);
    expect(SetupItemSchema.safeParse({ ...base, probe: { ...base.probe, versionArg: '$(id)' } }).success).toBe(false);
    expect(SetupItemSchema.safeParse({ ...base, probe: { ...base.probe, paths: ['relative/bin'] } }).success).toBe(false);
    expect(SetupItemSchema.safeParse({ ...base, install: { brew: { formula: 'a', cask: 'b' } } }).success).toBe(false);
    expect(SetupItemSchema.safeParse({ ...base, brandColor: 'orange' }).success).toBe(false);
  });
});

describe('setupProbe schemas', () => {
  it('takes one to 64 ids and answers id/installed/version/path rows', () => {
    expect(SetupProbeRequest.safeParse({ ids: ['git'] }).success).toBe(true);
    expect(SetupProbeRequest.safeParse({ ids: [] }).success).toBe(false);
    expect(SetupProbeRequest.safeParse({ ids: [''] }).success).toBe(false);
    const res = { results: [{ id: 'git', installed: true, version: 'git version 2.45.0', path: '/usr/bin/git' }] };
    expect(SetupProbeResponse.parse(res)).toEqual(res);
    expect(SetupProbeResponse.safeParse({ results: [{ id: 'git', installed: true }] }).success).toBe(false);
  });
});

describe('composeBrewInstall', () => {
  const git = item('git', { brew: { formula: 'git' } });
  const gh = item('gh', { brew: { formula: 'gh' } });
  const ollama = item('ollama', { brew: { cask: 'ollama-app' } });
  const orbstack = item('orbstack', { brew: { cask: 'orbstack' } });

  it('puts formulae in one brew install and casks in one --cask install', () => {
    expect(composeBrewInstall([git, ollama, gh, orbstack])).toBe(
      'brew install git gh && brew install --cask ollama-app orbstack',
    );
  });

  it('emits only the half it needs', () => {
    expect(composeBrewInstall([git])).toBe('brew install git');
    expect(composeBrewInstall([ollama])).toBe('brew install --cask ollama-app');
  });

  it('never repeats a package, even across two items naming it', () => {
    expect(composeBrewInstall([git, git, item('git-too', { brew: { formula: 'git' } })])).toBe('brew install git');
  });

  it('is null when nothing is brew-installable', () => {
    expect(composeBrewInstall([])).toBeNull();
    expect(composeBrewInstall([item('homebrew', null)])).toBeNull();
  });
});

describe('planSetupInstall', () => {
  const git = setupItem('git')!;
  const gh = item('gh', { brew: { formula: 'gh' } });

  it('offers one brew line when brew is installed', () => {
    expect(planSetupInstall([git, gh], true)).toEqual([
      { id: 'brew', label: 'Install with Homebrew', command: 'brew install git gh' },
    ]);
  });

  it('offers the Homebrew bootstrap first when brew is missing', () => {
    expect(planSetupInstall([gh], false)).toEqual([
      { id: 'homebrew-bootstrap', label: 'Install Homebrew first', command: HOMEBREW_INSTALL_COMMAND },
    ]);
  });

  it('adds the Command Line Tools beside the bootstrap for git', () => {
    expect(planSetupInstall([git], false).map((o) => [o.id, o.command])).toEqual([
      ['homebrew-bootstrap', HOMEBREW_INSTALL_COMMAND],
      ['xcode-clt', XCODE_CLT_INSTALL_COMMAND],
    ]);
  });

  it('offers nothing for nothing', () => {
    expect(planSetupInstall([], true)).toEqual([]);
    expect(planSetupInstall([], false)).toEqual([]);
  });
});

describe('setupVersionNumber', () => {
  it('pulls the numeric core out of a version line', () => {
    expect(setupVersionNumber('git version 2.45.0 (Apple Git-154)')).toBe('2.45.0');
    expect(setupVersionNumber('Homebrew 4.4.18')).toBe('4.4.18');
    expect(setupVersionNumber('v22.12.0')).toBe('22.12.0');
    expect(setupVersionNumber('gh version 2.60')).toBe('2.60');
  });

  it('is null for nothing parseable', () => {
    expect(setupVersionNumber(null)).toBeNull();
    expect(setupVersionNumber('unknown')).toBeNull();
  });
});
