import { describe, expect, it } from 'vitest';

import {
  AGENTS_LAYOUT,
  DEFAULT_LAYOUT,
  GIT_WIDGET_IDS,
  NEW_DASHBOARD_LAYOUT,
  WIDGET_DEFAULT_SIZE,
  WIDGET_IDS,
  isWidgetId,
} from './widget-ids';
import {
  ALL_WIDGETS,
  availableWidgets,
  needsChurn,
  renderableWidgets,
  groupWidgets,
  WIDGETS,
} from './widget-registry';

describe('the widget registry', () => {
  it('has a spec for every id, with matching ids', () => {
    for (const id of WIDGET_IDS) {
      expect(WIDGETS[id]?.id).toBe(id);
    }
    expect(ALL_WIDGETS).toHaveLength(WIDGET_IDS.length);
  });

  it('places every git widget on the Git dashboard\u2019s default board', () => {
    // A git widget in the registry but not in DEFAULT_LAYOUT would be invisible
    // until someone found it in the picker, and Reset layout would then
    // silently remove it again.
    expect(DEFAULT_LAYOUT.map((item) => item.i).sort()).toEqual([...GIT_WIDGET_IDS].sort());
  });

  it('seeds the Agents dashboard with agent cards only', () => {
    expect(AGENTS_LAYOUT.length).toBeGreaterThan(0);
    for (const item of AGENTS_LAYOUT) expect(WIDGETS[item.i].category).toBe('agents');
  });

  it('gives every widget a default size that honours its own minimum', () => {
    for (const id of WIDGET_IDS) {
      expect(WIDGET_DEFAULT_SIZE[id].w).toBeGreaterThanOrEqual(WIDGETS[id].minW);
      expect(WIDGET_DEFAULT_SIZE[id].h).toBeGreaterThanOrEqual(WIDGETS[id].minH);
    }
  });

  it('gives every default tile at least its own minimum size', () => {
    for (const item of [...DEFAULT_LAYOUT, ...AGENTS_LAYOUT, ...NEW_DASHBOARD_LAYOUT]) {
      const spec = WIDGETS[item.i];
      expect(item.w).toBeGreaterThanOrEqual(spec.minW);
      expect(item.h).toBeGreaterThanOrEqual(spec.minH);
    }
  });
});

describe('isWidgetId', () => {
  it('accepts a known id and rejects a stale one', () => {
    expect(isWidgetId('calendar')).toBe(true);
    expect(isWidgetId('a-widget-we-deleted')).toBe(false);
  });
});

describe('availableWidgets', () => {
  it('offers everything when the repo has a GitHub remote', () => {
    expect(availableWidgets(true)).toHaveLength(WIDGET_IDS.length);
  });

  it('removes the forge widgets entirely for a repo with no GitHub remote', () => {
    // Not "renders an error tile" — the phase's rule is that a widget which can
    // only ever be empty is not offered at all.
    const ids = availableWidgets(false).map((spec) => spec.id);
    expect(ids).not.toContain('pulls');
    expect(ids).not.toContain('issues');
    expect(ids).not.toContain('runs');
    expect(ids).toContain('calendar');
    expect(ids).toContain('health');
  });
});

describe('renderableWidgets', () => {
  it('renders a saved board in its saved order', () => {
    const specs = renderableWidgets(['health', 'calendar'], true);
    expect(specs.map((spec) => spec.id)).toEqual(['health', 'calendar']);
  });

  it('drops an id the registry no longer knows', () => {
    // A board persisted before a widget was removed must not crash the view.
    const specs = renderableWidgets(['calendar', 'retired-widget'], true);
    expect(specs.map((spec) => spec.id)).toEqual(['calendar']);
  });

  it('drops forge widgets when the repo has no forge', () => {
    // The case that matters is switching FROM a GitHub repo TO a local one:
    // the saved board still names three forge tiles, and they must not render
    // as three permanently empty boxes.
    const specs = renderableWidgets(['calendar', 'pulls', 'issues', 'runs'], false);
    expect(specs.map((spec) => spec.id)).toEqual(['calendar']);
  });
});

describe('needsChurn', () => {
  it('is false for a board with no widget that reads insertions or deletions', () => {
    // `--numstat` makes git diff every commit rather than just read it, so a
    // board that cannot show the numbers must not pay for them.
    expect(needsChurn(['calendar', 'activity', 'health'])).toBe(false);
  });

  it('is true once the contributor table is on the board', () => {
    expect(needsChurn(['calendar', 'contributors'])).toBe(true);
  });
});

describe('groupWidgets', () => {
  it('groups by category in picker order', () => {
    const groups = groupWidgets(ALL_WIDGETS, '');
    expect(groups.map((g) => g.category)).toEqual(['git', 'agents', 'finance', 'datetime', 'productivity']);
    expect(groups.flatMap((g) => g.specs)).toHaveLength(ALL_WIDGETS.length);
  });

  it('filters on title and description, case-insensitively, dropping empty groups', () => {
    const groups = groupWidgets(ALL_WIDGETS, 'LOOP');
    expect(groups.map((g) => g.category)).toEqual(['agents']);
    expect(groups[0]?.specs.map((s) => s.id)).toContain('loop-runs');
    expect(groupWidgets(ALL_WIDGETS, 'zzzz-nothing')).toEqual([]);
  });

  it('hides forge widgets from a repo with no forge remote but keeps repo-free ones', () => {
    const ids = availableWidgets(false).map((s) => s.id);
    expect(ids).not.toContain('pulls');
    expect(ids).toContain('live-sessions');
    expect(ids).toContain('clock');
  });
});
