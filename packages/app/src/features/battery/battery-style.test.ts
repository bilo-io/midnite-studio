import { describe, expect, it } from 'vitest';
import {
  getBatteryFlashClass,
  getBatteryFlashTier,
  getBatteryTier,
  getBatteryTierClasses,
} from './battery-style';

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

describe('battery flash tier', () => {
  it('does not flash at or above 30%', () => {
    expect(getBatteryFlashTier(100)).toBe('none');
    expect(getBatteryFlashTier(30)).toBe('none');
    expect(getBatteryFlashClass('none')).toBe('');
  });

  it('flashes slowly between 20% and 29%', () => {
    expect(getBatteryFlashTier(29)).toBe('slow');
    expect(getBatteryFlashTier(20)).toBe('slow');
    expect(getBatteryFlashClass('slow')).toBe('battery-flash-slow');
  });

  it('flashes faster between 10% and 19%', () => {
    expect(getBatteryFlashTier(19)).toBe('medium');
    expect(getBatteryFlashTier(10)).toBe('medium');
    expect(getBatteryFlashClass('medium')).toBe('battery-flash-medium');
  });

  it('flashes fastest below 10%', () => {
    expect(getBatteryFlashTier(9)).toBe('fast');
    expect(getBatteryFlashTier(0)).toBe('fast');
    expect(getBatteryFlashClass('fast')).toBe('battery-flash-fast');
  });
});
