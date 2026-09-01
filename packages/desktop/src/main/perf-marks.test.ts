import { describe, expect, it } from 'vitest';

import { createBootMark } from './perf-marks';

describe('boot marks (Phase 36 Theme A)', () => {
  it('logs each stage with elapsed-since-start, in the format the report parses', () => {
    const lines: string[] = [];
    let clock = 0;
    const mark = createBootMark({ enabled: true, log: (m) => lines.push(m), now: () => clock });

    clock = 118.6;
    mark('login-shell-done');
    clock = 402;
    mark('when-ready');

    expect(lines).toEqual(['[perf] main login-shell-done 119', '[perf] main when-ready 402']);
  });

  it('is a no-op with the flag unset — an ordinary launch logs nothing', () => {
    const lines: string[] = [];
    const mark = createBootMark({
      enabled: false,
      log: (m) => lines.push(m),
      // Not even consulted: the disabled path returns an empty closure rather
      // than checking a flag per call.
      now: () => {
        throw new Error('clock read while perf marks are disabled');
      },
    });

    mark('ready-to-show');

    expect(lines).toEqual([]);
  });
});
