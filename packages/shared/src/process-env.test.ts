import { describe, expect, it } from 'vitest';
import { POSIX_NUMERIC_ENV, parseableProcessEnv } from './process-env';

describe('POSIX_NUMERIC_ENV', () => {
  it('freezes LC_ALL and LC_NUMERIC to C', () => {
    expect(POSIX_NUMERIC_ENV).toEqual({
      LC_ALL: 'C',
      LC_NUMERIC: 'C',
    });
    expect(Object.isFrozen(POSIX_NUMERIC_ENV)).toBe(true);
  });

  it('merges onto base env and overrides existing LC variables', () => {
    const custom = {
      PATH: '/usr/bin',
      LC_ALL: 'de_DE.UTF-8',
      LC_NUMERIC: 'fr_FR.UTF-8',
      CUSTOM: '123',
    };
    const result = parseableProcessEnv(custom);
    expect(result).toEqual({
      PATH: '/usr/bin',
      LC_ALL: 'C',
      LC_NUMERIC: 'C',
      CUSTOM: '123',
    });
  });

  it('defaults to process.env if no argument is passed', () => {
    const result = parseableProcessEnv();
    expect(result.LC_ALL).toBe('C');
    expect(result.LC_NUMERIC).toBe('C');
  });
});
