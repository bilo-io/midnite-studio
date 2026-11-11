// vitest/jsdom: every nav view renders a pane over the mock bridge — nothing here needs a real browser.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { STARTUP_NAV_GROUP } from './startup-nav';
import { StartupPane } from './startup-pane';

afterEach(cleanup);

describe('StartupPane', () => {
  it('renders every nav view without throwing, titled by the view', () => {
    for (const view of STARTUP_NAV_GROUP.views) {
      const { unmount } = render(<StartupPane view={view.id} onView={() => undefined} />);
      expect(screen.getByRole('main', { name: view.label })).toBeTruthy();
      unmount();
    }
  });
});
