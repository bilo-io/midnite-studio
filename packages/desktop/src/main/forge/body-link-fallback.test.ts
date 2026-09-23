import { describe, expect, it } from 'vitest';

import { withBlockedByLine, withoutBlockedByLine } from './body-link-fallback';

describe('withBlockedByLine', () => {
  it('appends the canonical line to a non-empty body', () => {
    const result = withBlockedByLine('Some description.', { repo: '', number: 12 });
    expect(result.changed).toBe(true);
    expect(result.body).toBe('Some description.\n\nBlocked by #12');
  });

  it('writes the line alone when the body is empty', () => {
    const result = withBlockedByLine('', { repo: '', number: 12 });
    expect(result.changed).toBe(true);
    expect(result.body).toBe('Blocked by #12');
  });

  it('writes an owner/name-qualified line for a foreign repo', () => {
    const result = withBlockedByLine('Body.', { repo: 'acme/widgets', number: 7 });
    expect(result.body).toBe('Body.\n\nBlocked by acme/widgets#7');
  });

  it('is idempotent — a second call against an already-linked body is a no-op', () => {
    const first = withBlockedByLine('Body.', { repo: '', number: 12 });
    const second = withBlockedByLine(first.body, { repo: '', number: 12 });
    expect(second.changed).toBe(false);
    expect(second.body).toBe(first.body);
    // Only one line, never a duplicate.
    expect(first.body.match(/Blocked by #12/g)).toHaveLength(1);
  });

  it('recognises an existing reference written in a different accepted form', () => {
    // `parseBlockerRefs` also reads `blocked-by:` / `depends on` / `requires`
    // — this fallback must not duplicate against those either.
    const result = withBlockedByLine('depends on #12 for the fix.', { repo: '', number: 12 });
    expect(result.changed).toBe(false);
  });

  it('does not confuse a same-numbered issue in a different repo', () => {
    const result = withBlockedByLine('Blocked by #12', { repo: 'acme/widgets', number: 12 });
    expect(result.changed).toBe(true);
  });
});

describe('withoutBlockedByLine', () => {
  it('removes exactly the line it would have written', () => {
    const linked = withBlockedByLine('Body.', { repo: '', number: 12 });
    const unlinked = withoutBlockedByLine(linked.body, { repo: '', number: 12 });
    expect(unlinked.changed).toBe(true);
    expect(unlinked.body).toBe('Body.');
  });

  it('is idempotent — removing an absent link is a no-op', () => {
    const result = withoutBlockedByLine('Body.', { repo: '', number: 12 });
    expect(result.changed).toBe(false);
    expect(result.body).toBe('Body.');
  });

  it('never touches prose that only mentions "blocked by" in passing', () => {
    const body = 'This paragraph is blocked by nothing in particular, just slow.';
    const result = withoutBlockedByLine(body, { repo: '', number: 12 });
    expect(result.changed).toBe(false);
    expect(result.body).toBe(body);
  });

  it('leaves an empty body when the removed line was the only content', () => {
    const result = withoutBlockedByLine('Blocked by #12', { repo: '', number: 12 });
    expect(result.body).toBe('');
  });
});
