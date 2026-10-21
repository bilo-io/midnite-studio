// vitest/jsdom: DOM text, roles and calls over a mock bridge — no real screen, stream or clipboard.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import {
  CAPTURE_DEFAULT_SETTINGS,
  type CaptureChanged,
  type CaptureItem,
  type CapturePermission,
  type CaptureStatus,
  type ClipboardEntry,
} from '@midnite/studio-shared';

import { CapturePage } from './capture-page';
import { CaptureHostProvider, type CaptureHost } from './host';
import { rectFromPoints } from './region-picker';
import type { RecorderMedia } from './recorder';
import { PR_COMMENT_PASTE_NOTE } from './send-to';
import { selectCapture } from './use-capture';

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

const shot: CaptureItem = {
  id: 'cap-20261018-093000-abcdef12',
  kind: 'screenshot',
  mode: 'screen',
  mime: 'image/png',
  fileName: 'cap-20261018-093000-abcdef12.png',
  createdAt: 1,
  bytes: 2048,
  width: 3024,
  height: 1964,
  sourceName: 'Built-in Display',
};
const clip: CaptureItem = {
  ...shot,
  id: 'cap-20261018-093100-abcdef13',
  kind: 'recording',
  mime: 'video/webm',
  fileName: 'cap-20261018-093100-abcdef13.webm',
  durationMs: 4000,
};

const frame = {
  pendingId: 'pend-abcdef',
  preview: 'data:image/jpeg;base64,AA==',
  width: 2000,
  height: 1000,
  sourceName: 'Studio Display',
};

function mount(
  opts: {
    permission?: CapturePermission;
    destinations?: CaptureStatus['destinations'];
    host?: Partial<CaptureHost>;
    captures?: CaptureItem[];
    regionSurface?: 'overlay' | 'in-view';
    clipboard?: ClipboardEntry[];
  } = {},
) {
  let listener: ((e: CaptureChanged) => void) | null = null;
  let status: CaptureStatus = {
    permission: opts.permission ?? 'granted',
    settings: { ...CAPTURE_DEFAULT_SETTINGS },
    shortcut: { accelerator: null, state: 'off' },
    canRecord: true,
    destinations: opts.destinations ?? [],
  };
  const captures = [...(opts.captures ?? [])];
  const capture = {
    status: vi.fn(async () => status),
    requestPermission: vi.fn(async () => ({ permission: 'granted' as const })),
    openPermissionSettings: vi.fn(async () => ({ ok: true })),
    sources: vi.fn(async ({ kind }: { kind: 'screen' | 'window' }) => ({
      ok: true,
      value: {
        permission: status.permission,
        sources:
          kind === 'screen'
            ? [{ id: 'screen:1:0', kind, name: 'Built-in Display', thumbnail: null }]
            : [{ id: 'window:42:0', kind, name: 'Terminal', thumbnail: null }],
      },
    })),
    still: vi.fn(async () => {
      captures.unshift(shot);
      return { ok: true, value: shot };
    }),
    regionBegin: vi.fn(async () => ({ ok: true, value: frame })),
    regionStart: vi.fn(async () => ({
      ok: true,
      value:
        opts.regionSurface === 'overlay'
          ? { surface: 'overlay' as const }
          : { surface: 'in-view' as const, frame },
    })),
    openInStudio: vi.fn(async () => ({ ok: true })),
    importFromApp: vi.fn(async () => ({ ok: true, value: shot })),
    regionPending: vi.fn(async () => ({ frame: null })),
    regionFinish: vi.fn(async () => ({ ok: true, value: { ...shot, mode: 'region' } })),
    regionCancel: vi.fn(async () => ({ ok: true })),
    recordingArm: vi.fn(async () => ({ ok: true })),
    recordingBegin: vi.fn(async () => ({ ok: true, value: { recordingId: 'rec-abcdef' } })),
    recordingChunk: vi.fn(async () => ({ ok: true })),
    recordingFinish: vi.fn(async () => ({ ok: true, value: clip })),
    recordingAbort: vi.fn(async () => ({ ok: true })),
    list: vi.fn(async () => ({ captures })),
    remove: vi.fn(async () => ({ ok: true })),
    reveal: vi.fn(async () => ({ ok: true })),
    copy: vi.fn(async () => ({ ok: true })),
    setSettings: vi.fn(async (patch: Partial<CaptureStatus['settings']>) => {
      status = { ...status, settings: { ...status.settings, ...patch } };
      return { ok: true, value: status };
    }),
    clipboard: {
      list: vi.fn(async () => ({
        enabled: status.settings.clipboardHistory,
        entries: opts.clipboard ?? [],
      })),
      copy: vi.fn(async () => ({ ok: true })),
      remove: vi.fn(async () => ({ ok: true })),
      clear: vi.fn(async () => ({ ok: true })),
    },
    attachment: vi.fn(async () => ({
      ok: true,
      value: { name: shot.fileName, text: 'Screenshot saved at /tmp/x.png' },
    })),
    sendToCreator: vi.fn(async () => ({
      ok: true,
      value: { project: 'Captures', path: shot.fileName },
    })),
    onChanged: vi.fn((handler: (e: CaptureChanged) => void) => {
      listener = handler;
      return () => {
        listener = null;
      };
    }),
  };
  window.midniteStudio = { capture } as unknown as typeof window.midniteStudio;
  const kit = createFrameChrome();
  const tree = <CapturePage media={fakeMedia()} />;
  render(
    <FrameChromeProvider chrome={kit.chrome}>
      {opts.host ? (
        <CaptureHostProvider
          host={{ sendToChat: null, creator: null, prComment: null, ...opts.host }}
        >
          {tree}
        </CaptureHostProvider>
      ) : (
        tree
      )}
      <kit.DialogHost />
    </FrameChromeProvider>,
  );
  return { capture, emit: (e: CaptureChanged) => act(() => listener?.(e)) };
}

