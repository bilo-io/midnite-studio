import { PAGE_WINDOW_ROLES } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { PAGE_ROLE_TITLE } from '../../components/page-detach-mark';

// Source scan, like `agents-detachable.test.ts`: the view needs a repo, query
// client and bridge to render, for a one-line assertion.
const SOURCES = import.meta.glob<string>('./notes-view.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Notes is detachable', () => {
  it('is a titled page role and its header renders the detach mark', () => {
    expect(PAGE_WINDOW_ROLES as readonly string[]).toContain('notes');
    expect(PAGE_ROLE_TITLE.notes).toBe('Notes');
    expect(Object.values(SOURCES).join('\n')).toContain('<PageDetachMark role="notes" />');
  });
});
