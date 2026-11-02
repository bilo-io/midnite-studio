// vitest/jsdom: the timeline player's transport, keys, range and lanes over a stubbed decoder and 3D pane — DOM roles and text only.
import { createFrameChrome, FrameChromeProvider, MediaKitProvider, type MediaKit } from '@midnite/studio-frame';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClipPlayer } from './clip-player';
import { makeClip } from './test-clips';

const decoded = vi.hoisted(() => ({ boneCount: 3 }));

vi.mock('./clip-decode', () => ({
  decodeClip: async () => ({
    clip: {
      duration: 2,
      tracks: Array.from({ length: decoded.boneCount }, (_, i) => ({ name: `Bone${i}.quaternion`, times: [0, 1, 2] })),
    },
    root: null,
    bvh: false,
    skeleton: null,
  }),
}));
vi.mock('./clip-preview', () => ({
  default: ({ time, target }: { time: number; target: { kind: string } }) => <div data-testid="preview" data-time={time.toFixed(3)} data-target={target.kind} />,
}));

const clip = makeClip({ id: 'aaaaaaaaaaaa', name: 'Walking', durationSec: 2, fps: 30 });

function renderPlayer() {
  const chrome = createFrameChrome({ useDialogs: () => ({ confirm: () => {}, prompt: () => {}, notify: () => {}, setBlastRadius: () => {}, close: () => {} }) as never }).chrome;
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FrameChromeProvider chrome={chrome}>
        <MediaKitProvider kit={{} as MediaKit}>
          <ClipPlayer clip={clip} />
        </MediaKitProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    media: { animation: { read: vi.fn(async () => ({ ok: true, value: { id: clip.id, name: clip.name, format: 'fbx', dataBase64: '' } })) } } as unknown as MidniteStudioBridge['media'],
  } as Partial<MidniteStudioBridge>;
});
afterEach(() => {
  cleanup();
  decoded.boneCount = 3;
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const readout = () => screen.getByLabelText('Playhead').textContent;

describe('ClipPlayer', () => {
  it('loads the clip, lists a lane per bone and previews on the mannequin', async () => {
    renderPlayer();
    const preview = await screen.findByTestId('preview');
    expect(preview.getAttribute('data-target')).toBe('skeleton');
    const lanes = within(screen.getByRole('list', { name: 'Bone lanes' })).getAllByRole('listitem');
    expect(lanes.map((l) => l.textContent)).toEqual(['Bone0', 'Bone1', 'Bone2']);
    expect(readout()).toBe('0.00s · frame 0 / 60');
  });

  it('steps by frame from the transport and feeds the preview the playhead', async () => {
    renderPlayer();
    const preview = await screen.findByTestId('preview');
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(readout()).toBe('0.07s · frame 2 / 60');
    expect(preview.getAttribute('data-time')).toBe('0.067');
    fireEvent.click(screen.getByRole('button', { name: 'Previous frame' }));
    expect(readout()).toBe('0.03s · frame 1 / 60');
  });

  it('toggles play and pause', async () => {
    renderPlayer();
    await screen.findByTestId('preview');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('answers Space, arrows, brackets and L while the player has focus', async () => {
    renderPlayer();
    await screen.findByTestId('preview');
    const player = screen.getByRole('region', { name: 'Timeline player' });
    fireEvent.keyDown(player, { key: 'ArrowRight' });
    fireEvent.keyDown(player, { key: 'ArrowRight' });
    fireEvent.keyDown(player, { key: '[' });
    fireEvent.keyDown(player, { key: 'ArrowRight' });
    fireEvent.keyDown(player, { key: ']' });
    expect(readout()).toBe('0.10s · frame 3 / 60');
    expect(screen.getByRole('slider', { name: 'In point' }).getAttribute('aria-valuenow')).toBe(String((2 / 30 / 2) * 100));
    const loop = screen.getByRole('button', { name: 'Loop' });
    expect(loop.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(player, { key: 'l' });
    expect(loop.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(player, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('ignores the keys while typing in a field', async () => {
    renderPlayer();
    await screen.findByTestId('preview');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Speed' }), { key: 'ArrowRight' });
    expect(readout()).toBe('0.00s · frame 0 / 60');
  });

  it('clears an in/out range', async () => {
    renderPlayer();
    await screen.findByTestId('preview');
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    fireEvent.click(screen.getByRole('button', { name: 'In' }));
    expect(Number(screen.getByRole('slider', { name: 'In point' }).getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Clear range' }));
    expect(screen.getByRole('slider', { name: 'In point' }).getAttribute('aria-valuenow')).toBe('0');
  });

  it('collapses a long bone list to one summary lane and expands it on request', async () => {
    decoded.boneCount = 90;
    renderPlayer();
    await screen.findByTestId('preview');
    const items = () => within(screen.getByRole('list', { name: 'Bone lanes' })).getAllByRole('listitem');
    expect(items().map((l) => l.textContent)).toEqual(['All 90 bones']);
    fireEvent.click(screen.getByRole('button', { name: 'Expand bone lanes' }));
    await waitFor(() => expect(items().length).toBeGreaterThan(1));
    expect(items().length).toBeLessThan(90);
    expect(screen.getByRole('button', { name: 'Collapse bone lanes' })).toBeTruthy();
  });

  it('offers the mannequin as the default model', async () => {
    renderPlayer();
    await screen.findByTestId('preview');
    const select = screen.getByRole('combobox', { name: 'Preview model' }) as HTMLSelectElement;
    expect(select.value).toBe('mannequin');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Mannequin']);
  });
});
