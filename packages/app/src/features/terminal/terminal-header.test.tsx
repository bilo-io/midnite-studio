import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TbBoxAlignBottomFilled, TbBoxAlignRightFilled } from 'react-icons/tb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { TerminalHeader } from './terminal-header';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  actionsTarget: null as HTMLDivElement | null,
  leadingTarget: null as HTMLDivElement | null,
}));

vi.mock('@midnite/studio-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-frame')>()),
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
  agents: [],
  agentStatus: [],
  hasWorktree: true,
  onNewTerminal: vi.fn(),
  onNewAgent: vi.fn(),
};

describe('TerminalHeader', () => {
  beforeEach(() => {
    mocks.windowRole = 'main';
    mocks.actionsTarget = null;
    mocks.leadingTarget = null;
    useUiStore.setState({ terminalDock: 'bottom' });
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

  it('offers to dock right while at the bottom, and back to the bottom once on the right', () => {
    render(<TerminalHeader {...baseProps} />);

    const rightBtn = screen.getByLabelText('Dock terminal to the right');
    const expectedRightIcon = document.createElement('div');
    render(<TbBoxAlignRightFilled className="h-3.5 w-3.5" strokeWidth={2} />, {
      container: expectedRightIcon,
    });
    expect(rightBtn.querySelector('svg')?.outerHTML).toBe(
      expectedRightIcon.querySelector('svg')?.outerHTML,
    );

    fireEvent.click(rightBtn);
    expect(useUiStore.getState().terminalDock).toBe('right');

    expect(screen.queryByLabelText('Dock terminal to the right')).toBeNull();
    const bottomBtn = screen.getByLabelText('Dock terminal to the bottom');
    const expectedBottomIcon = document.createElement('div');
    render(<TbBoxAlignBottomFilled className="h-3.5 w-3.5" strokeWidth={2} />, {
      container: expectedBottomIcon,
    });
    expect(bottomBtn.querySelector('svg')?.outerHTML).toBe(
      expectedBottomIcon.querySelector('svg')?.outerHTML,
    );

    fireEvent.click(bottomBtn);
    expect(useUiStore.getState().terminalDock).toBe('bottom');
  });
});
