import { describe, expect, it } from 'vitest';

import { suiteSegments, type AppPanels } from './suite-segments';

const El = () => null;
const ALL: AppPanels = { terminal: El, palette: El, monitor: El, notifications: El, assistant: El };

describe('suiteSegments', () => {
  it('returns the five suite segments, in order, at today’s priorities', () => {
    expect(suiteSegments(ALL).map((s) => [s.id, s.zone, s.group, s.priority])).toEqual([
      ['terminal-toggle', 'left', 'shortcuts', 20],
      ['palette-toggle', 'left', 'shortcuts', 40],
      ['monitor', 'right', 'machine', 42],
      ['notification-bell', 'right', 'alerts', 50],
      ['assistant-menu', 'right', 'alerts', 60],
    ]);
  });

  it('drops a segment whose panel is absent and leaves the rest’s priorities alone', () => {
    const segments = suiteSegments({ ...ALL, terminal: false });
    expect(segments.map((s) => s.id)).not.toContain('terminal-toggle');
    expect(Object.fromEntries(segments.map((s) => [s.id, s.priority]))).toEqual({
      'palette-toggle': 40,
      monitor: 42,
      'notification-bell': 50,
      'assistant-menu': 60,
    });
    expect(suiteSegments({}).length).toBe(0);
  });
});
