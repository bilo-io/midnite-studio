import { describe, expect, it } from 'vitest';

import { logOptionsFor } from './log-service';

const base = { requestId: 'r#1', repoPath: '/tmp/repo', limit: 100 };

describe('logOptionsFor', () => {
  it('walks every ref when nothing is selected', () => {
    expect(logOptionsFor(base)).toEqual({ all: true, limit: 100, revisions: [] });
    expect(logOptionsFor({ ...base, revisions: [] })).toMatchObject({ all: true });
  });

  it('drops --all once refs are named', () => {
    // git walks the UNION of --all and any revisions, so keeping both would
    // reach every ref and silently ignore the filter the user just set.
    const options = logOptionsFor({ ...base, revisions: ['refs/heads/main'] });
    expect(options.all).toBe(false);
    expect(options.revisions).toEqual(['refs/heads/main']);
  });

  it('passes several refs through, so two branches can be compared', () => {
    const options = logOptionsFor({
      ...base,
      revisions: ['refs/heads/main', 'refs/heads/feat'],
    });
    expect(options).toMatchObject({
      all: false,
      revisions: ['refs/heads/main', 'refs/heads/feat'],
    });
  });
});
