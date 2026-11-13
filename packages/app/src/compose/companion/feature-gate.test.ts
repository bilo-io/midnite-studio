import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFeatureTogglesStore } from '@midnite/studio-frame';
import type { ResourceSource, RevealerTable } from '@midnite/studio-feature-companion/renderer';

import { gateRevealers, gateSources } from './feature-gate';

const ok = { ok: true as const, did: 'revealed' as const, label: 'x' };
const table = {
  chat: { view: 'chats', reveal: vi.fn(async () => ok) },
  commit: { view: 'graph', reveal: vi.fn(async () => ok) },
} as unknown as RevealerTable;
const ctx = { caller: 'companion' as const, focusedWindow: false };

afterEach(() => useFeatureTogglesStore.setState({ disabled: [] }));

describe('companion feature gate (Phase 135 Theme C)', () => {
  it('passes reveals through while the feature is on', async () => {
    const gated = gateRevealers(table) as unknown as Record<string, { view: (r: unknown) => unknown; reveal: (r: unknown, c: unknown) => Promise<unknown> }>;
    expect(gated.chat!.view({ kind: 'chat', id: 'a' })).toBe('chats');
    await expect(gated.chat!.reveal({ kind: 'chat', id: 'a' }, ctx)).resolves.toEqual(ok);
  });

  it('answers unavailable without a view switch while the feature is off', async () => {
    useFeatureTogglesStore.setState({ disabled: ['chats'] });
    const gated = gateRevealers(table) as unknown as Record<string, { view: (r: unknown) => unknown; reveal: (r: unknown, c: unknown) => Promise<unknown> }>;
    expect(gated.chat!.view({ kind: 'chat', id: 'a' })).toBeNull();
    await expect(gated.chat!.reveal({ kind: 'chat', id: 'a' }, ctx)).resolves.toMatchObject({ ok: false, reason: 'unavailable', say: expect.stringMatching(/Chats is switched off/) });
    expect(gated.commit!.view({ kind: 'commit' })).toBe('graph');
  });

  it("does not ask a source whose kinds all land on an off feature's page", async () => {
    const load = vi.fn(async () => [{ ref: { kind: 'chat', id: 'a' }, title: 'a' }]);
    const [source] = gateSources([{ id: 'chats', kinds: ['chat'], load } as unknown as ResourceSource], table);
    useFeatureTogglesStore.setState({ disabled: ['chats'] });
    await expect(source!.load({} as never)).resolves.toEqual([]);
    expect(load).not.toHaveBeenCalled();
    useFeatureTogglesStore.setState({ disabled: [] });
    await expect(source!.load({} as never)).resolves.toHaveLength(1);
  });
});
