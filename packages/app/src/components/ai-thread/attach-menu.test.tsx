import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LuImport } from 'react-icons/lu';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttachMenu } from './attach-menu';

/** vitest/jsdom: the composer's "+" drop-up — open, pick, close. */

afterEach(cleanup);

describe('AttachMenu', () => {
  it('opens on "+", runs the picked option and closes', () => {
    const onSelect = vi.fn();
    render(<AttachMenu options={[{ id: 'import', label: 'Import audio…', icon: LuImport, onSelect }]} />);
    expect(screen.queryByRole('menuitem', { name: 'Import audio…' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import audio…' }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menuitem', { name: 'Import audio…' })).toBeNull();
  });

  it('shows a disabled option with its reason and does not run it', () => {
    const onSelect = vi.fn();
    render(
      <AttachMenu
        options={[{ id: 'import', label: 'Import audio…', icon: LuImport, onSelect, disabled: true, reason: 'Add a title first.' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    const item = screen.getByRole('menuitem', { name: 'Import audio…' }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe('Add a title first.');
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
