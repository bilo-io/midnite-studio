import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Lu from 'react-icons/lu';
import * as Si from 'react-icons/si';

import { SETUP_CATALOGUE } from '@midnite/studio-shared';

import { installSetupBridge, wrapper } from './setup-eh-harness';
import { ToolchainPage, toolchainGroups } from './toolchain-page';

/** Phase 98 Theme H — the grouped toolchain checklist. */
const submitCommand = vi.hoisted(() => vi.fn(() => 'session-1'));
vi.mock('../../terminal/submit-command', () => ({ submitCommand }));

afterEach(() => {
  cleanup();
  submitCommand.mockClear();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('toolchainGroups', () => {
  it('groups agent CLIs, JS, containers and media in page order', () => {
    const groups = toolchainGroups();
    expect(groups.map((g) => g.group)).toEqual(['agent-cli', 'js', 'containers', 'media']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['claude', 'codex', 'gemini']);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['node', 'pnpm', 'bun', 'proto']);
    expect(groups[2]!.items.map((i) => i.id)).toEqual(['docker', 'orbstack']);
    expect(groups[3]!.items.map((i) => i.id)).toEqual(['ffmpeg', 'ripgrep', 'jq']);
  });

  it('names only real react-icons exports, with a brand colour each', () => {
    const sets: Record<string, Record<string, unknown>> = { lu: Lu, si: Si };
    for (const item of SETUP_CATALOGUE)
      expect(sets[item.icon.set]?.[item.icon.name], item.id).toBeDefined();
  });
});

describe('ToolchainPage', () => {
  it('ticks and locks installed tools, leaves missing ones unticked, and treats either container runtime as enough', async () => {
    installSetupBridge({ homebrew: 'Homebrew 4', node: 'v22.12.0', orbstack: 'Version: 1.7' });
    render(<ToolchainPage />, { wrapper: wrapper() });
    const node = (await screen.findByLabelText('Install Node.js')) as HTMLInputElement;
    await waitFor(() => expect(node.disabled).toBe(true));
    expect(node.checked).toBe(true);
    expect((screen.getByLabelText('Install pnpm') as HTMLInputElement).checked).toBe(false);
    const docker = screen.getByLabelText('Install Docker Desktop') as HTMLInputElement;
    expect(docker.checked).toBe(true);
    expect(docker.disabled).toBe(true);
  });

  it('runs one brew line for the ticked tools', async () => {
    installSetupBridge({ homebrew: 'Homebrew 4' });
    render(<ToolchainPage />, { wrapper: wrapper() });
    await waitFor(() =>
      expect((screen.getByLabelText('Install jq') as HTMLInputElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByLabelText('Install jq'));
    fireEvent.click(screen.getByLabelText('Install Docker Desktop'));
    fireEvent.click(screen.getByLabelText('Install ripgrep'));
    fireEvent.click(screen.getByRole('button', { name: 'Install selected' }));
    expect(submitCommand).toHaveBeenCalledWith(
      'brew install ripgrep jq && brew install --cask docker-desktop',
      'Toolchain install',
    );
  });
});
