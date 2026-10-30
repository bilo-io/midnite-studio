// vitest/jsdom: routing is a pure lookup over the nav groups — no real browser needed.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LuRadar, LuShieldAlert } from 'react-icons/lu';

import { ModuleViewRouter } from './module-view-router';
import { firstViewOfModule, moduleOfView, navFromGroups } from './nav-config';

const NAV = navFromGroups([
  { id: 'a', label: 'A', icon: LuShieldAlert, views: [{ id: 'a1', label: 'A1', icon: LuShieldAlert }, { id: 'a2', label: 'A2', icon: LuShieldAlert }] },
  { id: 'b', label: 'B', icon: LuRadar, views: [{ id: 'b1', label: 'B1', icon: LuRadar }] },
]);

afterEach(cleanup);

describe('module view routing', () => {
  it('resolves a view to its module and a module to its first view', () => {
    expect(moduleOfView(NAV, 'a2')).toBe('a');
    expect(moduleOfView(NAV, 'b1')).toBe('b');
    expect(moduleOfView(NAV, 'nope')).toBeUndefined();
    expect(firstViewOfModule(NAV, 'a')).toBe('a1');
    expect(firstViewOfModule(NAV, 'nope')).toBeUndefined();
  });

  it('renders the pane of the active view\'s module, passing the view', () => {
    const panes = {
      a: ({ view }: { view: string }) => <p>pane-a:{view}</p>,
      b: ({ view }: { view: string }) => <p>pane-b:{view}</p>,
    };
    const { rerender } = render(<ModuleViewRouter nav={NAV} view="a2" panes={panes} />);
    expect(screen.getByText('pane-a:a2')).toBeTruthy();
    rerender(<ModuleViewRouter nav={NAV} view="b1" panes={panes} />);
    expect(screen.getByText('pane-b:b1')).toBeTruthy();
    expect(screen.queryByText(/pane-a/)).toBeNull();
  });

  it('renders the fallback for a view in no group or a module with no pane', () => {
    render(<ModuleViewRouter nav={NAV} view="zzz" panes={{}} fallback={<p>none</p>} />);
    expect(screen.getByText('none')).toBeTruthy();
  });
});
