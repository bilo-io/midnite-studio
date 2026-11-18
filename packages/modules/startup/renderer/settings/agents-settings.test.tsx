// vitest/jsdom: Settings ▸ Agents over a mock bridge — two switches, off by default, changes gated on read.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STARTUP_SETTINGS } from '../startup-settings';

const Page = STARTUP_SETTINGS.find((p) => p.id === 'app:startup-agents')!.Page;

function install(initial = { read: false, write: false }) {
  let state = initial;
  const setAgentConsent = vi.fn(async ({ consent }: { consent: { read: boolean; write: boolean } }) => {
    state = { read: consent.read, write: consent.read && consent.write };
    return { ok: true, value: state };
  });
  window.midniteStudio = {
    startup: { getAgentConsent: vi.fn(async () => ({ ok: true, value: state })), setAgentConsent, onChanged: () => () => undefined },
  } as unknown as typeof window.midniteStudio;
  return setAgentConsent;
}

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Settings ▸ Agents', () => {
  it('is registered as an app page called Agents', () => {
    expect(STARTUP_SETTINGS.find((p) => p.id === 'app:startup-agents')).toMatchObject({ label: 'Agents', scope: 'app' });
  });

  it('shows both switches off, with changes disabled until read is on', async () => {
    install();
    render(<Page />);
    const read = (await screen.findByRole('switch', { name: 'Let agents read Startup' })) as HTMLInputElement;
    const write = screen.getByRole('switch', { name: 'Let agents make changes' }) as HTMLInputElement;
    await waitFor(() => expect(read.disabled).toBe(false));
    expect(read.checked).toBe(false);
    expect(write.checked).toBe(false);
    expect(write.disabled).toBe(true);
  });

  it('turning read on saves it and enables changes; changes then save separately', async () => {
    const set = install();
    render(<Page />);
    const read = (await screen.findByRole('switch', { name: 'Let agents read Startup' })) as HTMLInputElement;
    await waitFor(() => expect(read.disabled).toBe(false));
    fireEvent.click(read);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ consent: { read: true, write: false } }));
    const write = screen.getByRole('switch', { name: 'Let agents make changes' }) as HTMLInputElement;
    await waitFor(() => expect(write.disabled).toBe(false));
    fireEvent.click(write);
    await waitFor(() => expect(set).toHaveBeenLastCalledWith({ consent: { read: true, write: true } }));
  });

  it('turning read off turns changes off with it', async () => {
    const set = install({ read: true, write: true });
    render(<Page />);
    const read = (await screen.findByRole('switch', { name: 'Let agents read Startup' })) as HTMLInputElement;
    await waitFor(() => expect(read.checked).toBe(true));
    fireEvent.click(read);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ consent: { read: false, write: false } }));
  });
});
