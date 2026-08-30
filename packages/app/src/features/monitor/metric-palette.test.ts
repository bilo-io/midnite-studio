import { METRIC_IDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { METRIC_LABELS, metricColor, metricFill, metricGlow, metricHsl, metricMuted } from './metric-palette';

describe('metric palette', () => {
  it('gives every metric a colour and a label', () => {
    for (const id of METRIC_IDS) {
      expect(metricColor(id)).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
      expect(METRIC_LABELS[id]).toBeTruthy();
    }
  });

  it('uses a distinct hue per metric, so a 2px sparkline is still identifiable', () => {
    const hues = METRIC_IDS.map((id) => metricHsl(id)[0]);
    expect(new Set(hues).size).toBe(METRIC_IDS.length);
  });

  it('keeps adjacent hues far enough apart to tell apart at footer scale', () => {
    const sorted = METRIC_IDS.map((id) => metricHsl(id)[0]).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(40);
    }
  });

  it('holds every colour in the band that reads on both the light and dark ground', () => {
    // The lane-colors.ts policy: one palette serves both themes, so switching
    // theme changes the drawing rather than re-identifying the series.
    for (const id of METRIC_IDS) {
      const [, saturation, lightness] = metricHsl(id);
      expect(lightness).toBeGreaterThanOrEqual(45);
      expect(lightness).toBeLessThanOrEqual(68);
      expect(saturation).toBeGreaterThanOrEqual(55);
    }
  });

  it('derives the muted variant from the hue rather than hand-tuning a second table', () => {
    for (const id of METRIC_IDS) {
      const [hue] = metricHsl(id);
      // Same hue: a metric stays recognisably itself when it is not the one
      // being read.
      expect(metricMuted(id)).toContain(`hsl(${hue} `);
      expect(metricMuted(id)).not.toBe(metricColor(id));
    }
  });

  it('derives the area fill as the same colour at an alpha, not a lighter one', () => {
    // Alpha rather than lightness is what lets three stacked areas read as
    // overlapping instead of as whichever painted last.
    expect(metricFill('cpu', 0.16)).toBe('hsl(210 90% 58% / 0.16)');
  });

  it('builds the dot glow from the metric it belongs to', () => {
    expect(metricGlow('gpu')).toContain('0 0 8px');
    expect(metricGlow('gpu')).toContain(`hsl(${metricHsl('gpu')[0]} `);
  });
});
