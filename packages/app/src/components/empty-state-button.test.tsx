import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LuPlay } from 'react-icons/lu';
import { PiPlayFill } from 'react-icons/pi';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmptyStateButton } from './empty-state';

afterEach(cleanup);

describe('EmptyStateButton', () => {
  it('fills with the primary colour, glows and turns white on hover', () => {
    render(<EmptyStateButton icon={LuPlay} label="Start" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Start' });
    // At rest: the Models view's outlined primary tint.
    expect(button.className).toContain('border-primary');
    expect(button.className).toContain('bg-primary/10');
    expect(button.className).toContain('text-primary');
    // Hovered: solid primary, white text, a primary glow.
    expect(button.className).toContain('enabled:hover:bg-primary');
    expect(button.className).toContain('enabled:hover:text-white');
    expect(button.className).toMatch(/enabled:hover:shadow-\[[^\]]*--primary/);
  });

  it('swaps to the filled glyph on hover when one is given', () => {
    const { container } = render(
      <EmptyStateButton icon={LuPlay} filledIcon={PiPlayFill} label="Start" onClick={() => {}} />,
    );
    const outline = container.querySelector('[data-icon="outline"]')!;
    const filled = container.querySelector('[data-icon="filled"]')!;
    expect(outline.getAttribute('class')).toContain('group-hover:hidden');
    expect(filled.getAttribute('class')).toContain('hidden');
    expect(filled.getAttribute('class')).toContain('group-hover:block');
  });

  it('renders only the outline glyph without a filled variant', () => {
    const { container } = render(<EmptyStateButton icon={LuPlay} label="Start" onClick={() => {}} />);
    expect(container.querySelector('[data-icon="filled"]')).toBeNull();
    expect(container.querySelector('[data-icon="outline"]')!.getAttribute('class')).not.toContain(
      'group-hover:hidden',
    );
  });

  it('shows the busy node instead of the icons and stays disabled', () => {
    const onClick = vi.fn();
    const { container } = render(
      <EmptyStateButton
        icon={LuPlay}
        filledIcon={PiPlayFill}
        label="Start"
        onClick={onClick}
        disabled
        busy={<span data-testid="busy" />}
      />,
    );
    expect(screen.getByTestId('busy')).toBeTruthy();
    expect(container.querySelector('[data-icon]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
