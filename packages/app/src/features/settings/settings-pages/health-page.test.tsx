import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemHealth } from '@midnite/studio-shared';
import { HealthChecklist, HealthPage } from './health-page';

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  systemHealth: vi.fn(),
}));

vi.mock('../../../services/queries', () => ({
  openExternal: mocks.openExternal,
}));

const mockHealthData: SystemHealth = {
  git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
  shell: '/bin/zsh',
  sshAgent: { running: true, keys: 2 },
  cli: { installed: true, path: '/usr/local/bin/midnite-studio', target: '/usr/local/bin/midnite-studio', managed: true },
  homebrew: { path: '/opt/homebrew/bin/brew', version: 'Homebrew 4.4.18' },
  node: { path: '/opt/homebrew/bin/node', version: 'v22.12.0' },
  pnpm: { path: '/opt/homebrew/bin/pnpm', version: '9.15.0' },
  moon: { path: '/opt/homebrew/bin/moon', version: 'moon 2.3.4' },
};

describe('HealthChecklist', () => {
  beforeEach(() => {
    mocks.openExternal.mockReset();
    mocks.systemHealth.mockReset();
    mocks.systemHealth.mockResolvedValue(mockHealthData);

    // @ts-expect-error test bridge mock
    window.midniteStudio = {
      systemHealth: mocks.systemHealth,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders system environment and toolchain sections with parsed versions', async () => {
    render(<HealthChecklist />);

    expect(screen.getByText('Checking system health...')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('System Environment')).toBeDefined();
      expect(screen.getByText('Toolchain')).toBeDefined();
    });

    // Environment checks
    expect(screen.getByText('Git binary')).toBeDefined();
    expect(screen.getByText('Default shell')).toBeDefined();
    expect(screen.getByText('SSH Agent')).toBeDefined();
    expect(screen.getByText('midnite-studio CLI')).toBeDefined();

    // Toolchain checks
    expect(screen.getByText('Homebrew')).toBeDefined();
    expect(screen.getByText('Node.js')).toBeDefined();
    expect(screen.getByText('pnpm')).toBeDefined();
    expect(screen.getByText('moon (moonrepo)')).toBeDefined();

    // Versions
    expect(screen.getByText('v4.4.18')).toBeDefined();
    expect(screen.getByText('v22.12.0')).toBeDefined();
    expect(screen.getByText('v9.15.0')).toBeDefined();
    expect(screen.getByText('v2.3.4')).toBeDefined();
  });

  it('opens release URL when clicking a toolchain version button', async () => {
    render(<HealthChecklist />);

    await waitFor(() => {
      expect(screen.getByText('v2.3.4')).toBeDefined();
    });

    fireEvent.click(screen.getByText('v2.3.4'));
    expect(mocks.openExternal).toHaveBeenCalledWith(
      'https://github.com/moonrepo/moon/releases/tag/v2.3.4',
    );
  });

  it('renders "Not installed" link for missing toolchain tools that opens docs', async () => {
    mocks.systemHealth.mockResolvedValue({
      ...mockHealthData,
      homebrew: { path: null, version: null },
      moon: { path: null, version: null },
    });

    render(<HealthChecklist />);

    await waitFor(() => {
      expect(screen.getByText('Toolchain')).toBeDefined();
    });

    const notInstalledButtons = screen.getAllByRole('button', { name: /not installed/i });
    expect(notInstalledButtons.length).toBe(2);

    // Click Homebrew's not installed button
    fireEvent.click(screen.getByRole('button', { name: /Homebrew not installed/i }));
    expect(mocks.openExternal).toHaveBeenCalledWith('https://brew.sh');
  });
});

describe('HealthPage', () => {
  beforeEach(() => {
    mocks.systemHealth.mockResolvedValue(mockHealthData);
    // @ts-expect-error test bridge mock
    window.midniteStudio = {
      systemHealth: mocks.systemHealth,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders header and diagnostic summary', async () => {
    render(<HealthPage />);
    expect(screen.getByRole('heading', { name: /System Health & Environment/i })).toBeDefined();
    expect(
      screen.getByText(/Diagnostic checks for system utilities, shells, SSH agents, and development toolchains./i),
    ).toBeDefined();
  });
});
