import { describe, expect, it } from 'vitest';

import { capabilitiesFor, ForgeCapabilityLevelSchema, ForgeCapabilitySchema } from './forge-account';
import { ForgeKindSchema } from './remote';

/**
 * Phase 90 Theme H's own acceptance criterion: "the capability matrix is
 * exhaustive over `ForgeKind` — adding a member fails the build." The
 * `Record<ForgeKind, ForgeCapability>` in `forge-account.ts` already fails
 * `moon run :typecheck` if a new `ForgeKind` has no matching key; this file
 * is the runtime half of that guarantee — the key set actually reachable at
 * runtime never drifts from the schema's own `.options`, which is what a
 * `Record` type alone cannot catch (a stray extra key, a typo'd kind) and
 * what a reviewer skimming a diff easily could.
 */
describe('capabilitiesFor — exhaustive over ForgeKind', () => {
  it('answers every kind the schema declares, and nothing else', () => {
    for (const kind of ForgeKindSchema.options) {
      expect(() => capabilitiesFor(kind)).not.toThrow();
      expect(ForgeCapabilitySchema.safeParse(capabilitiesFor(kind)).success).toBe(true);
    }
  });

  it('every field of every capability is a real tri-state level', () => {
    for (const kind of ForgeKindSchema.options) {
      for (const level of Object.values(capabilitiesFor(kind))) {
        expect(ForgeCapabilityLevelSchema.safeParse(level).success).toBe(true);
      }
    }
  });

  it('reports full capability for github — Theme D shipped its adapter', () => {
    const capability = capabilitiesFor('github');
    expect(Object.values(capability).every((level) => level === 'full')).toBe(true);
  });

  it('reports no capability for every kind with no adapter yet', () => {
    for (const kind of ForgeKindSchema.options) {
      if (kind === 'github' || kind === 'bitbucket') continue;
      const capability = capabilitiesFor(kind);
      expect(Object.values(capability).every((level) => level === 'none')).toBe(true);
    }
  });

  /**
   * Bitbucket (Theme F) is the first provider to land a genuinely mixed row
   * — the `'partial'` capability Theme H's own deferred item was waiting on.
   */
  it('reports Bitbucket as mostly full, with no boards and a partial thread model', () => {
    const capability = capabilitiesFor('bitbucket');
    expect(capability.projects).toBe('none');
    expect(capability.threadResolution).toBe('partial');
    const rest = { ...capability };
    delete (rest as Record<string, unknown>)['projects'];
    delete (rest as Record<string, unknown>)['threadResolution'];
    expect(Object.values(rest).every((level) => level === 'full')).toBe(true);
  });
});
