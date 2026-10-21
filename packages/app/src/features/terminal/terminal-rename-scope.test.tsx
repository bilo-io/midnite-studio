import type { TerminalSession } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { TerminalSessionList } from './terminal-session-list';
import { useTerminalStore } from './terminal-store';

afterEach(() => {
  cleanup();
  useTerminalStore.setState({ sessions: [], states: {}, legacy: {} });
});

const session = (id: string): TerminalSession => ({
  id,
  kind: 'shell',
  title: 'repo',
  cwd: '/repo',
  repoId: 'repo:1',
  createdAt: 0,
});

describe('terminal Rename session prompt is scoped to the terminal panel', () => {
  it('renders inside [data-terminal-panel], and Enter / Escape behave', () => {
    useTerminalStore.setState({
      sessions: [session('s-1'), session('s-2')],
      states: { 's-1': 'open', 's-2': 'open' },
      legacy: {},
    });
    const { container } = render(
      <DialogHost>
        <div data-terminal-panel className="relative">
          <TerminalSessionList agents={[]} width={220} />
        </div>
      </DialogHost>,
    );
    const panel = container.querySelector('[data-terminal-panel]') as HTMLElement;

    const open = () => {
      const row = container.querySelector('[data-session-row]');
      expect(row).not.toBeNull();
      fireEvent.contextMenu(row as Element);
      fireEvent.click(screen.getByText('Rename session…'));
    };

    open();
    const dialog = screen.getByRole('dialog', { name: 'Rename session' });
    expect(panel.contains(dialog)).toBe(true);
    expect(dialog.className).toContain('absolute');
    expect(dialog.className).not.toContain('fixed');

    // Focus lands in the input, so xterm (not focused) gets no keystrokes.
    const input = screen.getByLabelText('Session name') as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    const again = screen.getByLabelText('Session name') as HTMLInputElement;
    fireEvent.change(again, { target: { value: 'build box' } });
    fireEvent.submit(again.closest('form') as HTMLFormElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTerminalStore.getState().sessions.some((s) => s.name === 'build box')).toBe(true);
  });
});
