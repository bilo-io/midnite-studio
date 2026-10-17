// vitest, not Playwright: planning and dispatch over injected deps and a stub bridge — no browser.
import { handoffLink, type MidniteStudioBridge } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handOff } from './handoff';

afterEach(() => {
  delete (window as { midniteStudio?: MidniteStudioBridge }).midniteStudio;
});

const monitorOnly = new Set(['monitor'] as const);

describe('handOff (a standalone app)', () => {
  it('sends a request for another app to main as its midnite://open link', async () => {
    const open = vi.fn(async () => true);
    const request = { app: 'studio' as const, ref: { kind: 'session' as const, id: 's1' } };
    expect(await handOff(request, { hosted: monitorOnly, open })).toEqual({ ok: true, via: 'external' });
    expect(open).toHaveBeenCalledWith(handoffLink(request));
  });

  it('goes through the bridge’s handoff.open by default, and says so when it cannot', async () => {
    const opened: string[] = [];
    (window as { midniteStudio?: unknown }).midniteStudio = {
      handoff: { open: async ({ link }: { link: string }) => (opened.push(link), { ok: true }) },
    };
    expect(await handOff({ app: 'coder', view: 'reviews' }, { hosted: monitorOnly })).toEqual({ ok: true, via: 'external' });
    expect(opened).toEqual([handoffLink({ app: 'coder', view: 'reviews' })]);

    delete (window as { midniteStudio?: unknown }).midniteStudio;
    expect(await handOff({ app: 'coder' }, { hosted: monitorOnly })).toMatchObject({ ok: false });
  });

  it('navigates in-process when it hosts the target', async () => {
    const navigate = vi.fn();
    const open = vi.fn(async () => true);
    expect(await handOff({ app: 'monitor', view: 'monitor' }, { hosted: monitorOnly, navigate, open })).toEqual({ ok: true, via: 'local' });
    expect(navigate).toHaveBeenCalledWith({ app: 'monitor', view: 'monitor' });
    expect(open).not.toHaveBeenCalled();
  });
});
