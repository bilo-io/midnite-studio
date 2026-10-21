import { PAGE_WINDOW_ROLES } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

// Source scan, like `agents-detachable.test.ts`: the view needs a repo, query
// client and bridge to render, for a one-line assertion.
const SOURCES = import.meta.glob<string>('./notes-view.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Notes is detachable', () => {
  it('is a page window role and its header renders the detach mark', () => {
    expect(PAGE_WINDOW_ROLES as readonly string[]).toContain('notes');
    expect(Object.values(SOURCES).join('\n')).toContain('<PageDetachMark role="notes" />');
  });
});
