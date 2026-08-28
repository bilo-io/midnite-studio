import { COMMANDS, type CommandId } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { PALETTE_SAFE, isPaletteSafe } from './safety';

describe('palette safety allowlist', () => {
  it('allows known safe commands', () => {
    expect(isPaletteSafe('repo.open')).toBe(true);
    expect(isPaletteSafe('sync.pull')).toBe(true);
    expect(isPaletteSafe('palette.open')).toBe(true);
    expect(isPaletteSafe('file.save')).toBe(true);
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
});
