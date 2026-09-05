import { EcosystemSchema, METRIC_IDS, ScanCategorySchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { metricHsl } from '../monitor/metric-palette';
import {
  CATEGORY_HUES,
  CATEGORY_ORDER,
  ECOSYSTEM_HUES,
  ECOSYSTEM_ORDER,
} from './category-palette';

/** Shortest arc between two hues on the 360°-wrapping colour circle. */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

describe('category-palette hue separation', () => {
  const categoryHues = Object.values(CATEGORY_HUES).map(([h]) => h);
  // `metric-palette.ts` stays unchanged (its own `METRIC_HUES` is not
  // exported) — read through the public `metricHsl` accessor instead, over
  // every id `METRIC_IDS` names.
  const metricHues = METRIC_IDS.map((id) => metricHsl(id)[0]);

  it('holds every ECOSYSTEM_HUES hue ≥12° from every CATEGORY_HUES and METRIC_HUES hue', () => {
    for (const [ecosystem, [ecoHue]] of Object.entries(ECOSYSTEM_HUES)) {
      for (const hue of [...categoryHues, ...metricHues]) {
        expect(hueDistance(ecoHue, hue), `${ecosystem} (${ecoHue}) vs ${hue}`).toBeGreaterThanOrEqual(
          12,
        );
      }
    }
  });

  it('ECOSYSTEM_ORDER is a permutation of EcosystemSchema.options', () => {
    expect(ECOSYSTEM_ORDER.slice().sort()).toEqual(EcosystemSchema.options.slice().sort());
  });

  it('CATEGORY_ORDER is a permutation of ScanCategorySchema.options', () => {
    expect(CATEGORY_ORDER.slice().sort()).toEqual(ScanCategorySchema.options.slice().sort());
  });
});