function fakeMedia(): RecorderMedia {
  return {
    getDisplayMedia: async () => {
      const track = Object.assign(new EventTarget(), { stop: vi.fn() });
      return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    },
    createRecorder: () => {
      const target = new EventTarget();
      const recorder = Object.assign(target, {
        state: 'inactive' as RecordingState,
        ondataavailable: null as ((e: BlobEvent) => void) | null,
        start: () => {
          recorder.state = 'recording';
        },
        stop: () => {
          recorder.state = 'inactive';
          queueMicrotask(() => {
            const bytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0]);
            recorder.ondataavailable?.({
              data: { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer },
            } as unknown as BlobEvent);
            target.dispatchEvent(new Event('stop'));
          });
        },
      });
      return recorder as unknown as MediaRecorder;
    },
    isTypeSupported: (mime) => mime === 'video/webm;codecs=vp9',
    now: (() => {
      let t = 0;
      return () => (t += 1000);
    })(),
  };
}

describe('CapturePage', () => {
  it('captures nothing on mount — not even source thumbnails', async () => {
    const { capture } = mount();
    expect(await screen.findByText('Pick what to capture.')).toBeTruthy();
    expect(capture.sources).not.toHaveBeenCalled();
    expect(capture.still).not.toHaveBeenCalled();
    expect(capture.regionBegin).not.toHaveBeenCalled();
    expect(capture.regionStart).not.toHaveBeenCalled();
  });

  it('explains the permission before asking, and asks only when the user presses', async () => {
    const { capture } = mount({ permission: 'not-determined' });
    expect(await screen.findByText(/Nothing is uploaded/)).toBeTruthy();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(capture.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ask macOS' }));
    await waitFor(() => expect(capture.requestPermission).toHaveBeenCalledTimes(1));
  });

  it('a denied permission offers System Settings, never another prompt', async () => {
    const { capture } = mount({ permission: 'denied' });
    expect(await screen.findByRole('button', { name: 'Open System Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask macOS' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }));
    await waitFor(() => expect(capture.openPermissionSettings).toHaveBeenCalled());
    expect(capture.requestPermission).not.toHaveBeenCalled();
  });

  it('takes a full-screen still of the source the user picks', async () => {
    const { capture } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Full screen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Capture Built-in Display' }));
    await waitFor(() =>
      expect(capture.still).toHaveBeenCalledWith({ mode: 'screen', sourceId: 'screen:1:0' }),
    );
  });

  it('falls back to the in-view picker on the same frame, and Cancel drops it', async () => {
    const { capture } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Region' }));
    fireEvent.click(screen.getByRole('button', { name: 'Freeze screen' }));
    expect(await screen.findByRole('region', { name: 'Choose a region' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(capture.regionCancel).toHaveBeenCalledWith({ pendingId: 'pend-abcdef' }),
    );
    expect(capture.regionFinish).not.toHaveBeenCalled();
    expect(capture.regionStart).toHaveBeenCalledTimes(1);
    expect(capture.regionBegin).not.toHaveBeenCalled();
  });

  it('waits for the desktop overlay, then selects what it took', async () => {
    const { capture, emit } = mount({ regionSurface: 'overlay' });
    fireEvent.click(await screen.findByRole('button', { name: 'Region' }));
    fireEvent.click(screen.getByRole('button', { name: 'Freeze screen' }));
    expect(await screen.findByText(/Drag on the screen to choose a region/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Choose a region' })).toBeNull();
    capture.list.mockResolvedValue({ captures: [{ ...shot, mode: 'region' }] });
    emit({ reason: 'overlay', overlay: { outcome: 'captured', captureId: shot.id } });
    expect(await screen.findByRole('complementary', { name: 'Preview' })).toBeTruthy();
    expect(screen.queryByText(/Drag on the screen/)).toBeNull();
    expect(capture.regionFinish).not.toHaveBeenCalled();
  });

  it('a dismissed overlay goes back to the tool, and an overlay error is shown', async () => {
    const { emit } = mount({ regionSurface: 'overlay' });
    fireEvent.click(await screen.findByRole('button', { name: 'Region' }));
    fireEvent.click(screen.getByRole('button', { name: 'Freeze screen' }));
    await screen.findByText(/Drag on the screen/);
    emit({ reason: 'overlay', overlay: { outcome: 'cancelled' } });
    expect(await screen.findByRole('button', { name: 'Freeze screen' })).toBeTruthy();
    emit({
      reason: 'overlay',
      overlay: { outcome: 'error', message: 'The frozen frame expired.' },
    });
    expect(await screen.findByText('The frozen frame expired.')).toBeTruthy();
  });

  it('selects a capture the composer asked for before the view mounted', async () => {
    selectCapture(shot.id);
    mount({ captures: [shot] });
    expect(await screen.findByRole('complementary', { name: 'Preview' })).toBeTruthy();
  });

  it('opens the region picker on the frame the shortcut froze', async () => {
    const { capture, emit } = mount();
    await screen.findByText('Pick what to capture.');
    emit({ reason: 'shortcut', region: frame });
    fireEvent.click(await screen.findByRole('button', { name: 'Whole screen' }));
    await waitFor(() =>
      expect(capture.regionFinish).toHaveBeenCalledWith({
        pendingId: 'pend-abcdef',
        rect: { x: 0, y: 0, width: 1, height: 1 },
      }),
    );
  });

  it('records the source the user picks and saves it on stop', async () => {
    const { capture } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record Built-in Display' }));
    expect(await screen.findByText('Recording Built-in Display')).toBeTruthy();
    expect(capture.recordingArm).toHaveBeenCalledWith({ sourceId: 'screen:1:0' });
    expect(capture.recordingBegin).toHaveBeenCalledWith({ mime: 'video/webm;codecs=vp9' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => expect(capture.recordingFinish).toHaveBeenCalled());
    expect(capture.recordingChunk).toHaveBeenCalledTimes(1);
  });

  it('turns clipboard history on only from its switch', async () => {
    const { capture } = mount();
    const toggle = await screen.findByRole('switch', { name: 'Keep clipboard history' });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/the clipboard is not read at all/)).toBeTruthy();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(capture.setSettings).toHaveBeenCalledWith({ clipboardHistory: true }),
    );
  });

  it('reports a shortcut conflict instead of swallowing it', async () => {
    const { capture } = mount();
    capture.status.mockResolvedValue({
      permission: 'granted',
      settings: { ...CAPTURE_DEFAULT_SETTINGS, shortcut: 'CommandOrControl+Shift+4' },
      shortcut: {
        accelerator: 'CommandOrControl+Shift+4',
        state: 'conflict',
        message:
          'CommandOrControl+Shift+4 is already used by another app or by macOS. Pick another chord.',
      },
      canRecord: true,
      destinations: [],
    });
    const field = await screen.findByLabelText('Global shortcut');
    fireEvent.change(field, { target: { value: 'CommandOrControl+Shift+4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/already used by another app/)).toBeTruthy();
    fireEvent.change(field, { target: { value: 'not a chord' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/modifiers then a key/)).toBeTruthy();
  });

  it('without destinations: Send to explains it works in Studio', async () => {
    mount({ captures: [shot] });
    fireEvent.click(await screen.findByRole('button', { name: /Screen · 3024 × 1964/ }));
    expect(await screen.findByText(/Send to works inside Midnite Studio/)).toBeTruthy();
    const pr = screen.getByRole('button', { name: 'Pull-request comment' }) as HTMLButtonElement;
    expect(pr.disabled).toBe(true);
    expect(pr.title).toBe('Pull requests are in Midnite Studio.');
  });

  it('standalone: copies, reveals and opens the capture in Midnite Studio only when pressed', async () => {
    const { capture } = mount({
      captures: [shot],
      destinations: ['clipboard', 'finder', 'studio'],
    });
    fireEvent.click(await screen.findByRole('button', { name: /Screen · 3024 × 1964/ }));
    const sendTo = await screen.findByLabelText('Send to');
    expect(
      within(sendTo)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Agent chat',
      'Pull-request comment',
      'Creator project',
      'Copy to clipboard',
      'Show in Finder',
      'Midnite Studio',
    ]);
    expect(within(sendTo).getByText(/open the capture there/)).toBeTruthy();
    expect(capture.copy).not.toHaveBeenCalled();
    fireEvent.click(within(sendTo).getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => expect(capture.copy).toHaveBeenCalledWith({ id: shot.id }));
    fireEvent.click(within(sendTo).getByRole('button', { name: 'Show in Finder' }));
    await waitFor(() => expect(capture.reveal).toHaveBeenCalledWith({ id: shot.id }));
    fireEvent.click(within(sendTo).getByRole('button', { name: 'Midnite Studio' }));
    await waitFor(() => expect(capture.openInStudio).toHaveBeenCalledWith({ id: shot.id }));
    expect(await within(sendTo).findByText(/it asks before it imports/)).toBeTruthy();
  });

  it('a recording cannot go on the clipboard from Send to', async () => {
    mount({ captures: [clip], destinations: ['clipboard', 'finder'] });
    fireEvent.click(await screen.findByRole('button', { name: /Recording/ }));
    const sendTo = await screen.findByLabelText('Send to');
    const copy = within(sendTo).getByRole('button', {
      name: 'Copy to clipboard',
    }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
  });

  it('in Studio: a PR comment copies the capture and opens the PR at its comment box — nothing posted', async () => {
    const pulls = vi.fn(async () => ({
      ok: true as const,
      pulls: [
        { number: 7, title: 'Fix the graph', url: 'https://github.com/o/r/pull/7' },
        { number: 9, title: 'Docs', url: 'https://github.com/o/r/pull/9' },
      ],
    }));
    const open = vi.fn();
    const { capture } = mount({
      captures: [shot],
      destinations: ['chat', 'pr-comment'],
      host: { prComment: { repo: () => ({ id: 'repo-1', name: 'midnite' }), pulls, open } },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Screen · 3024 × 1964/ }));
    expect(pulls).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Pull-request comment' }));
    await waitFor(() => expect(pulls).toHaveBeenCalledWith('repo-1'));
    expect(capture.copy).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '#7 Fix the graph' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith({
        repoId: 'repo-1',
        url: 'https://github.com/o/r/pull/7#new_comment_field',
      }),
    );
    expect(capture.copy).toHaveBeenCalledWith({ id: shot.id });
    expect(capture.copy.mock.invocationCallOrder[0]!).toBeLessThan(
      open.mock.invocationCallOrder[0]!,
    );
    expect(await screen.findByText(PR_COMMENT_PASTE_NOTE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '#9 Docs' })).toBeNull();
  });

  it('in Studio: a PR comment says why when the PRs cannot be listed, or none is selected', async () => {
    const open = vi.fn();
    let repo: { id: string; name: string } | null = null;
    mount({
      captures: [shot],
      destinations: ['pr-comment'],
      host: {
        prComment: {
          repo: () => repo,
          pulls: async () => ({ ok: false as const, message: 'gh is not signed in.' }),
          open,
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Screen · 3024 × 1964/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pull-request comment' }));
    expect(await screen.findByText(/Select a repository first/)).toBeTruthy();
    repo = { id: 'repo-1', name: 'midnite' };
    fireEvent.click(screen.getByRole('button', { name: 'Pull-request comment' }));
    expect(await screen.findByText('gh is not signed in.')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });

  it('in Studio: prepares a chat draft and imports into Creator only when pressed', async () => {
    const sendToChat = vi.fn();
    const reveal = vi.fn();
    const { capture } = mount({
      captures: [shot],
      destinations: ['chat', 'creator'],
      host: {
        sendToChat,
        creator: { repo: () => ({ id: 'repo-1', name: 'midnite' }), reveal },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Screen · 3024 × 1964/ }));
    expect(capture.attachment).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Agent chat' }));
    await waitFor(() =>
      expect(sendToChat).toHaveBeenCalledWith({
        name: shot.fileName,
        text: 'Screenshot saved at /tmp/x.png',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Creator project' }));
    await waitFor(() =>
      expect(capture.sendToCreator).toHaveBeenCalledWith({ id: shot.id, repoId: 'repo-1' }),
    );
    expect(reveal).toHaveBeenCalledWith({
      repoId: 'repo-1',
      project: 'Captures',
      path: shot.fileName,
    });
  });

  it('confirms before clearing clipboard history', async () => {
    const { capture } = mount({
      clipboard: [{ id: 'clip-abcdef', kind: 'text', createdAt: 1, bytes: 5, text: 'hello' }],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear history…' }));
    expect(capture.clipboard.clear).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear history' }));
    await waitFor(() => expect(capture.clipboard.clear).toHaveBeenCalled());
  });
});

describe('rectFromPoints', () => {
  const box = { left: 100, top: 50, width: 400, height: 200 };
  it('spans two points as fractions, either drag direction, clamped to the frame', () => {
    expect(rectFromPoints({ x: 200, y: 100 }, { x: 300, y: 150 }, box)).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.25,
      height: 0.25,
    });
    expect(rectFromPoints({ x: 300, y: 150 }, { x: 200, y: 100 }, box)).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.25,
      height: 0.25,
    });
    expect(rectFromPoints({ x: 0, y: 0 }, { x: 900, y: 900 }, box)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
  it('treats a click as no region', () => {
    expect(rectFromPoints({ x: 200, y: 100 }, { x: 200, y: 100 }, box)).toBeNull();
    expect(
      rectFromPoints({ x: 1, y: 1 }, { x: 2, y: 2 }, { left: 0, top: 0, width: 0, height: 0 }),
    ).toBeNull();
  });
});
