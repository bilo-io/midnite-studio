import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsSwitchRow } from './settings-switch-row';

afterEach(cleanup);

describe('SettingsSwitchRow', () => {
  it('renders one focusable switch with the label as its accessible name', () => {
    render(
      <SettingsSwitchRow
        id="demo"
        label="Enable demo"
        description="Turns the demo on."
        on={false}
        onToggle={vi.fn()}
      />,
    );

    const row = screen.getByRole('switch', { name: 'Enable demo' });
    expect(row.tagName).toBe('INPUT');
    expect((row as HTMLInputElement).checked).toBe(false);
    // Description text is visible but not folded into the accessible name.
    expect(screen.getByText('Turns the demo on.')).toBeTruthy();
  });

  it('a click on the row toggles exactly once', () => {
    const onToggle = vi.fn();
    render(<SettingsSwitchRow id="demo" label="Enable demo" on={false} onToggle={onToggle} />);

    // Clicking the label text (not the switch itself) exercises the
    // whole-row hit target — the transparent input is stretched over it.
    fireEvent.click(screen.getByText('Enable demo'));

    expect(onToggle).toHaveBeenCalledExactlyOnceWith('demo', true);
  });

  it('a click on the switch toggles exactly once', () => {
    const onToggle = vi.fn();
    render(<SettingsSwitchRow id="demo" label="Enable demo" on={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable demo' }));

    expect(onToggle).toHaveBeenCalledExactlyOnceWith('demo', false);
  });

  it('Enter toggles the switch, matching Space', () => {
    const onToggle = vi.fn();
    render(<SettingsSwitchRow id="demo" label="Enable demo" on={false} onToggle={onToggle} />);

    fireEvent.keyDown(screen.getByRole('switch', { name: 'Enable demo' }), {
      key: 'Enter',
      code: 'Enter',
    });

    expect(onToggle).toHaveBeenCalledExactlyOnceWith('demo', true);
  });

  it('reads the label at full opacity when on and dims it when off', () => {
    const { rerender } = render(
      <SettingsSwitchRow id="demo" label="Enable demo" on={true} onToggle={vi.fn()} />,
    );
    const onLabelWrap = screen.getByText('Enable demo').parentElement?.parentElement;
    expect(onLabelWrap?.className).toContain('text-foreground');

    rerender(<SettingsSwitchRow id="demo" label="Enable demo" on={false} onToggle={vi.fn()} />);
    const offLabelWrap = screen.getByText('Enable demo').parentElement?.parentElement;
    expect(offLabelWrap?.className).toContain('text-muted-foreground');
  });

  it('a disabled row is dimmed, not clickable, and carries its reason as a tooltip', () => {
    const onToggle = vi.fn();
    render(
      <SettingsSwitchRow
        id="demo"
        label="Enable demo"
        on={false}
        onToggle={onToggle}
        disabled
        title="Turn on the master switch first."
      />,
    );

    const row = screen.getByRole('switch', { name: 'Enable demo' });
    expect((row as HTMLInputElement).disabled).toBe(true);
    expect(row.closest('label')?.className).toContain('cursor-not-allowed');
    expect(row.closest('label')?.className).toContain('opacity-50');
    expect(row.closest('label')?.getAttribute('title')).toBe('Turn on the master switch first.');

    fireEvent.click(row);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
