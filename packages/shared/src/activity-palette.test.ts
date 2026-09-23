import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_PRESET_ORDER,
  ACTIVITY_PRESETS,
  ACTIVITY_STATUSES,
  ActivityPaletteSchema,
  ActivityStatusSchema,
  DEFAULT_ACTIVITY_PALETTE_ID,
  resolveActivityStatusStyle,
} from './activity-palette';

describe('ActivityStatusSchema', () => {
  it('carries exactly the nine statuses the phase doc names', () => {
    expect(ACTIVITY_STATUSES).toEqual([
      'agent',
      'shell',
      'thinking',
      'waiting',
      'running',
      'queued',
      'done',
      'failed',
      'idle',
    ]);
  });

  it('rejects an unknown status', () => {
    expect(ActivityStatusSchema.safeParse('busy').success).toBe(false);
  });
});

describe('ActivityPaletteSchema — round-trip', () => {
  it('parses every built-in preset', () => {
    for (const preset of Object.values(ACTIVITY_PRESETS)) {
      const parsed = ActivityPaletteSchema.parse(preset);
      expect(parsed.id).toBe(preset.id);
    }
  });

  it('accepts a palette that restates only a subset of statuses', () => {
    const partial = ActivityPaletteSchema.parse({
      id: 'partial',
      label: 'Partial',
      statuses: { waiting: { color: { kind: 'solid', color: '#f59e0b' } } },
    });
    expect(partial.statuses.waiting?.color).toEqual({ kind: 'solid', color: '#f59e0b' });
    expect(partial.statuses.agent).toBeUndefined();
  });

  it('rejects a gradient with fewer than two stops', () => {
    const result = ActivityPaletteSchema.safeParse({
      id: 'bad',
      label: 'Bad',
      statuses: { agent: { color: { kind: 'gradient', stops: ['#fff'] } } },
    });
    expect(result.success).toBe(false);
  });

  it('applies speed/intensity defaults', () => {
    const parsed = ActivityPaletteSchema.parse({
      id: 'defaults',
      label: 'Defaults',
      statuses: { done: { color: { kind: 'solid', color: 'hsl(var(--success))' } } },
    });
    expect(parsed.statuses.done).toEqual({
      color: { kind: 'solid', color: 'hsl(var(--success))' },
      speed: 4,
      intensity: 0.5,
    });
  });
});

describe('preset resolution', () => {
  it('defaults to Brand', () => {
    expect(DEFAULT_ACTIVITY_PALETTE_ID).toBe('brand');
    expect(ACTIVITY_PRESETS[DEFAULT_ACTIVITY_PALETTE_ID]?.label).toBe('Brand');
  });

  it('lists every built-in preset in ACTIVITY_PRESET_ORDER, Brand first', () => {
    expect(ACTIVITY_PRESET_ORDER[0]).toBe('brand');
    for (const id of ACTIVITY_PRESET_ORDER) {
      expect(ACTIVITY_PRESETS[id]).toBeDefined();
    }
    expect(ACTIVITY_PRESET_ORDER).toHaveLength(Object.keys(ACTIVITY_PRESETS).length);
  });

  it('defines every one of the nine statuses on every built-in preset', () => {
    for (const preset of Object.values(ACTIVITY_PRESETS)) {
      for (const status of ACTIVITY_STATUSES) {
        expect(resolveActivityStatusStyle(preset, status)).toBeDefined();
      }
    }
  });

  it('falls back to Brand for a status a custom palette omits', () => {
    const custom = ActivityPaletteSchema.parse({ id: 'custom', label: 'Custom', statuses: {} });
    const brandAgent = ACTIVITY_PRESETS.brand?.statuses.agent;
    expect(resolveActivityStatusStyle(custom, 'agent')).toEqual(brandAgent);
  });

  it("Rainbow's agent ring is byte-identical to --rainbow-ramp's six stops, closed", () => {
    const rainbow = ACTIVITY_PRESETS.rainbow;
    expect(rainbow?.statuses.agent?.color).toEqual({
      kind: 'gradient',
      stops: ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e'],
    });
  });

  it('keeps the seven semantic statuses identical across every preset — only agent/thinking vary', () => {
    const presets = Object.values(ACTIVITY_PRESETS);
    for (const status of ['waiting', 'running', 'queued', 'done', 'failed', 'idle'] as const) {
      const [first, ...rest] = presets;
      for (const preset of rest) {
        expect(resolveActivityStatusStyle(preset, status)).toEqual(
          first ? resolveActivityStatusStyle(first, status) : undefined,
        );
      }
    }
  });

  it('waiting is the app-wide amber literal, not a theme token', () => {
    for (const preset of Object.values(ACTIVITY_PRESETS)) {
      expect(resolveActivityStatusStyle(preset, 'waiting').color).toEqual({
        kind: 'solid',
        color: '#f59e0b',
      });
    }
  });

  it('shell wears the same metallic ring in every preset', () => {
    const stops = ['#f5f5f5', '#9ca3af', '#e5e7eb', '#6b7280', '#f5f5f5'];
    for (const preset of Object.values(ACTIVITY_PRESETS)) {
      expect(resolveActivityStatusStyle(preset, 'shell').color).toEqual({ kind: 'gradient', stops });
    }
  });
});
