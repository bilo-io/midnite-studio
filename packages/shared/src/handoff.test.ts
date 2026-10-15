import { describe, expect, it } from 'vitest';

import { decodeResourceRefParam, resourceRefLink, type ResourceRef } from './domain/resource-ref';
import { SETTINGS_PAGE_IDS, VIEW_IDS } from './domain/view';
import { handoffLink, planHandoff } from './handoff';
import { MEDIA_TABS } from './media';
import { MIDNITE_APP_IDS, parseMidniteLink, type MidniteAppId } from './midnite-link';
import { RESOURCE_LINK_PREFIX } from './domain/resource-ref';
import { studioRevealLinkFromParam } from './studio-link';

const vocab = { views: VIEW_IDS, tabs: MEDIA_TABS, pages: SETTINGS_PAGE_IDS };

const REFS: ResourceRef[] = [
  { kind: 'commit', repoId: 'repo:a', sha: 'abc1234' },
  { kind: 'workflow', id: 'wf-1', runId: 'run-9' },
  { kind: 'media', repoId: 'repo:a', media: 'game', project: 'Ünï/çode ?&=' },
];

describe('handoff builder', () => {
  it('round-trips through parseMidniteLink, ref included', () => {
    for (const ref of REFS) {
      const link = handoffLink({ app: 'coder', view: 'sessions', ref });
      const parsed = parseMidniteLink(link, vocab);
      expect(parsed).toMatchObject({ app: 'coder', view: 'sessions' });
      expect(decodeResourceRefParam(parsed!.ref!)).toEqual(ref);
      // and the reveal link the router forwards to is the one Studio already understands
      expect(studioRevealLinkFromParam(parsed!.ref!)).toBe(resourceRefLink(ref));
      expect(studioRevealLinkFromParam(parsed!.ref!).startsWith(RESOURCE_LINK_PREFIX)).toBe(true);
    }
  });

  it('round-trips every app with and without a ref', () => {
    for (const app of MIDNITE_APP_IDS) {
      expect(parseMidniteLink(handoffLink({ app }), vocab)).toEqual({ app });
      expect(parseMidniteLink(handoffLink({ app, ref: REFS[0]! }), vocab)?.app).toBe(app);
    }
  });

  it('stays backwards compatible: a link without ref parses as before, a hostile ref is dropped', () => {
    expect(parseMidniteLink('midnite://open?app=coder&view=sessions', vocab)).toEqual({ app: 'coder', view: 'sessions' });
    expect(parseMidniteLink('midnite://open?app=coder&ref=%3Cscript%3E', vocab)).toEqual({ app: 'coder' });
    expect(parseMidniteLink(`midnite://open?app=coder&ref=${'a'.repeat(5000)}`, vocab)).toEqual({ app: 'coder' });
  });

  it('plans local for a hosted app and external (with the link) otherwise', () => {
    const request = { app: 'agents', view: 'workflows', ref: REFS[1]! } as const;
    const all = new Set<MidniteAppId>(MIDNITE_APP_IDS);
    expect(planHandoff(request, all)).toEqual({ kind: 'local', request });
    const onlyCoder = new Set<MidniteAppId>(['coder']);
    expect(planHandoff(request, onlyCoder)).toEqual({ kind: 'external', link: handoffLink(request) });
  });
});
