import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminalHeader } from './terminal-header';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  portalTarget: null as HTMLDivElement | null,
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ windowRole: mocks.windowRole }),
}));

vi.mock('../../components/detached-window-frame', () => ({
  usePopoutHeaderActions: () => mocks.portalTarget,
}));

const baseProps = {
  path: '/Users/you/Dev/midnite-studio',
  state: 'open' as const,
  agent: undefined,
  repos: [],
  listable: false,
  showList: false,
  maximized: false,
  onNewMenu: vi.fn(),
};

describe('TerminalHeader', () => {
  beforeEach(() => {
    mocks.windowRole = 'main';
    mocks.portalTarget = null;
  });

  afterEach(cleanup);

  it('renders the full docked row, including the hover-to-detach mark', () => {
    render(<TerminalHeader {...baseProps} />);

    expect(document.querySelector('[data-terminal-header]')).not.toBeNull();
    expect(screen.getByLabelText('Detach Terminal into its own window')).toBeDefined();
    expect(screen.getByLabelText('Show session list')).toBeDefined();
  });

  it('portals into the title bar action slot once popped out with a merged frame, dropping the mark', () => {
    mocks.windowRole = 'terminal';
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    mocks.portalTarget = portal;

    render(<TerminalHeader {...baseProps} />);

    // Nothing rendered at the header's usual spot — this row does not exist
    // here any more, not even collapsed.
    expect(document.querySelector('[data-terminal-header]')).toBeNull();
    expect(screen.queryByLabelText('Detach Terminal into its own window')).toBeNull();
    // Everything else the row used to show landed in the portal target
    // instead — the bar's own `right` slot (`DetachedWindowFrame`).
    expect(portal.querySelector('[aria-label="Show session list"]')).not.toBeNull();
    expect(portal.querySelector('[aria-label="New terminal or agent"]')).not.toBeNull();

    portal.remove();
  });

  it('falls back to the full row when popped out but no merged frame exists', () => {
    mocks.windowRole = 'terminal';
    mocks.portalTarget = null;

    render(<TerminalHeader {...baseProps} />);

    expect(document.querySelector('[data-terminal-header]')).not.toBeNull();
    // Detaching an already-detached window makes no sense — same guard as before.
    expect(screen.queryByLabelText('Detach Terminal into its own window')).toBeNull();
    expect(screen.getByLabelText('Show session list')).toBeDefined();
  });
});
