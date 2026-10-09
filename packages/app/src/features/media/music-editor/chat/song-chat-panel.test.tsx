import { SongSchema } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../../test-support/fixtures';
import { renderView } from '../../../../../test-support/render';
import { useUiStore } from '../../../../store/ui-store';
import { MediaView } from '../../media-view';

// Tone.js needs a real AudioContext; the engine has its own tests.
vi.mock('../engine/use-music-engine', () => ({ useMusicEngine: () => ({ engine: null, state: 'stopped' }) }));

/**
 * Phase 101 Theme I — the song chat in the Editor. The composer, thread and picker are the Chats
 * page's; this covers the wiring: per-song persistence, Stop beside Send, "Pass n of N", and the
 * change-summary link selecting notes in the piano roll. DOM roles only, so vitest/jsdom.
 */
const BAR = 1920;
const demo = {
  name: 'Demo',
  tracks: [{ id: 'bass', name: 'Bass', program: 33, notes: [{ pitch: 40, startTick: 0, durationTicks: 480, velocity: 90 }] }],
};
type Emit = { changed: (e: unknown) => void; progress: (e: unknown) => void };
const emit = () => (globalThis as unknown as { __mockMusicEmit: Emit }).__mockMusicEmit;
const g = globalThis as unknown as { __mockMusicRun?: (req: { runId: string }) => Promise<unknown>; __mockMusicCancel?: (id: string) => void };

const files = (extra: Record<string, string> = {}) => ({
  ...fixtures,
  media: { files: { 'audio:album': { 'Demo.mid': 'mid', 'Demo.song.json': JSON.stringify(demo), ...extra } } },
});
const open = async (extra: Record<string, string> = {}) => {
  useUiStore.setState({ mediaTab: 'audio', mediaPaneCollapsed: {}, activeView: 'media', audioTabByRepo: { 'repo-1': 'editor' } });
  renderView(<MediaView />, { fixtures: files(extra), uiState: { selectedRepoId: 'repo-1' } });
  // The editor chunk loads lazily; give the first render room.
  await screen.findByTestId('song-chat', undefined, { timeout: 15_000 });
};
const send = async (text: string) => {
  fireEvent.change(screen.getByLabelText("Message the song's agent"), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

beforeEach(() => useUiStore.setState({ audioTabByRepo: {} }));
afterEach(() => {
  cleanup();
  delete g.__mockMusicRun;
  delete g.__mockMusicCancel;
});

describe('Song chat', () => {
  it('shows the engine picker with how the engine writes, and starts empty', async () => {
    await open();
    expect(screen.getByTestId('song-chat-empty')).toBeTruthy();
    expect(screen.getByTestId('song-chat-engine-picker')).toBeTruthy();
    expect(screen.getByTestId('song-chat-mode').textContent).toMatch(/Refines over up to 8 passes|one pass/);
  });

  it('loads the thread stored beside the song', async () => {
    const stored = { version: 1, engine: null, model: null, messages: [{ id: 'u1', role: 'user', text: 'make it sadder', at: 1 }] };
    await open({ 'Demo.chat.json': JSON.stringify(stored) });
    expect(await screen.findByText('make it sadder')).toBeTruthy();
    expect(screen.queryByTestId('song-chat-empty')).toBeNull();
  });

  it('shows Pass n of N and the latest action, with Stop directly left of Send, then summarises the change', async () => {
    let finish: (v: unknown) => void = () => undefined;
    let runId = '';
    g.__mockMusicRun = (req) => {
      runId = req.runId;
      return new Promise((resolve) => (finish = resolve));
    };
    await open();
    await send('add a walking bass on bars 5 to 6');
    await screen.findByTestId('song-chat-progress');

    act(() => emit().progress({ runId, mode: 'iterative', state: 'running', pass: { n: 1, max: 8 }, action: 'Added 2 notes' }));
    expect(screen.getByTestId('song-chat-progress').textContent).toContain('Pass 2 of 8');
    expect(screen.getByTestId('song-chat-action').textContent).toBe('Added 2 notes');

    // Stop is the button immediately before Send, in the same group.
    const stop = screen.getByTestId('song-chat-composer-stop');
    const sendButton = screen.getByTestId('song-chat-composer-send');
    const kids = Array.from(stop.parentElement!.children);
    expect(stop.parentElement).toBe(sendButton.parentElement);
    expect(kids.indexOf(sendButton) - kids.indexOf(stop)).toBe(1);
    expect(sendButton.getAttribute('aria-disabled')).toBe('true');

    const edited = SongSchema.parse({
      ...demo,
      tracks: [{ ...demo.tracks[0], notes: [...demo.tracks[0]!.notes, { pitch: 43, startTick: BAR * 4, durationTicks: 480, velocity: 90 }, { pitch: 45, startTick: BAR * 5, durationTicks: 480, velocity: 90 }] }],
    });
    act(() => emit().changed({ repoId: 'repo-1', project: 'album', name: 'Demo', song: edited, summary: 'x', saved: true }));
    await act(async () => finish({ ok: true, value: { mode: 'iterative', edits: 1, passes: 2, saved: true, summary: 'Added a walking bass.' } }));

    await waitFor(() => expect(screen.queryByTestId('song-chat-progress')).toBeNull());
    expect(screen.queryByTestId('song-chat-composer-stop')).toBeNull();
    const reply = await screen.findByTestId('chat-message-assistant');
    expect(reply.textContent).toContain('Added a walking bass.');
    expect(reply.textContent).toContain('Bass');
    expect(reply.textContent).toContain('bars 5–6');

    // The link selects exactly the two new notes in the piano roll.
    const link = await screen.findByTestId('song-chat-show');
    expect(link.textContent).toContain('bars 5–6');
    expect(screen.getByTestId('piano-roll').getAttribute('data-selected-count')).toBe('0');
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId('piano-roll').getAttribute('data-selected-count')).toBe('2'));
  });

  it('Stop cancels the run and the thread records it', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const cancelled: string[] = [];
    g.__mockMusicRun = () => new Promise((resolve) => (finish = resolve));
    g.__mockMusicCancel = (id) => {
      cancelled.push(id);
      finish({ ok: false, kind: 'error', message: 'cancelled' });
    };
    await open();
    await send('rewrite the drums');
    fireEvent.click(await screen.findByTestId('song-chat-composer-stop'));
    await waitFor(() => expect(cancelled).toHaveLength(1));
    expect(await screen.findByTestId('chat-stopped')).toBeTruthy();
  });

  it('shows a failed turn as an error and keeps the thread', async () => {
    g.__mockMusicRun = async () => ({ ok: false, kind: 'error', message: 'Claude is not installed.' });
    await open();
    await send('add strings');
    expect((await screen.findByTestId('chat-error')).textContent).toContain('Claude is not installed.');
    expect(screen.getByText('add strings')).toBeTruthy();
  });

  it('persists the thread beside the song', async () => {
    g.__mockMusicRun = async () => ({ ok: true, value: { mode: 'single-pass', edits: 1, passes: 1, saved: true, summary: 'Wrote' } });
    await open();
    await send('hello song');
    await screen.findByTestId('chat-message-assistant');
    const bridge = (window as unknown as { midniteStudio: { media: { music: { chat: { read: (r: unknown) => Promise<{ ok: true; value: { messages: Array<{ role: string }> } }> } } } } }).midniteStudio;
    await waitFor(async () => {
      const res = await bridge.media.music.chat.read({ repoId: 'repo-1', project: 'album', name: 'Demo' });
      expect(res.value.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    });
  });
});
