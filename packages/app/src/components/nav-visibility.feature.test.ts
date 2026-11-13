// vitest/node: pure helpers over the toggle table.
import { describe, expect, it, vi } from 'vitest';

import { FEATURE_OFF_REASON } from '@midnite/studio-shared';

import { effectiveNavVisibility, featureCommandOffReason, withFeatureToggles } from './nav-visibility';

describe('nav visibility with feature toggles (Phase 135 Theme C)', () => {
  it("hides a switched-off feature's views and keeps the user's own choices", () => {
    const user = { graph: false } as const;
    expect(effectiveNavVisibility(user, [])).toBe(user);
    const next = effectiveNavVisibility(user, ['chats', 'forge']);
    expect(next).toMatchObject({ graph: false, chats: false, reviews: false, actions: false });
    expect(next.notes).toBeUndefined();
  });

  it('disables a feature-off command, and one that navigates to a feature-off view', () => {
    expect(featureCommandOffReason(['notes'], 'notes.toggle')).toBe(FEATURE_OFF_REASON);
    expect(featureCommandOffReason(['media'], 'view.video')).toBe(FEATURE_OFF_REASON);
    expect(featureCommandOffReason(['media'], 'view.graph')).toBeUndefined();
    const run = vi.fn();
    const runtime = { 'view.chats': { enabled: true, run }, 'view.graph': { enabled: true, run } } as never;
    const gated = withFeatureToggles(['chats'], runtime) as Record<string, { enabled: boolean; disabledReason?: string }>;
    expect(gated['view.chats']).toMatchObject({ enabled: false, disabledReason: FEATURE_OFF_REASON });
    expect(gated['view.graph']?.enabled).toBe(true);
  });
});
