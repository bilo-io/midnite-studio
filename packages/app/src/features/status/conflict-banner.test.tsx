import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, StatusResult } from '@midnite/studio-shared';

import { ToastHost } from '../../components/toast-host';
import { useUiStore } from '../../store/ui-store';
import { ConflictBanner } from './conflict-banner';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
  );
}

function statusWith(entries: StatusResult['entries']): StatusResult {
  return {
    branch: { head: 'main', oid: 'a'.repeat(40), upstream: null, ahead: 0, behind: 0, unborn: false, detached: false },
    entries,
    inProgress: 'merge',
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({ selectedRepoId: null, selectedWorktreePath: undefined });
});

describe('ConflictBanner — opening the Studio (Phase 47 Theme D)', () => {
  it('renders each conflicted path as a plain entry when no handler is given', () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      ops: new Proxy({}, { get: () => vi.fn().mockResolvedValue({ ok: true }) }) as unknown as MidniteStudioBridge['ops'],
    };

    render(
      <ConflictBanner status={statusWith([{ path: 'f.txt', conflicted: true } as never])} onError={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByText('f.txt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'f.txt' })).toBeNull();
  });

  it('renders a conflicted path as a clickable button that calls onOpenConflict with its path', () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      ops: new Proxy({}, { get: () => vi.fn().mockResolvedValue({ ok: true }) }) as unknown as MidniteStudioBridge['ops'],
    };
    const onOpenConflict = vi.fn();

    render(
      <ConflictBanner
        status={statusWith([{ path: 'src/f.txt', conflicted: true } as never])}
        onError={vi.fn()}
        onOpenConflict={onOpenConflict}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: 'src/f.txt' }));

    expect(onOpenConflict).toHaveBeenCalledWith('src/f.txt');
  });

  it('never renders a clickable entry for a path that is not conflicted', () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      ops: new Proxy({}, { get: () => vi.fn().mockResolvedValue({ ok: true }) }) as unknown as MidniteStudioBridge['ops'],
    };

    render(
      <ConflictBanner
        status={statusWith([{ path: 'clean.txt', conflicted: false } as never])}
        onError={vi.fn()}
        onOpenConflict={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.queryByText('clean.txt')).toBeNull();
    expect(screen.getByText('conflicts resolved — ready to continue')).toBeTruthy();
  });
});
