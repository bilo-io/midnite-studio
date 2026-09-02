import { cleanup, render, screen } from '@testing-library/react';
import { LuCloudDownload } from 'react-icons/lu';
import { afterEach, describe, expect, it } from 'vitest';

import { IconButton } from './icon-button';

afterEach(cleanup);

/**
 * `busy` used to spin the glyph in place, which only ever read as "working" on
 * the handful of icons that depict rotation — and on a radially symmetric mark
 * read as nothing at all. These assert the swap, not the animation: the glyph
 * leaves and the shared sweeping-ring spinner takes its slot.
 */
describe('IconButton busy', () => {
  it('renders the icon and no spinner at rest', () => {
    render(<IconButton icon={LuCloudDownload} label="Fetch" />);

    const btn = screen.getByRole('button', { name: 'Fetch' });
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.querySelector('.animate-spin')).toBeNull();
    expect(btn.getAttribute('aria-busy')).toBeNull();
  });

  it('swaps the glyph for the css spinner while busy', () => {
    render(<IconButton icon={LuCloudDownload} label="Fetch" busy />);

    const btn = screen.getByRole('button', { name: 'Fetch' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    // The glyph is gone rather than rotating in place.
    expect(btn.querySelector('svg')).toBeNull();

    const spinner = btn.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    // A border ring, not an icon — and tinted with the button's own colour.
    expect(spinner?.className).toContain('rounded-full');
    expect(spinner?.className).toContain('border-r-current');
    expect(spinner?.className).toContain('border-t-current');
  });

  it('sizes the spinner to the icon slot it replaced', () => {
    const { rerender } = render(<IconButton icon={LuCloudDownload} label="Fetch" busy size="sm" />);
    expect(screen.getByRole('button', { name: 'Fetch' }).querySelector('.animate-spin')?.className).toContain(
      'size-3.5',
    );

    rerender(<IconButton icon={LuCloudDownload} label="Fetch" busy size="md" />);
    expect(screen.getByRole('button', { name: 'Fetch' }).querySelector('.animate-spin')?.className).toContain(
      'size-4',
    );
  });

  it('keeps trailing children in place while busy', () => {
    render(
      <IconButton icon={LuCloudDownload} label="Fetch" busy>
        <span>3</span>
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: 'Fetch' }).textContent).toContain('3');
  });
});
