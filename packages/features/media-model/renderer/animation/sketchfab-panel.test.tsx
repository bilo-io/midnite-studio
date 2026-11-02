// vitest/jsdom: the Sketchfab panel over a fake bridge — the no-token prompt (write-only field), search with licence ticks,
// paging, download and its states. Roles and text only; the token value is a made-up string.
import { SKETCHFAB_TOKEN_URL, type AnimationClip, type MidniteStudioBridge, type SketchfabResult } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SketchfabPanel } from './sketchfab-panel';

const UID_A = 'a'.repeat(32);
const UID_B = 'b'.repeat(32);
const result = (uid: string, name: string, over: Partial<SketchfabResult> = {}): SketchfabResult => ({
  uid,
  name,
  author: 'Ada',
  licence: 'cc-by',
  viewUrl: `https://sketchfab.com/3d-models/x-${uid}`,
  animationCount: 2,
  faceCount: 1500,
  ...over,
});

function install({ hasToken = true, secrets = true, pages = [[result(UID_A, 'Walk Cycle')]] as SketchfabResult[][] } = {}) {
  let tokenSet = hasToken;
  let page = 0;
  const animation = {
    sketchfabStatus: vi.fn(async () => ({ ok: true, value: { hasToken: tokenSet } })),
    sketchfabSearch: vi.fn(async () => {
      const results = pages[page] ?? [];
      page += 1;
      return { ok: true, value: { results, nextCursor: page < pages.length ? 'next' : null } };
    }),
    sketchfabDownload: vi.fn(async () => ({ ok: true, value: { added: [{ id: 'x' }], duplicates: [], failed: [], warnings: [], cancelled: false } })),
    sketchfabCancel: vi.fn(async () => ({ ok: true, value: undefined })),
  };
  const set = vi.fn(async (req: { key: string; value: string }) => {
    tokenSet = req.value.length > 0;
  });
  const openExternal = vi.fn().mockResolvedValue({ ok: true });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    media: { animation } as unknown as MidniteStudioBridge['media'],
    shell: { openExternal } as unknown as MidniteStudioBridge['shell'],
    ...(secrets ? { secrets: { set, has: vi.fn(), get: vi.fn() } as unknown as MidniteStudioBridge['secrets'] } : {}),
  } as Partial<MidniteStudioBridge>;
  return { animation, set, openExternal };
}

const renderPanel = (clips: AnimationClip[] = []) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SketchfabPanel clips={clips} />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('SketchfabPanel without a token', () => {
  it('shows the prompt and never searches', async () => {
    const { animation, openExternal } = install({ hasToken: false });
    renderPanel();
    expect(await screen.findByTestId('sketchfab-token-prompt')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Search Sketchfab' })).toBeNull();
    expect(animation.sketchfabSearch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Get a token on Sketchfab/ }));
    expect(openExternal).toHaveBeenCalledWith({ url: SKETCHFAB_TOKEN_URL });
  });

  it('stores the pasted token through the write-only secrets bridge, clears the field and moves on to search', async () => {
    const { set } = install({ hasToken: false });
    renderPanel();
    const field = (await screen.findByLabelText('Sketchfab API token')) as HTMLInputElement;
    expect(field.type).toBe('password');
    fireEvent.change(field, { target: { value: ' fake-token-for-test ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ key: 'media.sketchfabApiToken', value: 'fake-token-for-test' }));
    expect(await screen.findByRole('searchbox', { name: 'Search Sketchfab' })).toBeTruthy();
  });

  it('points at Studio and Vault when this window cannot store a key', async () => {
    install({ hasToken: false, secrets: false });
    renderPanel();
    await screen.findByTestId('sketchfab-token-prompt');
    expect(screen.queryByLabelText('Sketchfab API token')).toBeNull();
    expect(screen.getByText(/Add the token in Midnite Studio/)).toBeTruthy();
  });
});

describe('SketchfabPanel search', () => {
  it('searches with the ticked licences and lists name, author, licence and counts', async () => {
    const { animation } = install();
    renderPanel();
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search Sketchfab' }), { target: { value: ' walk ' } });
    fireEvent.click(screen.getByLabelText('CC0 (public domain)'));
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    const list = await screen.findByRole('list', { name: 'Sketchfab results' });
    expect(animation.sketchfabSearch).toHaveBeenCalledWith({ q: 'walk', licences: ['cc-by', 'cc-by-sa'] });
    expect(within(list).getByText('Walk Cycle')).toBeTruthy();
    expect(within(list).getByText(/Ada · CC BY \(attribution\) · 2 animations · 1,500 faces/)).toBeTruthy();
  });

  it('will not search with no licence ticked', async () => {
    const { animation } = install();
    renderPanel();
    await screen.findByRole('searchbox', { name: 'Search Sketchfab' });
    for (const label of ['CC0 (public domain)', 'CC BY (attribution)', 'CC BY-SA']) fireEvent.click(screen.getByLabelText(label));
    expect((screen.getByRole('button', { name: /Search/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(animation.sketchfabSearch).not.toHaveBeenCalled();
  });

  it('follows the cursor on Load more and appends', async () => {
    const { animation } = install({ pages: [[result(UID_A, 'Walk Cycle')], [result(UID_B, 'Run Cycle')]] });
    renderPanel();
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search Sketchfab' }), { target: { value: 'cycle' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    await screen.findByText('Walk Cycle');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Run Cycle');
    expect(animation.sketchfabSearch).toHaveBeenLastCalledWith({ q: 'cycle', licences: ['cc0', 'cc-by', 'cc-by-sa'], cursor: 'next' });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('says so when nothing matches and when the search fails', async () => {
    const { animation } = install({ pages: [[]] });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    expect(await screen.findByText('No models found')).toBeTruthy();
    animation.sketchfabSearch.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Sketchfab is rate limiting requests.' } as never);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Sketchfab' }), { target: { value: 'again' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText('Sketchfab search failed')).toBeTruthy();
    expect(screen.getByText('Sketchfab is rate limiting requests.')).toBeTruthy();
  });
});

describe('SketchfabPanel download', () => {
  it('downloads by uid and marks a model already in the library', async () => {
    const { animation } = install({ pages: [[result(UID_A, 'Walk Cycle'), result(UID_B, 'Run Cycle')]] });
    const owned = { id: 'bbbbbbbbbbbb', source: 'sketchfab', originalUrl: `https://sketchfab.com/3d-models/x-${UID_B}` } as AnimationClip;
    renderPanel([owned]);
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    const list = await screen.findByRole('list', { name: 'Sketchfab results' });
    expect(within(list).getByText('In library')).toBeTruthy();
    expect(within(list).queryByRole('button', { name: 'Download Run Cycle' })).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: 'Download Walk Cycle' }));
    await waitFor(() => expect(animation.sketchfabDownload).toHaveBeenCalledWith({ uid: UID_A }));
  });

  it('offers Cancel while a download is running', async () => {
    const { animation } = install();
    animation.sketchfabDownload.mockImplementationOnce(() => new Promise(() => undefined));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download Walk Cycle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel download of Walk Cycle' }));
    expect(animation.sketchfabCancel).toHaveBeenCalledWith({ uid: UID_A });
  });

  it('opens a model on Sketchfab in the system browser', async () => {
    const { openExternal } = install();
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Search/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Walk Cycle on Sketchfab' }));
    expect(openExternal).toHaveBeenCalledWith({ url: `https://sketchfab.com/3d-models/x-${UID_A}` });
  });
});
