// vitest/jsdom: the SFX panel's states and form are DOM text, roles and attributes — no layout needed.
import { SFX_LICENCE_SHA256, type SfxStatus } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initialSfxForm, type SfxFormState } from './sfx-form-state';
import { SfxPanel } from './sfx-panel';

const consent = { licenceSha256: SFX_LICENCE_SHA256, acceptedAt: 'now', revenueAcknowledged: true as const };
const hook = {
  status: { data: undefined as SfxStatus | undefined },
  progress: null,
  installing: false,
  running: null,
  busy: false,
  lastError: null,
  consentAndInstall: { mutate: vi.fn(), isPending: false },
  install: { mutate: vi.fn(), isPending: false },
  cancelInstall: vi.fn(),
  uninstall: { mutate: vi.fn(), isPending: false },
  generate: { mutate: vi.fn(), isPending: false },
  cancelGenerate: vi.fn(),
};
vi.mock('./use-sfx', () => ({ useSfx: () => hook }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness() {
  const [form, setForm] = useState<SfxFormState>(initialSfxForm);
  return <SfxPanel repoId="r" project="sounds" form={form} setForm={setForm} onGenerated={() => undefined} />;
}

const withStatus = (status: SfxStatus) => {
  hook.status.data = status;
  return render(<Harness />);
};

describe('SfxPanel', () => {
  it('shows why it cannot run in an app without the engine, and offers no download', () => {
    withStatus({ state: 'unavailable', consent: null, bytesOnDisk: 0, totalBytes: 0, reason: 'Open Midnite Studio to use it.' });
    expect(screen.getByTestId('sfx-unavailable').textContent).toContain('Midnite Studio');
    expect(screen.queryByTestId('sfx-setup')).toBeNull();
  });

  it('asks for the licence before any download: Accept stays off until both boxes are ticked', () => {
    withStatus({ state: 'not-installed', consent: null, bytesOnDisk: 0, totalBytes: 2_117_683_571 });
    expect(screen.getByTestId('sfx-setup').textContent).toContain('2.12 GB');
    fireEvent.click(screen.getByTestId('sfx-setup'));
    const accept = screen.getByTestId('sfx-consent-accept') as HTMLButtonElement;
    expect(screen.getByTestId('sfx-licence-text').textContent).toContain('Stability AI Community License');
    expect(accept.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('sfx-consent-read'));
    expect(accept.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('sfx-consent-revenue'));
    expect(accept.disabled).toBe(false);
    fireEvent.click(accept);
    expect(hook.consentAndInstall.mutate).toHaveBeenCalledWith({ licenceSha256: SFX_LICENCE_SHA256 });
  });

  it('resumes a consented partial download without asking again', () => {
    withStatus({ state: 'not-installed', consent, bytesOnDisk: 500_000_000, totalBytes: 2_117_683_571 });
    fireEvent.click(screen.getByTestId('sfx-setup'));
    expect(hook.install.mutate).toHaveBeenCalled();
    expect(screen.queryByTestId('sfx-consent-accept')).toBeNull();
    fireEvent.click(screen.getByTestId('sfx-discard'));
    expect(hook.uninstall.mutate).toHaveBeenCalled();
  });

  it('blocks Generate while a run it did not start is going', () => {
    hook.busy = true;
    withStatus({ state: 'installed', consent, bytesOnDisk: 1, totalBytes: 1 });
    fireEvent.change(screen.getByTestId('sfx-prompt'), { target: { value: 'zap' } });
    expect(screen.getByTestId('sfx-generate')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('sfx-generate').getAttribute('title')).toMatch(/Another sound is being generated/);
    hook.busy = false;
  });

  it('installed: the negative prompt waits for guidance, and Generate sends every knob', () => {
    withStatus({ state: 'installed', consent, bytesOnDisk: 1, totalBytes: 1 });
    expect(screen.getByTestId('sfx-attribution').textContent).toBe('Powered by Stability AI');
    const generate = screen.getByTestId('sfx-generate') as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    expect((screen.getByTestId('sfx-negative') as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('sfx-prompt'), { target: { value: 'laser zap' } });
    fireEvent.change(screen.getByTestId('sfx-seconds'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('sfx-cfg'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('sfx-negative'), { target: { value: 'music' } });
    fireEvent.change(screen.getByTestId('sfx-variations'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('sfx-seed'), { target: { value: '12a3' } });
    expect((screen.getByTestId('sfx-seed') as HTMLInputElement).value).toBe('123');
    expect(generate.disabled).toBe(false);
    expect(generate.textContent).toContain('2 takes');
    fireEvent.click(generate);
    expect(hook.generate.mutate.mock.calls[0]![0]).toEqual({
      project: 'sounds',
      prompt: 'laser zap',
      options: { seconds: 2, steps: 8, cfgScale: 3, variations: 2, seed: 123, negativePrompt: 'music' },
    });
  });
});
