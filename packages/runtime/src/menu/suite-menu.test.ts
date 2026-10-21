import { describe, expect, it, vi } from 'vitest';

import { buildSuiteMenuTemplate } from './suite-menu';

describe('buildSuiteMenuTemplate', () => {
  it('carries the standard roles in order, ending in Help', () => {
    const t = buildSuiteMenuTemplate({ reportItem: { label: 'Report an Issue…' } });
    expect(t.map((m) => m.role)).toEqual(['appMenu', 'editMenu', 'viewMenu', 'windowMenu', 'help']);
  });

  it('puts the report item first in Help, then the caller items', () => {
    const click = vi.fn();
    const t = buildSuiteMenuTemplate({
      reportItem: { label: 'Report an Issue…', click },
      helpItems: [{ label: 'Docs' }],
    });
    const help = t[4]!.submenu!;
    expect(help.map((i) => i.label)).toEqual(['Report an Issue…', 'Docs']);
    help[0]!.click!();
    expect(click).toHaveBeenCalledOnce();
  });

  it('can leave View and Window out, keeping the app, Edit and Help menus', () => {
    const t = buildSuiteMenuTemplate({
      reportItem: { label: 'Report an Issue…' },
      omit: { view: true, window: true },
    });
    expect(t.map((m) => m.role)).toEqual(['appMenu', 'editMenu', 'help']);
  });
});
