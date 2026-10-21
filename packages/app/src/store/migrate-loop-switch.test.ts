import { describe, expect, it } from 'vitest';

import { migrateLoopSwitch } from './migrate-loop-switch';

describe('migrateLoopSwitch', () => {
  it('turns an explicit repeat into loopEnabled and removes it from the run options', () => {
    const out = migrateLoopSwitch({
      loopRunOptions: { guard: { repeat: false, autoRotatePercent: 50 }, medic: { repeat: true } },
    });
    expect(out.loopEnabled).toEqual({ guard: false, medic: true });
    expect(out.loopRunOptions).toEqual({ guard: { autoRotatePercent: 50 }, medic: {} });
  });

  it('drops an old cosmetic loopEnabled so it resolves on', () => {
    const out = migrateLoopSwitch({
      loopEnabled: { guard: false, automate: true },
      loopRunOptions: { automate: { reviewUsers: ['ada'] } },
    });
    expect(out.loopEnabled).toEqual({});
  });

  it('lets repeat win over a conflicting old loopEnabled', () => {
    const out = migrateLoopSwitch({
      loopEnabled: { guard: true },
      loopRunOptions: { guard: { repeat: false } },
    });
    expect(out.loopEnabled).toEqual({ guard: false });
  });

  it('survives a profile with neither field', () => {
    expect(migrateLoopSwitch({}).loopEnabled).toEqual({});
  });
});
