import { mkdtempSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createStalenessProbe, staleBrokerMessage } from './staleness';

describe('staleness probe', () => {
  it('is quiet while the watched files are the ones it started with', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-stale-'));
    const helper = join(tmp, 'spawn-helper');
    writeFileSync(helper, 'x');

    const probe = createStalenessProbe([helper]);
    expect(probe()).toBeNull();
    expect(probe()).toBeNull();
  });

  it('names the file that went missing — the moved spawn-helper case', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-stale-'));
    const helper = join(tmp, 'spawn-helper');
    writeFileSync(helper, 'x');

    const probe = createStalenessProbe([helper]);
    unlinkSync(helper);

    expect(probe()).toBe('spawn-helper is gone from disk');
  });

  it('names the file that was replaced — the reinstall-under-a-running-broker case', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-stale-'));
    const script = join(tmp, 'broker.js');
    writeFileSync(script, 'v1');

    const probe = createStalenessProbe([script]);
    // Same size, different mtime — a rebuild that happens to be byte-for-byte as long.
    writeFileSync(script, 'v2');
    const later = new Date(Date.now() + 60_000);
    utimesSync(script, later, later);

    expect(probe()).toBe('broker.js on disk has been replaced');
  });

  it('ignores a file that never existed rather than calling a helper-less platform stale', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-stale-'));
    const probe = createStalenessProbe([join(tmp, 'never-there')]);
    expect(probe()).toBeNull();
  });

  it('phrases the reason for a person, ending in a full stop', () => {
    expect(staleBrokerMessage('spawn-helper is gone from disk')).toMatch(
      /previous build of Midnite Studio .* spawn-helper is gone from disk\.$/,
    );
  });
});
