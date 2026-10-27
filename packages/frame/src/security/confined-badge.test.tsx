import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CONFINED_SESSION_LABEL } from '@midnite/studio-shared';
import { ConfinedBadge } from './confined-badge';

afterEach(() => {
  cleanup();
});

describe('ConfinedBadge', () => {
  it('renders a lock icon with the confined session accessible label and tooltip', () => {
    render(<ConfinedBadge />);
    const badge = screen.getByTestId('confined-badge');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('role')).toBe('img');
    expect(badge.getAttribute('aria-label')).toBe('Confined session');
    expect(badge.querySelector('title')?.textContent).toBe(CONFINED_SESSION_LABEL);
  });

  it('merges custom className', () => {
    render(<ConfinedBadge className="custom-class" />);
    const badge = screen.getByTestId('confined-badge');
    expect(badge.getAttribute('class')).toContain('custom-class');
  });
});
