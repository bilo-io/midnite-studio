import { describe, expect, it } from 'vitest';
import { getBatteryTier, getBatteryTierClasses } from './battery-style';

describe('battery-style', () => {
  it('returns high/green for >= 70%', () => {
    expect(getBatteryTier(100)).toBe('high');
    expect(getBatteryTier(70)).toBe('high');
    expect(getBatteryTier(70.4)).toBe('high');
    const classes = getBatteryTierClasses('high');
    expect(classes.textClass).toContain('emerald');
    expect(classes.glowStyle).toBeUndefined();
  });

  it('returns medium/orange for 30% - 69%', () => {
    expect(getBatteryTier(69)).toBe('medium');
    expect(getBatteryTier(50)).toBe('medium');
    expect(getBatteryTier(30)).toBe('medium');
    const classes = getBatteryTierClasses('medium');
    expect(classes.textClass).toContain('amber');
    expect(classes.glowStyle).toBeUndefined();
  });

  it('returns low/red with glow for < 30%', () => {
    expect(getBatteryTier(29)).toBe('low');
    expect(getBatteryTier(15)).toBe('low');
    expect(getBatteryTier(0)).toBe('low');
    const classes = getBatteryTierClasses('low');
    expect(classes.textClass).toContain('rose');
    expect(classes.glowStyle).toBeDefined();
    expect(classes.glowStyle?.textShadow).toBeDefined();
    expect(classes.glowStyle?.filter).toBeDefined();
  });
});
