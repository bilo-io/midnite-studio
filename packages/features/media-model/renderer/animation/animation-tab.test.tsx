// vitest/jsdom: the Animations tab against a fake bridge and a minimal media kit — DOM roles and text only.
import type { AnimationClip, AnimationImportResult, AnimationProgressEvent, MidniteStudioBridge } from '@midnite/studio-shared';
import {
  createFrameChrome,
  FrameChromeProvider,
  MediaKitProvider,
  type FrameDialogs,
  type MediaAccordionProps,
  type MediaKit,
  type MediaLayoutProps,
} from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnimationTab } from './animation-tab';
import { SAMPLE_CLIPS } from './test-clips';

const kit = {
  MediaLayout: ({ toolbar, explorer, content, detail }: MediaLayoutProps) => (
    <div>
      <div data-testid="toolbar">{toolbar}</div>
      <div data-testid="explorer">{explorer}</div>
      <div data-testid="content">{content}</div>
      <div data-testid="detail">{detail}</div>
    </div>
  ),
  Accordion: ({ sections }: MediaAccordionProps) => (
    <div>
      {sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <h3>{section.title}</h3>
          {section.actions}
          {section.children}
        </section>
      ))}
    </div>
  ),
} as unknown as MediaKit;

const EMPTY_IMPORT: AnimationImportResult = { added: [], duplicates: [], failed: [], warnings: [], cancelled: false };

function installBridge(initial: AnimationClip[] = SAMPLE_CLIPS) {
  let clips = [...initial];
  let onChanged: () => void = () => {};
  let onProgress: (event: AnimationProgressEvent) => void = () => {};
  const animation = {
    list: vi.fn(async () => ({ ok: true, value: { clips: clips.map((c) => ({ ...c })) } })),
    importFiles: vi.fn(async () => ({ ok: true, value: { ...EMPTY_IMPORT } })),
    importFolder: vi.fn(async () => ({ ok: true, value: { ...EMPTY_IMPORT } })),
    importBytes: vi.fn(async () => ({ ok: true, value: { ...EMPTY_IMPORT } })),
    update: vi.fn(async (req: { id: string; patch: Partial<AnimationClip> }) => {
      clips = clips.map((c) => (c.id === req.id ? { ...c, ...req.patch } : c));
      return { ok: true, value: { clip: clips.find((c) => c.id === req.id) } };
    }),
    remove: vi.fn(async (req: { id: string }) => {
      const clip = clips.find((c) => c.id === req.id);
      clips = clips.filter((c) => c.id !== req.id);
      return { ok: true, value: { clip } };
    }),
    read: vi.fn(),
    onChanged: vi.fn((handler: () => void) => {
      onChanged = handler;
      return () => {};
    }),
    onProgress: vi.fn((handler: (event: AnimationProgressEvent) => void) => {
      onProgress = handler;
      return () => {};
    }),
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    media: { animation } as unknown as MidniteStudioBridge['media'],
  } as Partial<MidniteStudioBridge>;
  return { animation, emitChanged: () => onChanged(), emitProgress: (event: AnimationProgressEvent) => onProgress(event) };
}

const instantDialogs = (): FrameDialogs => ({
  confirm: (request) => request.onConfirm(),
  prompt: (request) => request.onConfirm(request.initialValue ?? ''),
  notify: () => {},
  setBlastRadius: () => {},
  close: () => {},
});

