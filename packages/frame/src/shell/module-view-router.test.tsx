// vitest/jsdom: routing is a pure lookup over the nav groups — no real browser needed.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LuRadar, LuShieldAlert } from 'react-icons/lu';

import { ModuleViewRouter } from './module-view-router';
import { useSyncedView } from './use-synced-view';
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
    const { rerender } = render(<ModuleViewRouter nav={NAV} view="a2" onView={() => {}} panes={panes} />);
    expect(screen.getByText('pane-a:a2')).toBeTruthy();
    rerender(<ModuleViewRouter nav={NAV} view="b1" onView={() => {}} panes={panes} />);
    expect(screen.getByText('pane-b:b1')).toBeTruthy();
    expect(screen.queryByText(/pane-a/)).toBeNull();
  });

  it('renders the fallback for a view in no group or a module with no pane', () => {
    render(<ModuleViewRouter nav={NAV} view="zzz" onView={() => {}} panes={{}} fallback={<p>none</p>} />);
    expect(screen.getByText('none')).toBeTruthy();
  });
});

describe('useSyncedView', () => {
  const Probe = ({ view, own, setOwn, onView }: { view: string; own: string; setOwn: (v: string) => void; onView: (v: string) => void }) => {
    useSyncedView(view, onView, own, setOwn);
    return null;
  };

  it('pushes the rail view in on mount without reporting the stale own value', () => {
    const setOwn = vi.fn();
    const onView = vi.fn();
    render(<Probe view="a" own="stale" setOwn={setOwn} onView={onView} />);
    expect(setOwn).toHaveBeenCalledWith('a');
    expect(onView).not.toHaveBeenCalled();
  });

  it('reports a change the module makes itself', () => {
    const onView = vi.fn();
    const { rerender } = render(<Probe view="a" own="a" setOwn={() => {}} onView={onView} />);
    rerender(<Probe view="a" own="b" setOwn={() => {}} onView={onView} />);
    expect(onView).toHaveBeenCalledWith('b');
  });
});

describe('useSyncedView closed loop (host state + module state, both wired)', () => {
  it('settles without an update loop, from the rail and from the module', async () => {
    const { useState } = await import('react');
    const { act } = await import('@testing-library/react');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let setRail: (v: string) => void = () => {};
    let setMod: (v: string) => void = () => {};
    const Pane = ({ view, onView }: { view: string; onView: (v: string) => void }) => {
      const [own, setOwn] = useState('stale');
      setMod = setOwn;
      useSyncedView(view, onView, own, setOwn);
      return <p>own:{own}</p>;
    };
    const Host = () => {
      const [view, setView] = useState('a1');
      setRail = setView;
      return <Pane view={view} onView={setView} />;
    };
    render(<Host />);
    expect(screen.getByText('own:a1')).toBeTruthy();
    act(() => setRail('a2'));
    expect(screen.getByText('own:a2')).toBeTruthy();
    act(() => setMod('a1'));
    expect(screen.getByText('own:a1')).toBeTruthy();
    act(() => setRail('a2'));
    expect(screen.getByText('own:a2')).toBeTruthy();
    const loop = errors.mock.calls.some((c) => String(c[0]).includes('Maximum update depth'));
    errors.mockRestore();
    expect(loop).toBe(false);
  });
});
