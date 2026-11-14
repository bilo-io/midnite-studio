import { describe, expect, it } from 'vitest';

import { effectiveStep, nudgeDistance, snapValue, stepAlong, GRID_STEPS } from './snap';
import { TRANSFORM_MODES, transformModeForKey } from './transform-mode-bar';

describe('viewport3d snap maths (shared by Models and the level editor)', () => {
  it('snaps to a step, leaves a value alone with step 0', () => {
    expect(snapValue(1.26, 0.25)).toBe(1.25);
    expect(snapValue(1.26, 0)).toBe(1.26);
  });
  it('walks the step list clamped at the ends', () => {
    expect(stepAlong(GRID_STEPS, 1, 1)).toBe(1);
    expect(stepAlong(GRID_STEPS, 0, -1)).toBe(0);
    expect(stepAlong(GRID_STEPS, 0.1, 1)).toBe(0.25);
  });
  it('Shift flips snapping and multiplies a nudge by ten', () => {
    expect(effectiveStep(0.5, true, 0.1)).toBe(0);
    expect(effectiveStep(0, true, 0.1)).toBe(0.1);
    expect(nudgeDistance(0, true)).toBe(1);
  });
});

describe('transform modes', () => {
  it('maps W/E/R to translate/rotate/scale in either case, anything else to null', () => {
    expect(TRANSFORM_MODES.map((m) => m.key)).toEqual(['W', 'E', 'R']);
    expect(transformModeForKey('w')).toBe('translate');
    expect(transformModeForKey('E')).toBe('rotate');
    expect(transformModeForKey('r')).toBe('scale');
    expect(transformModeForKey('q')).toBeNull();
  });
});
