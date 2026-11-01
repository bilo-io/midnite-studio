import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BottomPanel } from './bottom-panel';
import { useBottomPanelStore } from './bottom-panel-store';
import { useBottomPanel } from './use-bottom-panel';

const OPTS = { initial: 176, min: 72, max: 480 };

const setWindowHeight = (value: number) => Object.defineProperty(window, 'innerHeight', { value, configurable: true, writable: true });

beforeEach(() => {
  useBottomPanelStore.setState({ panels: {} });
  window.localStorage.clear();
  setWindowHeight(1000);
});
afterEach(cleanup);

const key = (k: string) => ({ key: k, shiftKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as React.KeyboardEvent<HTMLElement>;

describe('useBottomPanel', () => {
  it('starts at the default height, expanded', () => {
    const { result } = renderHook(() => useBottomPanel('t.a', OPTS));
    expect(result.current.height).toBe(176);
    expect(result.current.collapsed).toBe(false);
  });

  it('honours defaultCollapsed until the user chooses', () => {
    const { result } = renderHook(() => useBottomPanel('t.b', { ...OPTS, defaultCollapsed: true }));
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
  });

  it('grows with ArrowUp (the handle is above the panel) and clamps to min and max', () => {
    const { result } = renderHook(() => useBottomPanel('t.c', OPTS));
    act(() => result.current.resizable.handleProps.onKeyDown(key('ArrowUp')));
    expect(result.current.height).toBe(184);
    act(() => result.current.resizable.handleProps.onKeyDown(key('End')));
    expect(result.current.height).toBe(480);
    act(() => result.current.resizable.handleProps.onKeyDown(key('Home')));
    expect(result.current.height).toBe(72);
  });

  it('caps the height at a share of the window so the viewport above survives', () => {
    setWindowHeight(500);
    const { result } = renderHook(() => useBottomPanel('t.d', OPTS));
    act(() => result.current.resizable.handleProps.onKeyDown(key('End')));
    expect(result.current.height).toBe(300);
    act(() => {
      setWindowHeight(400);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.height).toBe(240);
  });

  it('double-click restores the default', () => {
    const { result } = renderHook(() => useBottomPanel('t.e', OPTS));
    act(() => result.current.resizable.handleProps.onKeyDown(key('End')));
    act(() => result.current.resizable.handleProps.onDoubleClick());
    expect(result.current.height).toBe(176);
  });

  it('collapses on a nudge past the minimum and keeps the saved height', () => {
    const { result } = renderHook(() => useBottomPanel('t.f', OPTS));
    act(() => result.current.resizable.handleProps.onKeyDown(key('Home')));
    act(() => result.current.resizable.handleProps.onKeyDown(key('ArrowDown')));
    expect(result.current.collapsed).toBe(true);
    expect(useBottomPanelStore.getState().panels['t.f']?.size).toBe(72);
  });

  it('keeps panels independent and shares state between call sites of one id', () => {
    const a = renderHook(() => useBottomPanel('t.g', OPTS));
    const a2 = renderHook(() => useBottomPanel('t.g', OPTS));
    const b = renderHook(() => useBottomPanel('t.h', OPTS));
    act(() => a.result.current.toggle());
    expect(a2.result.current.collapsed).toBe(true);
    expect(b.result.current.collapsed).toBe(false);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useBottomPanel('t.i', OPTS));
    act(() => result.current.toggle());
    const stored = JSON.parse(window.localStorage.getItem('midnite-studio:bottom-panels') ?? '{}') as { state?: { panels?: Record<string, { collapsed?: boolean }> } };
    expect(stored.state?.panels?.['t.i']?.collapsed).toBe(true);
  });
});

describe('BottomPanel', () => {
  const view = (onAction = vi.fn()) =>
    render(
      <BottomPanel id="t.panel" title="Console" ariaLabel="Test panel" testId="panel" resize={OPTS} actions={<button type="button" onClick={onAction}>Clear</button>}>
        <p>body text</p>
      </BottomPanel>,
    );

  it('shows its body and a resize handle, then only the header once collapsed', () => {
    view();
    const toggle = screen.getByRole('button', { name: 'Console' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('body text')).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Resize test panel' })).toBeTruthy();
    expect(screen.getByTestId('panel').style.height).toBe('176px');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('body text')).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByTestId('panel').style.height).toBe('');

    fireEvent.click(toggle);
    expect(screen.getByText('body text')).toBeTruthy();
  });

  it('keeps its action buttons clickable without toggling', () => {
    const onAction = vi.fn();
    view(onAction);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Console' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles from anywhere on the header row', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Console' }).parentElement!);
    expect(screen.getByRole('button', { name: 'Console' }).getAttribute('aria-expanded')).toBe('false');
  });
});
