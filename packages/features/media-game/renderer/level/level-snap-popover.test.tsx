import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LEVEL_SNAP } from './level-snap';
import { LevelSnapPopover } from './level-snap-popover';

afterEach(cleanup);

describe('LevelSnapPopover (Phase 137 Theme F)', () => {
  it('F4 changing the angle select reports the new angle; the 3D rows are hidden in plan', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LevelSnapPopover snap={DEFAULT_LEVEL_SNAP} onChange={onChange} is3d />);
    fireEvent.click(screen.getByRole('button', { name: 'Snap settings' }));
    fireEvent.change(screen.getByLabelText('Angle snap'), { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith({ angle: 45 });
    fireEvent.click(screen.getByRole('radio', { name: '½' }));
    expect(onChange).toHaveBeenCalledWith({ planStep: 0.5 });
    expect(screen.getByRole('switch', { name: 'Snap to surfaces' })).toBeTruthy();
    rerender(<LevelSnapPopover snap={DEFAULT_LEVEL_SNAP} onChange={onChange} is3d={false} />);
    expect(screen.queryByLabelText('Angle snap')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Snap to surfaces' })).toBeNull();
  });
});
