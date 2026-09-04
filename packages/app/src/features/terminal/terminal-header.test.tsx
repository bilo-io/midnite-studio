import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminalHeader } from './terminal-header';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  actionsTarget: null as HTMLDivElement | null,
  leadingTarget: null as HTMLDivElement | null,
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ windowRole: mocks.windowRole }),
}));

vi.mock('../../components/detached-window-frame', () => ({
  usePopoutHeaderActions: () => mocks.actionsTarget,
  usePopoutHeaderLeading: () => mocks.leadingTarget,
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
    mocks.actionsTarget = null;
    mocks.leadingTarget = null;
  });

  afterEach(cleanup);

  it('renders the full docked row, including the hover-to-detach mark', () => {
    render(<TerminalHeader {...baseProps} />);

    expect(document.querySelector('[data-terminal-header]')).not.toBeNull();
    expect(screen.getByLabelText('Detach Terminal into its own window')).toBeDefined();
    expect(screen.getByLabelText('Show session list')).toBeDefined();
  });

  it('portals buttons to actions and dot/path to leading slot once popped out with a merged frame', () => {
    mocks.windowRole = 'terminal';
    const actionsPortal = document.createElement('div');
    const leadingPortal = document.createElement('div');
    document.body.appendChild(actionsPortal);
    document.body.appendChild(leadingPortal);
    mocks.actionsTarget = actionsPortal;
    mocks.leadingTarget = leadingPortal;

    render(<TerminalHeader {...baseProps} />);

    // Nothing rendered at the header's usual spot — this row does not exist
    // here any more, not even collapsed.
    expect(document.querySelector('[data-terminal-header]')).toBeNull();
    expect(screen.queryByLabelText('Detach Terminal into its own window')).toBeNull();
    // Buttons landed in the action slot on the right
    expect(actionsPortal.querySelector('[aria-label="Show session list"]')).not.toBeNull();
    expect(actionsPortal.querySelector('[aria-label="New terminal or agent"]')).not.toBeNull();
    // Dot and path landed in the leading slot on the left
    expect(leadingPortal.querySelector('[title="/Users/you/Dev/midnite-studio"]')).not.toBeNull();

    actionsPortal.remove();
    leadingPortal.remove();
  });

  it('falls back to the full row when popped out but no merged frame exists', () => {
    mocks.windowRole = 'terminal';
    mocks.actionsTarget = null;
    mocks.leadingTarget = null;

    render(<TerminalHeader {...baseProps} />);

    expect(document.querySelector('[data-terminal-header]')).not.toBeNull();
    // Detaching an already-detached window makes no sense — same guard as before.
    expect(screen.queryByLabelText('Detach Terminal into its own window')).toBeNull();
    expect(screen.getByLabelText('Show session list')).toBeDefined();
  });
});
