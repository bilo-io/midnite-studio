import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { stepInstallWatch, useInstallRunner, useSetupProbe } from './install-runner';
import { useSetupStore } from './setup-store';

/** Phase 98 Theme D — the probe hook and the brew-in-a-visible-terminal install runner. */

const submitCommand = vi.hoisted(() => vi.fn());
vi.mock('../terminal/submit-command', () => ({ submitCommand }));

beforeEach(() => {
  useSetupStore.setState({ aside: false });
  useUiStore.setState({ terminalOpen: false });
  useTerminalStore.setState({ sessions: [], foregroundCommand: {}, exitCodes: {} });
});

afterEach(() => {
  cleanup();
  submitCommand.mockReset();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('stepInstallWatch', () => {
  const at = (
    command: string | null | undefined,
    extra: Partial<{ present: boolean; exitCode: number }> = {},
  ) => ({
    present: true,
    command,
    exitCode: undefined,
    ...extra,
  });

  it('is not done at the prompt before the command has been seen running', () => {
    expect(stepInstallWatch({ sawCommand: false }, at(undefined)).done).toBe(false);
    expect(stepInstallWatch({ sawCommand: false }, at(null)).done).toBe(false);
  });

  it('is done once the shell goes from running something back to a bare prompt', () => {
    const running = stepInstallWatch({ sawCommand: false }, at('brew install git'));
    expect(running).toEqual({ watch: { sawCommand: true }, done: false });
    expect(stepInstallWatch(running.watch, at(null)).done).toBe(true);
  });

  it('is done when the shell exits or its tab closes', () => {
    expect(stepInstallWatch({ sawCommand: false }, at('brew', { exitCode: 0 })).done).toBe(true);
    expect(stepInstallWatch({ sawCommand: false }, at(null, { present: false })).done).toBe(true);
  });
});

describe('useInstallRunner', () => {
  const session = { id: 's1', kind: 'shell', title: 'Install git', cwd: '.', repoId: 'default' };

  it('runs in a visible terminal, steps the overlay aside, and reports the finish', () => {
    submitCommand.mockImplementation(() => {
      useTerminalStore.setState({ sessions: [session] as never });
      return 's1';
    });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useInstallRunner(onFinished));

    act(() => result.current.run('brew install git', 'Install git'));
    expect(submitCommand).toHaveBeenCalledWith('brew install git', 'Install git');
    expect(result.current.running).toBe(true);
    expect(useSetupStore.getState().aside).toBe(true);
    expect(useUiStore.getState().terminalOpen).toBe(true);
    expect(useTerminalStore.getState().activeId).toBe('s1');

    act(() => useTerminalStore.setState({ foregroundCommand: { s1: 'brew' } }));
    expect(onFinished).not.toHaveBeenCalled();
    act(() => useTerminalStore.setState({ foregroundCommand: { s1: null } }));
    expect(onFinished).toHaveBeenCalledOnce();
    expect(result.current.running).toBe(false);
  });

  it('does nothing for an empty command', () => {
    submitCommand.mockReturnValue(null);
    const { result } = renderHook(() => useInstallRunner(vi.fn()));
    act(() => result.current.run('', 'x'));
    expect(result.current.running).toBe(false);
    expect(useSetupStore.getState().aside).toBe(false);
  });
});

describe('useSetupProbe', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );

  it('maps probe rows by id', async () => {
    const probe = vi.fn().mockResolvedValue({
      results: [
        { id: 'git', installed: true, version: 'git version 2.45.0', path: '/usr/bin/git' },
      ],
    });
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      setup: { probe },
    };
    const { result } = renderHook(() => useSetupProbe(['git']), { wrapper });
    await waitFor(() => expect(result.current.data?.['git']?.installed).toBe(true));
    expect(probe).toHaveBeenCalledWith({ ids: ['git'] });
  });

  it('is empty without a bridge', async () => {
    const { result } = renderHook(() => useSetupProbe(['git']), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({}));
  });
});