function renderTab() {
  const dialogs = instantDialogs();
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FrameChromeProvider chrome={createFrameChrome({ useDialogs: () => dialogs }).chrome}>
        <MediaKitProvider kit={kit}>
          <AnimationTab />
        </MediaKitProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const rowNames = () => within(screen.getByRole('list', { name: 'Animation clips' })).getAllByRole('button').map((b) => b.querySelector('span span')?.textContent);
const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

describe('AnimationTab', () => {
  it('lists the clips by name with a count', async () => {
    installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    expect(rowNames()).toEqual(['Idle Breathing', 'Run Forward', 'Sword Slash', 'Walking']);
    expect(screen.getByText('4 of 4 clips')).toBeTruthy();
  });

  it('shows the empty state with import actions when the library has no clips', async () => {
    const { animation } = installBridge([]);
    renderTab();
    expect(await screen.findByText('Your animation library is empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import a folder…' }));
    await waitFor(() => expect(animation.importFolder).toHaveBeenCalledTimes(1));
  });

  it('searches by any word across name, tags and author', async () => {
    installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.change(screen.getByPlaceholderText(/Search name/), { target: { value: 'locomotion' } });
    expect(rowNames()).toEqual(['Run Forward', 'Walking']);
    fireEvent.change(screen.getByPlaceholderText(/Search name/), { target: { value: 'zzz' } });
    expect(screen.getByText('No clips match')).toBeTruthy();
  });

  it('filters by tag and by source from the explorer', async () => {
    installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    const tags = within(screen.getByRole('list', { name: 'Filter by tag' }));
    fireEvent.click(tags.getByRole('button', { name: /^combat/ }));
    expect(tags.getByRole('button', { name: /^combat/ }).getAttribute('aria-pressed')).toBe('true');
    expect(rowNames()).toEqual(['Sword Slash']);
    fireEvent.click(tags.getByRole('button', { name: /^combat/ }));
    expect(rowNames()).toHaveLength(4);

    const sources = within(screen.getByRole('list', { name: 'Filter by source' }));
    fireEvent.click(sources.getByRole('button', { name: /Sketchfab/ }));
    expect(rowNames()).toEqual(['Idle Breathing']);
    fireEvent.click(sources.getByRole('button', { name: /All sources/ }));
    expect(rowNames()).toHaveLength(4);
  });

  it('sorts by duration, longest first and unknown last', async () => {
    installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.change(screen.getByLabelText('Sort clips'), { target: { value: 'duration' } });
    expect(rowNames()).toEqual(['Sword Slash', 'Walking', 'Run Forward', 'Idle Breathing']);
  });

  it('selects a clip with the click and the arrow keys, and shows its details', async () => {
    installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    expect(screen.getByText('Select a clip')).toBeTruthy();
    fireEvent.click(row('Walking'));
    expect((screen.getByLabelText('Clip name') as HTMLInputElement).value).toBe('Walking');
    expect(row('Walking').getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(screen.getByRole('list', { name: 'Animation clips' }), { key: 'ArrowUp' });
    expect((screen.getByLabelText('Clip name') as HTMLInputElement).value).toBe('Sword Slash');
  });

  it('shows provenance for a clip, with the original link opening in a new window safely', async () => {
    installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.click(row('Idle Breathing'));
    const link = screen.getByRole('link', { name: 'https://sketchfab.com/3d-models/idle' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer noopener');
    expect((screen.getByLabelText('Author') as HTMLInputElement).value).toBe('Ana');
    expect((screen.getByLabelText('Licence') as HTMLSelectElement).value).toBe('cc-by');
  });

  it('renames a clip on blur, and puts the old name back for a blank one', async () => {
    const { animation } = installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.click(row('Walking'));
    const input = screen.getByLabelText('Clip name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Brisk Walk ' } });
    fireEvent.blur(input);
    await waitFor(() => expect(animation.update).toHaveBeenCalledWith({ id: 'aaaaaaaaaaaa', patch: { name: 'Brisk Walk' } }));
    await waitFor(() => expect(rowNames()).toContain('Brisk Walk'));

    fireEvent.change(screen.getByLabelText('Clip name'), { target: { value: '   ' } });
    fireEvent.blur(screen.getByLabelText('Clip name'));
    expect((screen.getByLabelText('Clip name') as HTMLInputElement).value).toBe('Brisk Walk');
    expect(animation.update).toHaveBeenCalledTimes(1);
  });

  it('adds and removes tags', async () => {
    const { animation } = installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.click(row('Walking'));
    const add = screen.getByLabelText('Add a tag');
    fireEvent.change(add, { target: { value: 'Hand Wave' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    await waitFor(() => expect(animation.update).toHaveBeenCalledWith({ id: 'aaaaaaaaaaaa', patch: { tags: ['locomotion', 'hand-wave'] } }));

    fireEvent.click(await screen.findByRole('button', { name: 'Remove tag locomotion' }));
    await waitFor(() => expect(animation.update).toHaveBeenLastCalledWith({ id: 'aaaaaaaaaaaa', patch: { tags: ['hand-wave'] } }));

    // A repeated tag is not sent.
    const calls = animation.update.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Add a tag'), { target: { value: 'HAND-wave' } });
    fireEvent.keyDown(screen.getByLabelText('Add a tag'), { key: 'Enter' });
    expect(animation.update).toHaveBeenCalledTimes(calls);
  });

  it('edits the licence and the author', async () => {
    const { animation } = installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.click(row('Walking'));
    fireEvent.change(screen.getByLabelText('Licence'), { target: { value: 'cc0' } });
    await waitFor(() => expect(animation.update).toHaveBeenCalledWith({ id: 'aaaaaaaaaaaa', patch: { licence: 'cc0' } }));
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Me' } });
    fireEvent.blur(screen.getByLabelText('Author'));
    await waitFor(() => expect(animation.update).toHaveBeenLastCalledWith({ id: 'aaaaaaaaaaaa', patch: { author: 'Me' } }));
  });

  it('removes a clip after confirming, and clears the selection', async () => {
    const { animation } = installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.click(row('Walking'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }));
    await waitFor(() => expect(animation.remove).toHaveBeenCalledWith({ id: 'aaaaaaaaaaaa' }));
    await waitFor(() => expect(rowNames()).not.toContain('Walking'));
    expect(screen.getByText('Select a clip')).toBeTruthy();
  });

  it('summarises an import, lists what failed, and can be dismissed', async () => {
    const { animation } = installBridge();
    animation.importFolder.mockResolvedValueOnce({
      ok: true,
      value: { added: [SAMPLE_CLIPS[0]!], duplicates: [SAMPLE_CLIPS[1]!], failed: [{ name: 'broken.fbx', reason: 'Not an FBX file' }], warnings: ['2 files skipped'], cancelled: false },
    } as never);
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.click(screen.getByRole('button', { name: 'Import a folder of clips' }));
    expect(await screen.findByText('Added 1 · 1 already in the library · 1 failed')).toBeTruthy();
    expect(screen.getByText('broken.fbx')).toBeTruthy();
    expect(screen.getByText('2 files skipped')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import summary' }));
    expect(screen.queryByText(/already in the library/)).toBeNull();
  });

  it('stays quiet when the picker is cancelled', async () => {
    const { animation } = installBridge();
    animation.importFiles.mockResolvedValueOnce({ ok: true, value: { ...EMPTY_IMPORT, cancelled: true } } as never);
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    fireEvent.click(screen.getByRole('button', { name: 'Import clip files' }));
    await waitFor(() => expect(animation.importFiles).toHaveBeenCalled());
    expect(screen.queryByText('Import cancelled')).toBeNull();
  });

  it('shows import progress and refetches when the library changes', async () => {
    const { animation, emitProgress, emitChanged } = installBridge();
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    act(() => emitProgress({ done: 2, total: 9, current: 'Run.fbx', finished: false }));
    expect(screen.getByText(/Importing 3 of 9/)).toBeTruthy();
    expect(screen.getByText(/Run\.fbx/)).toBeTruthy();
    act(() => emitProgress({ done: 9, total: 9, finished: true }));
    expect(screen.queryByText(/Importing/)).toBeNull();

    const before = animation.list.mock.calls.length;
    act(() => emitChanged());
    await waitFor(() => expect(animation.list.mock.calls.length).toBeGreaterThan(before));
  });

  it('imports dropped files as bytes and reports a drop with no clips', async () => {
    const { animation } = installBridge();
    animation.importBytes.mockResolvedValueOnce({ ok: true, value: { ...EMPTY_IMPORT, added: [SAMPLE_CLIPS[0]!] } } as never);
    renderTab();
    await screen.findByRole('list', { name: 'Animation clips' });
    const zone = screen.getByTestId('animation-dropzone');
    // jsdom's File has no `arrayBuffer`.
    const clip = Object.assign(new File(['abc'], 'Jump.fbx'), { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    fireEvent.drop(zone, { dataTransfer: { items: [], files: [clip] } });
    await waitFor(() => expect(animation.importBytes).toHaveBeenCalledWith({ name: 'Jump.fbx', dataBase64: 'AQID' }));
    expect(await screen.findByText('Added 1')).toBeTruthy();

    fireEvent.drop(zone, { dataTransfer: { items: [], files: [new File(['x'], 'readme.txt')] } });
    expect(await screen.findByText(/No \.fbx, \.glb, \.gltf or \.bvh files/, { exact: false })).toBeTruthy();
  });

  it('shows an error state when the library cannot be read', async () => {
    const { animation } = installBridge();
    animation.list.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Manifest unreadable' } as never);
    renderTab();
    expect(await screen.findByText('The animation library could not be read')).toBeTruthy();
    expect(screen.getByText('Manifest unreadable')).toBeTruthy();
  });
});
