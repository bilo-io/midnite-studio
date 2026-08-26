import { describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT, WIDGET_IDS, isWidgetId } from './widget-ids';
import { ALL_WIDGETS, availableWidgets, needsChurn, renderableWidgets, WIDGETS } from './widget-registry';

describe('the widget registry', () => {
  it('has a spec for every id, with matching ids', () => {
    for (const id of WIDGET_IDS) {
      expect(WIDGETS[id]?.id).toBe(id);
    }
    expect(ALL_WIDGETS).toHaveLength(WIDGET_IDS.length);
  });

  it('places every registered widget on the default board', () => {
    // A widget in the registry but not in DEFAULT_LAYOUT would be invisible
    // until someone found it in the Add-widget menu, and Reset layout would
    // then silently remove it again.
    expect(DEFAULT_LAYOUT.map((item) => item.i).sort()).toEqual([...WIDGET_IDS].sort());
  });

  it('gives every default tile at least its own minimum size', () => {
    for (const item of DEFAULT_LAYOUT) {
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
