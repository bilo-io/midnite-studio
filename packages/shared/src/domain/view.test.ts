import { describe, expect, it } from 'vitest';

import { parseNavVisibility } from './view';

describe('parseNavVisibility', () => {
  it('returns an empty map for missing or invalid input', () => {
    expect(parseNavVisibility(undefined)).toEqual({});
    expect(parseNavVisibility(null)).toEqual({});
    expect(parseNavVisibility({ graph: 'no' })).toEqual({});
  });

  it('keeps only false entries for known views', () => {
    // `changes` is a removed view now, so it drops like any unknown id.
    expect(
      parseNavVisibility({ graph: false, files: true, actions: false, changes: false, bogus: false }),
    ).toEqual({
      graph: false,
      actions: false,
    });
  });

  it('carries a hidden legacy `projects` over to `tasks`, and drops `issues`', () => {
    expect(parseNavVisibility({ projects: false, issues: false })).toEqual({ tasks: false });
    expect(parseNavVisibility({ projects: false, tasks: true })).toEqual({});
  });
});
