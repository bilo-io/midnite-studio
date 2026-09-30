import { PAGE_WINDOW_ROLES } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { AGENT_NAV_ITEMS } from '../app';
import { PAGE_ROLE_TITLE } from './page-detach-mark';

// Source scan (raw imports): rendering all four heavy views here would need a
// bridge mock apiece for a one-line assertion.
const SOURCES = import.meta.glob<string>(
  [
    '../features/councils/councils-view.tsx',
    '../features/workflows/workflow-list.tsx',
    '../features/media/media-view.tsx',
    '../features/models/models-view.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const allSource = Object.values(SOURCES).join('\n');

describe('Agents rail views are detachable', () => {
  for (const { view } of AGENT_NAV_ITEMS) {
    it(`${view} is a page role, titled, and renders PageDetachMark`, () => {
      expect(PAGE_WINDOW_ROLES as readonly string[]).toContain(view);
      expect(PAGE_ROLE_TITLE).toHaveProperty(view);
      expect(allSource).toContain(`<PageDetachMark role="${view}" />`);
    });
  }
});
