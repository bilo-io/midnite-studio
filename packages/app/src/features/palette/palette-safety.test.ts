import { COMMAND_IDS, COMMANDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { COMMAND_ACCESS, PALETTE_SAFE, isIdDispatchOk, isPaletteSafe } from './safety';

describe('palette safety allowlist', () => {
  it('allows known safe commands', () => {
    expect(isPaletteSafe('repo.open')).toBe(true);
    expect(isPaletteSafe('sync.pull')).toBe(true);
    expect(isPaletteSafe('palette.open')).toBe(true);
    expect(isPaletteSafe('file.save')).toBe(true);
  });

  // Phase 58 Theme F: chord-free, so the palette is its only keyboard route.
  it('allows notes.toggle, which has no chord of its own', () => {
    expect(isPaletteSafe('notes.toggle')).toBe(true);
    expect(COMMANDS.find((c) => c.id === 'notes.toggle')).toMatchObject({
      label: 'Notes',
      group: 'view',
    });
    expect(COMMANDS.find((c) => c.id === 'notes.toggle')).not.toHaveProperty('chord');
  });

  it('contains no destructive or reset/operation family commands', () => {
    // Operation commands like op.abort and op.continue are not safe / unbound
    expect(PALETTE_SAFE).not.toContain('op.abort');
    expect(PALETTE_SAFE).not.toContain('op.continue');

    for (const cmdId of PALETTE_SAFE) {
      expect(cmdId.startsWith('op.')).toBe(false);
      expect(cmdId.startsWith('reset.')).toBe(false);
      expect(cmdId.startsWith('delete.')).toBe(false);
      expect(cmdId).not.toMatch(/abort|continue|reset|delete|force/i);
    }
  });

  it('every entry in PALETTE_SAFE corresponds to a real declared CommandId in COMMANDS', () => {
    const declaredIds = new Set(COMMANDS.map((c) => c.id));
    for (const safeId of PALETTE_SAFE) {
      expect(declaredIds.has(safeId)).toBe(true);
    }
  });

  // Phase 32 Theme G: DevTools is inspection-only, the same recoverability
  // class as `browser.openDevServer`; clearing browsing data destroys every
  // logged-in session in the `persist:browser` partition and must stay a
  // confirm-gated settings/palette-hidden action, never a one-keystroke one.
  it('allows browser.devtools but not browser.clearData', () => {
    expect(isPaletteSafe('browser.devtools')).toBe(true);
    expect(isPaletteSafe('browser.clearData')).toBe(false);
  });
});

// Phase 81 Theme A: COMMAND_ACCESS is the companion's own allowlist, layered
// on top of PALETTE_SAFE — "no wider than the palette, except by id".
describe('COMMAND_ACCESS', () => {
  it('is total over every declared CommandId', () => {
    expect(Object.keys(COMMAND_ACCESS).length).toBe(COMMAND_IDS.length);
    for (const id of COMMAND_IDS) {
      expect(COMMAND_ACCESS[id]).toMatch(/^(direct|confirm|never)$/);
    }
  });

  it('every direct/confirm id is in PALETTE_SAFE or the ID_DISPATCH_OK carve-out', () => {
    for (const id of COMMAND_IDS) {
      const access = COMMAND_ACCESS[id];
      if (access === 'direct' || access === 'confirm') {
        expect(isPaletteSafe(id) || isIdDispatchOk(id)).toBe(true);
      }
    }
  });

  it('everything outside PALETTE_SAFE and ID_DISPATCH_OK is never', () => {
    for (const id of COMMAND_IDS) {
      if (isPaletteSafe(id) || isIdDispatchOk(id)) continue;
      expect(COMMAND_ACCESS[id]).toBe('never');
    }
  });

  // Named explicitly, per the phase doc's own acceptance test.
  it.each(['browser.clearData', 'companion.toggle', 'op.abort', 'op.continue'] as const)(
    '%s is never',
    (id) => {
      expect(COMMAND_ACCESS[id]).toBe('never');
    },
  );

  // Decision 14, open for a human: sync.pull stays confirm for now.
  it('sync.pull is confirm (Decision 14, open for review)', () => {
    expect(COMMAND_ACCESS['sync.pull']).toBe('confirm');
  });

  // A deliberate narrowing of Decision 5's prose — see safety.ts's own
  // docblock: the companion reaches every view through the navigate intent
  // (ViewId), never by re-running the view.* CommandId a second time.
  it.each(['view.graph', 'view.files', 'view.issues', 'view.video', 'view.apiClient'] as const)(
    '%s is never — reached only via the navigate intent, not run',
    (id) => {
      expect(COMMAND_ACCESS[id]).toBe('never');
    },
  );

  it('carries no CommandId the companion cannot dispatch (COMMAND_IDS coverage)', () => {
    const ids = new Set(COMMAND_IDS);
    for (const id of Object.keys(COMMAND_ACCESS)) {
      expect(ids.has(id as (typeof COMMAND_IDS)[number])).toBe(true);
    }
  });
});
