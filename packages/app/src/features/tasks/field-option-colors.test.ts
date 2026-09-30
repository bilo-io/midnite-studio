import { describe, expect, it } from 'vitest';

import { fieldOptionChipStyle, fieldOptionColor } from './field-option-colors';

describe('fieldOptionColor', () => {
  it('maps standard GitHub single-select color names to hex codes', () => {
    expect(fieldOptionColor('GREEN')).toBe('#22C55E');
    expect(fieldOptionColor('BLUE')).toBe('#3B82F6');
    expect(fieldOptionColor('PURPLE')).toBe('#A855F7');
    expect(fieldOptionColor('RED')).toBe('#EF4444');
    expect(fieldOptionColor('YELLOW')).toBe('#EAB308');
    expect(fieldOptionColor('ORANGE')).toBe('#F97316');
    expect(fieldOptionColor('GRAY')).toBe('#9CA3AF');
    expect(fieldOptionColor('PINK')).toBe('#EC4899');
  });

  it('handles lowercase or mixed-case color names', () => {
    expect(fieldOptionColor('green')).toBe('#22C55E');
    expect(fieldOptionColor('Blue')).toBe('#3B82F6');
  });

  it('falls back to common status names when color is missing or matches status', () => {
    expect(fieldOptionColor('Done')).toBe('#22C55E');
    expect(fieldOptionColor('In Progress')).toBe('#3B82F6');
    expect(fieldOptionColor('In Review')).toBe('#A855F7');
    expect(fieldOptionColor('Todo')).toBe('#9CA3AF');
  });

  it('preserves existing hex color values', () => {
    expect(fieldOptionColor('#123456')).toBe('#123456');
  });

  it('falls back to neutral grey for unknown colors or empty values', () => {
    expect(fieldOptionColor('')).toBe('#8B8B95');
    expect(fieldOptionColor(null)).toBe('#8B8B95');
    expect(fieldOptionColor(undefined)).toBe('#8B8B95');
    expect(fieldOptionColor('nonexistent_color')).toBe('#8B8B95');
  });
});

describe('fieldOptionChipStyle', () => {
  it('returns color, background tint with opacity, and border', () => {
    const style = fieldOptionChipStyle('GREEN');
    expect(style.color).toBe('#22C55E');
    expect(style.backgroundColor).toBe('#22C55E1A');
    expect(style.borderColor).toBe('#22C55E55');
  });
});
