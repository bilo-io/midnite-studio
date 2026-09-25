import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemHealth } from '@midnite/studio-shared';
import { HealthChecklist, HealthPage } from './health-page';

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  systemHealth: vi.fn(),
  setTerminalOpen: vi.fn(),
  openSession: vi.fn(() => ({ id: 'session-1' })),
  queueInput: vi.fn(),
  cliInstall: vi.fn(),
}));

vi.mock('../../../services/queries', () => ({
  openExternal: mocks.openExternal,
}));

vi.mock('../../../store/ui-store', () => ({
  useUiStore: {
    getState: () => ({
      setTerminalOpen: mocks.setTerminalOpen,
      selectedWorktreePath: '.',
      selectedRepoId: 'default',
    }),
  },
}));

vi.mock('../../terminal/terminal-store', () => ({
  useTerminalStore: {
    getState: () => ({
      openSession: mocks.openSession,
      queueInput: mocks.queueInput,
    }),
  },
}));

const mockHealthData: SystemHealth = {
  git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
  shell: '/bin/zsh',
  sshAgent: { running: true, keys: 2, version: 'OpenSSH 9.6p1' },
  cli: { installed: true, path: '/usr/local/bin/midnite-studio', target: '/usr/local/bin/midnite-studio', managed: true, version: '0.1.0' },
  homebrew: { path: '/opt/homebrew/bin/brew', version: 'Homebrew 4.4.18' },
  node: { path: '/opt/homebrew/bin/node', version: 'v22.12.0' },
  pnpm: { path: '/opt/homebrew/bin/pnpm', version: '9.15.0' },
  moon: { path: '/opt/homebrew/bin/moon', version: 'moon 2.3.4' },
};

describe('HealthChecklist', () => {
  beforeEach(() => {
    mocks.openExternal.mockReset();
    mocks.systemHealth.mockReset();
    mocks.setTerminalOpen.mockReset();
    mocks.openSession.mockReset().mockReturnValue({ id: 'session-1' });
    mocks.queueInput.mockReset();
    mocks.cliInstall.mockReset().mockResolvedValue({ ok: true });
    mocks.systemHealth.mockResolvedValue(mockHealthData);

    window.midniteStudio = {
      systemHealth: mocks.systemHealth,
      cli: {
        install: mocks.cliInstall,
      },
    } as unknown as typeof window.midniteStudio;
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

    // Homebrew, moon, and Ollama (absent from `mockHealthData` entirely, so
    // every case is effectively "not installed") each render one.
    const notInstalledButtons = screen.getAllByRole('button', { name: /not installed/i });
    expect(notInstalledButtons.length).toBe(3);

    // Click Homebrew's not installed button
    fireEvent.click(screen.getByRole('button', { name: /Homebrew not installed/i }));
    expect(mocks.openExternal).toHaveBeenCalledWith('https://brew.sh');
  });

  it('renders CLI and SSH Agent version strings when available', async () => {
    render(<HealthChecklist />);

    await waitFor(() => {
      expect(screen.getByText('0.1.0')).toBeDefined();
      expect(screen.getByText('OpenSSH 9.6p1')).toBeDefined();
    });
  });

  it('offers Update when CLI is installed and triggers installation on click', async () => {
    render(<HealthChecklist />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update cli/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /update cli/i }));
    expect(mocks.cliInstall).toHaveBeenCalledWith({ target: 'auto' });
    await waitFor(() => {
      expect(mocks.systemHealth).toHaveBeenCalledTimes(2);
    });
  });

  it('offers Install when CLI is not installed and triggers installation on click', async () => {
    mocks.systemHealth.mockResolvedValue({
      ...mockHealthData,
      cli: { installed: false, path: null, target: null, managed: false, version: null },
    });

    render(<HealthChecklist />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install cli/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /install cli/i }));
    expect(mocks.cliInstall).toHaveBeenCalledWith({ target: 'auto' });
    await waitFor(() => {
      expect(mocks.systemHealth).toHaveBeenCalledTimes(2);
    });
  });

  it('offers Add Key when SSH agent is running and triggers ssh-add on click', async () => {
    render(<HealthChecklist />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Key' })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Key' }));
    expect(mocks.setTerminalOpen).toHaveBeenCalledWith(true);
    expect(mocks.openSession).toHaveBeenCalledWith(expect.objectContaining({ title: 'SSH Key Add' }));
    expect(mocks.queueInput).toHaveBeenCalledWith('session-1', 'ssh-add\r');
  });

  it('offers Start Agent when SSH agent is not running and triggers start on click', async () => {
    mocks.systemHealth.mockResolvedValue({
      ...mockHealthData,
      sshAgent: { running: false, keys: 0, version: 'OpenSSH 9.6p1' },
    });

    render(<HealthChecklist />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start Agent/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start Agent/i }));
    expect(mocks.setTerminalOpen).toHaveBeenCalledWith(true);
    expect(mocks.openSession).toHaveBeenCalledWith(expect.objectContaining({ title: 'SSH Agent' }));
    expect(mocks.queueInput).toHaveBeenCalledWith('session-1', 'eval "$(ssh-agent -s)"\r');
  });
});

