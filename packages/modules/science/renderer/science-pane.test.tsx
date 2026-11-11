import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SciencePane } from './science-pane';

beforeEach(() => {
  window.midniteStudio = {
    science: { list: vi.fn().mockResolvedValue({ ok: true, value: { notebooks: [], quarantined: 0 } }) },
  } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('SciencePane', () => {
  it('shows the empty notebooks state and routes to templates', async () => {
    const onView = vi.fn();
    render(<SciencePane view="notebooks" onView={onView} />);
    await waitFor(() => expect(screen.getByText('No notebooks yet')).toBeTruthy());
    fireEvent.click(screen.getByText('Browse templates'));
    expect(onView).toHaveBeenCalledWith('templates');
  });

  it('renders the template shelf for view=templates', () => {
    render(<SciencePane view="templates" onView={() => undefined} />);
    expect(screen.getByTestId('templates-empty')).toBeTruthy();
  });
});
