import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ViewportWidgets } from './viewport-widgets';
import { DEFAULT_SNAP } from './snap';

afterEach(cleanup);

describe('ViewportWidgets', () => {
  const defaultProps = {
    mode: 'translate' as const,
    onModeChange: vi.fn(),
    snap: DEFAULT_SNAP,
    onSnapChange: vi.fn(),
    grid: true,
    onGridToggle: vi.fn(),
    axes: true,
    onAxesToggle: vi.fn(),
    dimensions: false,
    onDimensionsToggle: vi.fn(),
  };

  it('renders floating widget container at top-center', () => {
    const { container } = render(<ViewportWidgets {...defaultProps} />);

    const widget = container.querySelector('[role="radiogroup"]');
    expect(widget).toBeTruthy();

    // Check for top positioning and center alignment
    const outer = container.querySelector('.absolute.left-1\\/2');
    expect(outer?.classList.contains('top-2')).toBe(true);
    expect(outer?.classList.contains('-translate-x-1/2')).toBe(true);
  });

  it('displays transform mode radio group', () => {
    render(<ViewportWidgets {...defaultProps} />);

    expect(screen.getByRole('radiogroup', { name: /transform mode/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /move/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /rotate/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /scale/i })).toBeTruthy();
  });

  it('marks current mode as checked', () => {
    const { rerender } = render(<ViewportWidgets {...defaultProps} mode="translate" />);

    expect(screen.getByRole('radio', { name: /move/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /rotate/i }).getAttribute('aria-checked')).toBe('false');

    rerender(<ViewportWidgets {...defaultProps} mode="rotate" />);

    expect(screen.getByRole('radio', { name: /move/i }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: /rotate/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('calls onModeChange when a mode is clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(<ViewportWidgets {...defaultProps} onModeChange={onModeChange} />);

    await user.click(screen.getByRole('radio', { name: /rotate/i }));

    expect(onModeChange).toHaveBeenCalledWith('rotate');
  });

  it('displays snap controls with grid and angle selects', () => {
    render(<ViewportWidgets {...defaultProps} />);

    expect(screen.getByLabelText('Grid snap')).toBeTruthy();
    expect(screen.getByLabelText('Angle snap')).toBeTruthy();
  });

  it('shows current snap values', () => {
    const snap = { grid: 0.5, angle: 45, scale: 0.05 };
    render(<ViewportWidgets {...defaultProps} snap={snap} />);

    expect(screen.getByDisplayValue('0.5 m')).toBeTruthy();
    expect(screen.getByDisplayValue('45°')).toBeTruthy();
  });

  it('calls onSnapChange when snap value changes', async () => {
    const user = userEvent.setup();
    const onSnapChange = vi.fn();

    render(<ViewportWidgets {...defaultProps} onSnapChange={onSnapChange} />);

    const gridSelect = screen.getByLabelText('Grid snap') as HTMLSelectElement;
    await user.selectOptions(gridSelect, '0.1');

    expect(onSnapChange).toHaveBeenCalledWith({ ...DEFAULT_SNAP, grid: 0.1 });
  });

  it('renders grid, axes, and dimensions toggle buttons', () => {
    render(<ViewportWidgets {...defaultProps} />);

    expect(screen.getByLabelText('Hide grid')).toBeTruthy();
    expect(screen.getByLabelText('Hide axes')).toBeTruthy();
    expect(screen.getByLabelText('Show dimensions')).toBeTruthy();
  });

  it('updates toggle button labels based on state', () => {
    const { rerender } = render(<ViewportWidgets {...defaultProps} grid={true} />);

    expect(screen.getByLabelText('Hide grid')).toBeTruthy();

    rerender(<ViewportWidgets {...defaultProps} grid={false} />);

    expect(screen.getByLabelText('Show grid')).toBeTruthy();
  });

  it('calls toggle callbacks when buttons are clicked', async () => {
    const user = userEvent.setup();
    const onGridToggle = vi.fn();
    const onAxesToggle = vi.fn();
    const onDimensionsToggle = vi.fn();

    render(
      <ViewportWidgets
        {...defaultProps}
        onGridToggle={onGridToggle}
        onAxesToggle={onAxesToggle}
        onDimensionsToggle={onDimensionsToggle}
      />,
    );

    await user.click(screen.getByLabelText('Hide grid'));
    expect(onGridToggle).toHaveBeenCalled();

    await user.click(screen.getByLabelText('Hide axes'));
    expect(onAxesToggle).toHaveBeenCalled();

    await user.click(screen.getByLabelText('Show dimensions'));
    expect(onDimensionsToggle).toHaveBeenCalled();
  });

  it('applies semi-transparent background styling', () => {
    const { container } = render(<ViewportWidgets {...defaultProps} />);

    const inner = container.querySelector('.bg-background\\/80');
    expect(inner?.classList.contains('backdrop-blur-sm')).toBe(true);
  });
});