describe('OllamaRow', () => {
  beforeEach(() => {
    mocks.openExternal.mockReset();
    mocks.systemHealth.mockReset();
    mocks.setTerminalOpen.mockReset();
    mocks.openSession.mockReset().mockReturnValue({ id: 'session-1' });
    mocks.queueInput.mockReset();
    // @ts-expect-error test bridge mock
    window.midniteStudio = { systemHealth: mocks.systemHealth };
  });

  afterEach(() => {
    cleanup();
  });

  it('offers Install when the binary is absent', async () => {
    mocks.systemHealth.mockResolvedValue(mockHealthData); // no `ollama`/`ollamaDaemon`
    render(<HealthChecklist />);
    await waitFor(() => expect(screen.getByText('Ollama')).toBeDefined());

    expect(screen.getByRole('button', { name: /Ollama not installed/i })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(mocks.setTerminalOpen).toHaveBeenCalledWith(true);
    expect(mocks.openSession).toHaveBeenCalled();
    expect(mocks.queueInput).toHaveBeenCalledWith('session-1', 'brew install --cask ollama-app\r');
  });

  it('offers Start Ollama when installed but the daemon is unreachable', async () => {
    mocks.systemHealth.mockResolvedValue({
      ...mockHealthData,
      ollama: { path: '/opt/homebrew/bin/ollama', version: 'ollama version is 0.4.2' },
      ollamaDaemon: { reachable: false, version: null, host: 'http://127.0.0.1:11434' },
    });
    render(<HealthChecklist />);
    await waitFor(() => expect(screen.getByText('Ollama')).toBeDefined());

    expect(screen.getByText('Daemon not reachable')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Start Ollama/i }));
    expect(mocks.queueInput).toHaveBeenCalledWith('session-1', 'ollama serve &\r');
  });

  it('uses `open -a Ollama` when the binary resolved through the app bundle', async () => {
    mocks.systemHealth.mockResolvedValue({
      ...mockHealthData,
      ollama: {
        path: '/Applications/Ollama.app/Contents/Resources/ollama',
        version: 'ollama version is 0.4.2',
      },
      ollamaDaemon: { reachable: false, version: null, host: 'http://127.0.0.1:11434' },
    });
    render(<HealthChecklist />);
    await waitFor(() => expect(screen.getByText('Ollama')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Start Ollama/i }));
    expect(mocks.queueInput).toHaveBeenCalledWith('session-1', 'open -a Ollama\r');
  });

  it('shows the reachable daemon and offers Update, not Start, once running', async () => {
    mocks.systemHealth.mockResolvedValue({
      ...mockHealthData,
      ollama: { path: '/opt/homebrew/bin/ollama', version: 'ollama version is 0.4.2' },
      ollamaDaemon: { reachable: true, version: '0.4.2', host: 'http://127.0.0.1:11434' },
    });
    render(<HealthChecklist />);
    await waitFor(() => expect(screen.getByText(/Daemon reachable/)).toBeDefined());

    expect(screen.queryByRole('button', { name: /Start Ollama/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(mocks.queueInput).toHaveBeenCalledWith('session-1', 'brew upgrade --cask ollama-app\r');
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
