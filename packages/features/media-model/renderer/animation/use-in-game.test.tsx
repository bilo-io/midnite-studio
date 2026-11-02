// vitest/jsdom: the "Use in a game" section of the Animations detail pane against a fake bridge — DOM roles and text only.
import type { AnimationClip, GameSummary, MidniteStudioBridge } from '@midnite/studio-shared';
import { createFrameChrome, FrameChromeProvider, type FrameDialogs } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SAMPLE_CLIPS } from './test-clips';
import { UseInGame } from './use-in-game';

const game = (gameId: string, name: string): GameSummary => ({ gameId, name, path: `/g/${gameId}`, engine: 'three', dimension: '3d', starter: 'blank', dirty: false, valid: true, issue: null });
const clip = (over: Partial<AnimationClip> = {}): AnimationClip => ({ ...SAMPLE_CLIPS[0]!, ...over });

function setup(games: GameSummary[], importResult: unknown = { ok: true, value: { name: 'Walk', kind: 'animation', path: 'assets/animations/Walk.fbx', sha256: 'x', commit: 'abc' } }) {
  const importAsset = vi.fn(async () => importResult);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    games: { list: vi.fn(async () => ({ games })), assets: { import: importAsset } },
  } as unknown as Partial<MidniteStudioBridge>;
  const confirm = vi.fn((request: { onConfirm: () => void }) => request.onConfirm());
  const dialogs = { confirm, prompt: vi.fn(), notify: vi.fn(), setBlastRadius: vi.fn(), close: vi.fn() } as unknown as FrameDialogs;
  return { importAsset, confirm, dialogs };
}

function renderIt(dialogs: FrameDialogs, c: AnimationClip) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FrameChromeProvider chrome={createFrameChrome({ useDialogs: () => dialogs }).chrome}>
        <UseInGame clip={c} />
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('UseInGame', () => {
  it('imports the clip by library id into the game and shows where it landed', async () => {
    const { importAsset, confirm, dialogs } = setup([game('g1', 'Dungeon')]);
    renderIt(dialogs, clip({ licence: 'cc0' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use in this game' }));
    await waitFor(() => expect(importAsset).toHaveBeenCalledWith({ gameId: 'g1', source: { animationId: SAMPLE_CLIPS[0]!.id } }));
    expect((await screen.findByRole('status')).textContent).toContain('Imported to assets/animations/Walk.fbx');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('names the licence in a confirm when it requires attribution, and does not import on cancel', async () => {
    const { importAsset, confirm, dialogs } = setup([game('g1', 'Dungeon')]);
    confirm.mockImplementation(() => undefined);
    renderIt(dialogs, clip({ licence: 'cc-by', author: 'Ada' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use in this game' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toMatchObject({ body: expect.stringContaining('crediting Ada') });
    expect(importAsset).not.toHaveBeenCalled();
  });

  it('says so when the game already holds the clip', async () => {
    const { dialogs } = setup([game('g1', 'Dungeon')], { ok: true, value: { name: 'Walk', kind: 'animation', path: 'assets/animations/Walk.fbx', sha256: 'x', commit: null } });
    renderIt(dialogs, clip({ licence: 'cc0' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use in this game' }));
    expect((await screen.findByRole('status')).textContent).toContain('Already in the game at');
  });

  it('points at Media ▸ Games when there are none', async () => {
    const { dialogs } = setup([]);
    renderIt(dialogs, clip());
    expect(await screen.findByText(/No games yet/)).toBeTruthy();
  });

  it('renders nothing where the app has no games bridge', () => {
    const { dialogs } = setup([]);
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {};
    const { container } = renderIt(dialogs, clip());
    expect(container.textContent).toBe('');
  });
});
