import { describe, expect, it } from 'vitest';

import {
  capabilitiesFor,
  ForgeCapabilityLevelSchema,
  ForgeCapabilityOpsSchema,
  ForgeCapabilitySchema,
} from './forge-account';
import { ForgeKindSchema } from './remote';

/** `ForgeCapability`'s tri-state fields — everything but `ops` (Phase 95
 *  Theme D), which is its own boolean record and not a `ForgeCapabilityLevel`. */
function levelFields(capability: ReturnType<typeof capabilitiesFor>): Record<string, unknown> {
  const { ops: _ops, ...rest } = capability;
  return rest;
}

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

  it('every tri-state field of every capability is a real level', () => {
    for (const kind of ForgeKindSchema.options) {
      for (const level of Object.values(levelFields(capabilitiesFor(kind)))) {
        expect(ForgeCapabilityLevelSchema.safeParse(level).success).toBe(true);
      }
    }
  });

  it('every capability carries a well-formed per-operation ops record', () => {
    for (const kind of ForgeKindSchema.options) {
      expect(ForgeCapabilityOpsSchema.safeParse(capabilitiesFor(kind).ops).success).toBe(true);
    }
  });

  it('reports full capability for github — Theme D shipped its adapter', () => {
    const capability = capabilitiesFor('github');
    expect(Object.values(levelFields(capability)).every((level) => level === 'full')).toBe(true);
    expect(Object.values(capability.ops).every((op) => op === true)).toBe(true);
  });

  it('reports a real, non-`none` row for gitlab — Theme E shipped its adapter', () => {
    const capability = capabilitiesFor('gitlab');
    expect(capability.pulls).toBe('full');
    expect(capability.issues).toBe('full');
    expect(capability.checks).toBe('full');
    expect(capability.threadResolution).toBe('full');
    expect(capability.repoListing).toBe('full');
    // GitLab has no `CHANGES_REQUESTED` at all — the phase doc's own Decisions.
    expect(capability.requestChanges).toBe('none');
    // Issue Boards are real but narrower than ProjectV2 — one synthetic field.
    expect(capability.projects).toBe('partial');
  });

  it('reports no capability for every kind with no adapter at all', () => {
    for (const kind of ForgeKindSchema.options) {
      if (kind === 'github' || kind === 'gitlab' || kind === 'bitbucket' || kind === 'azure') continue;
      const capability = capabilitiesFor(kind);
      expect(Object.values(levelFields(capability)).every((level) => level === 'none')).toBe(true);
      expect(Object.values(capability.ops).every((op) => op === false)).toBe(true);
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
    const rest = levelFields(capability);
    delete (rest as Record<string, unknown>)['projects'];
    delete (rest as Record<string, unknown>)['threadResolution'];
    expect(Object.values(rest).every((level) => level === 'full')).toBe(true);
    // Issue CRUD and the body-fallback link, nothing board-shaped (Theme D).
    expect(capability.ops).toMatchObject({
      createIssue: true,
      editIssue: true,
      deleteIssue: true,
      linkBlockedBy: true,
      createProject: false,
      addProjectItem: false,
      linkSubIssue: false,
    });
  });

  /**
   * Azure DevOps (Theme G) is the third provider to land, and the third
   * `'partial'` case — a real numeric review vote with no attached review
   * body of its own, see `AZURE_CAPABILITY`'s own docblock.
   */
  it('reports Azure DevOps as mostly full, with a partial request-changes model', () => {
    const capability = capabilitiesFor('azure');
    expect(capability.requestChanges).toBe('partial');
    expect(capability.projects).toBe('full');
    const rest = levelFields(capability);
    delete (rest as Record<string, unknown>)['requestChanges'];
    expect(Object.values(rest).every((level) => level === 'full')).toBe(true);
    // `projects: 'full'` is a *read* fact (Boards Columns) — Theme D still
    // ships no board-write for Azure, only issue CRUD and the body fallback.
    expect(capability.ops).toMatchObject({
      createIssue: true,
      editIssue: true,
      deleteIssue: true,
      linkBlockedBy: true,
      createProject: false,
      addProjectItem: false,
      linkSubIssue: false,
    });
  });

  it("GitLab's ops mirror Bitbucket/Azure — issue CRUD and body-fallback links, no board writes", () => {
    const capability = capabilitiesFor('gitlab');
    expect(capability.ops).toMatchObject({
      createIssue: true,
      editIssue: true,
      deleteIssue: true,
      linkBlockedBy: true,
      createProject: false,
      editProject: false,
      deleteProject: false,
      addProjectItem: false,
      removeProjectItem: false,
      linkSubIssue: false,
    });
  });
});
