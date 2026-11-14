// vitest/jsdom: switches, prompts and the delete confirm are DOM and store behaviour — no real browser needed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider, useFeatureTogglesStore } from '@midnite/studio-frame';

import { FeaturesPage, featureRowDescription } from './features-page';

type Confirm = { title: string; onConfirm: () => void; warnings?: string[]; blastRadius?: { count: number } | null };

const confirm = vi.fn<(request: Confirm) => void>();
const describeData = vi.fn();
const deleteData = vi.fn();

function renderPage() {
  const chrome = createFrameChrome({
    useDialogs: () => ({ confirm, notify: vi.fn(), setBlastRadius: vi.fn(), close: vi.fn() }),
  } as never).chrome;
  return render(
    <FrameChromeProvider chrome={chrome}>
      <FeaturesPage />
    </FrameChromeProvider>,
  );
}

const switchFor = (label: string) => screen.getByRole('switch', { name: new RegExp(`^${label}`) }) as HTMLInputElement;

describe('Settings ▸ Features (Phase 135 Theme D)', () => {
  beforeEach(() => {
    useFeatureTogglesStore.setState({ disabled: [] });
    confirm.mockReset();
    describeData.mockReset();
    deleteData.mockReset();
    (window as unknown as { midniteStudio: unknown }).midniteStudio = { features: { describeData, deleteData } };
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('lists every feature on by default, grouped, with the always-on three', () => {
    renderPage();
    expect(switchFor('Councils').checked).toBe(true);
    expect(switchFor('Media').checked).toBe(true);
    expect(screen.getByText('Always on')).toBeTruthy();
    expect(screen.getByText('Terminal')).toBeTruthy();
    expect(featureRowDescription('councils')).toMatch(/Needs Chats\./);
    expect(featureRowDescription('chats')).toMatch(/Councils needs this\./);
  });

  it('switches a feature with no dependents straight off', () => {
    renderPage();
    fireEvent.click(switchFor('Notes'));
    expect(confirm).not.toHaveBeenCalled();
    expect(useFeatureTogglesStore.getState().disabled).toEqual(['notes']);
  });

  it('asks before switching off a feature others need, naming them', () => {
    renderPage();
    fireEvent.click(switchFor('Chats'));
    expect(useFeatureTogglesStore.getState().disabled).toEqual([]);
    expect(confirm).toHaveBeenCalledTimes(1);
    const request = confirm.mock.calls[0]![0];
    expect(request.title).toBe('Turn off Chats?');
    request.onConfirm();
    expect(useFeatureTogglesStore.getState().disabled).toEqual(['chats', 'councils']);
  });

  it('turning on a dependent turns on what it needs, and says so', () => {
    useFeatureTogglesStore.setState({ disabled: ['chats', 'councils'] });
    renderPage();
    fireEvent.click(switchFor('Councils'));
    expect(useFeatureTogglesStore.getState().disabled).toEqual([]);
    expect(screen.getByRole('status').textContent).toMatch(/Turned on Chats too/);
  });

  it("deletes an off feature's data through the destructive confirm", async () => {
    useFeatureTogglesStore.setState({ disabled: ['councils'] });
    describeData.mockResolvedValue({ files: [{ path: 'councils.json', bytes: 2048 }] });
    deleteData.mockResolvedValue({ ok: true, removedFiles: 1, removedBytes: 2048 });
    renderPage();
    expect(screen.queryByTestId('feature-delete-chats')).toBeNull();
    fireEvent.click(screen.getByTestId('feature-delete-councils'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const request = confirm.mock.calls[0]![0];
    expect(describeData).toHaveBeenCalledWith({ feature: 'councils' });
    expect(request.blastRadius?.count).toBe(1);
    expect(request.warnings?.[0]).toMatch(/2\.0 KB/);
    request.onConfirm();
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/moved to the Trash/));
    expect(deleteData).toHaveBeenCalledWith({ feature: 'councils' });
  });
});
