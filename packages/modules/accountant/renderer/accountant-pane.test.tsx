import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ACCOUNTANT_NAV_GROUP } from './accountant-nav';
import { AccountantPane, tabOfView } from './accountant-pane';

afterEach(cleanup);

describe('accountant renderer', () => {
  it('lists six views under one group', () => {
    expect(ACCOUNTANT_NAV_GROUP.id).toBe('accountant');
    expect(ACCOUNTANT_NAV_GROUP.views.map((v) => v.id)).toEqual([
      'accountant.overview', 'accountant.journal', 'accountant.accounts', 'accountant.reports', 'accountant.tax', 'accountant.import',
    ]);
  });

  it('maps a view to its tab, falling back to overview', () => {
    expect(tabOfView('accountant.tax')).toBe('tax');
    expect(tabOfView('nope')).toBe('overview');
  });

  it('renders the empty state with no strip', () => {
    render(<AccountantPane view="accountant.journal" onView={() => {}} />);
    expect(screen.getByText('No books yet')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
