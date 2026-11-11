import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SciencePane } from './science-pane';

describe('SciencePane', () => {
  it('shows the empty notebooks state and routes to templates', () => {
    const onView = vi.fn();
    render(<SciencePane view="notebooks" onView={onView} />);
    expect(screen.getByText('No notebooks yet')).toBeTruthy();
    expect(screen.getByText('New notebook').closest('button')?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByText('Browse templates'));
    expect(onView).toHaveBeenCalledWith('templates');
  });

  it('renders the template shelf for view=templates', () => {
    render(<SciencePane view="templates" onView={() => undefined} />);
    expect(screen.getByTestId('templates-empty')).toBeTruthy();
  });
});
