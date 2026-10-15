import { describe, expect, it, vi } from 'vitest';
import { handoffLink, type HandoffRequest, type ResourceRef } from '@midnite/studio-shared';

import { requestHandoff, STUDIO_HOSTED_APPS, type HandoffDeps } from './handoff';
import { useUiStore } from '../store/ui-store';

const deps = (over: Partial<HandoffDeps> = {}): HandoffDeps => ({
  hosted: STUDIO_HOSTED_APPS,
  navigate: vi.fn(),
  reveal: vi.fn(async () => ({ ok: true, did: 'revealed', say: 'ok' }) as never),
  external: null,
  ...over,
});

describe('requestHandoff', () => {
  it('navigates in-process when Studio hosts the target app', async () => {
    const d = deps();
    const request: HandoffRequest = { app: 'agents', view: 'workflows' };
    expect(await requestHandoff(request, d)).toEqual({ ok: true, via: 'local' });
    expect(d.navigate).toHaveBeenCalledWith(request);
    expect(d.reveal).not.toHaveBeenCalled();
  });

  it('routes a ref through the reveal engine', async () => {
    const ref: ResourceRef = { kind: 'commit', repoId: 'repo:a', sha: 'abc1234' };
    const d = deps();
    expect(await requestHandoff({ app: 'coder', ref }, d)).toEqual({ ok: true, via: 'local' });
    expect(d.reveal).toHaveBeenCalledWith(ref);
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('reports a failed reveal with its sentence', async () => {
    const d = deps({ reveal: vi.fn(async () => ({ ok: false, reason: 'not-found', say: 'gone' }) as never) });
    expect(await requestHandoff({ app: 'coder', ref: { kind: 'chat', id: 'c' } }, d)).toEqual({
      ok: false,
      reason: 'reveal-failed',
      say: 'gone',
    });
  });

  it('sends a non-hosted app to the external transport as a midnite:// link', async () => {
    const external = vi.fn(async () => true);
    const request: HandoffRequest = { app: 'agents', view: 'workflows' };
    const d = deps({ hosted: new Set(['coder']), external });
    expect(await requestHandoff(request, d)).toEqual({ ok: true, via: 'external' });
    expect(external).toHaveBeenCalledWith(handoffLink(request));
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('refuses, without throwing, when nothing can carry the link', async () => {
    const d = deps({ hosted: new Set(['coder']), external: null });
    expect(await requestHandoff({ app: 'agents', view: 'workflows' }, d)).toMatchObject({ ok: false, reason: 'no-transport' });
    const declined = deps({ hosted: new Set(['coder']), external: async () => false });
    expect(await requestHandoff({ app: 'agents' }, declined)).toMatchObject({ ok: false, reason: 'no-transport' });
  });

  it('live deps: a Studio hand-off sets the active view synchronously, as setActiveView did', () => {
    useUiStore.getState().setActiveView('graph');
    void requestHandoff({ app: 'agents', view: 'workflows' });
    expect(useUiStore.getState().activeView).toBe('workflows');
  });
});
