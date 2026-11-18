// vitest/jsdom: the scatter options panel (Phase 139 Theme H) — DOM roles and the settings it hands back.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { ScatterPanel, sourceFromPayload } from './scatter-panel';
import { DEFAULT_SCATTER } from './level-scatter';
import type { ScatterSettings } from './level-scatter';

afterEach(cleanup);
const panel = (props: Parameters<typeof ScatterPanel>[0]) => render(<FrameChromeProvider chrome={createFrameChrome().chrome}><ScatterPanel {...props} /></FrameChromeProvider>);
const base: ScatterSettings = { ...DEFAULT_SCATTER, sources: [{ kind: 'model', name: 'tree.glb', weight: 1 }], seed: 9 };
const prefabs = [
  { name: 'camp', dimension: '3d' as const, objects: 3 },
  { name: 'flat', dimension: '2d' as const, objects: 1 },
];

describe('ScatterPanel', () => {
  it('lists the sources and removes one', () => {
    const onChange = vi.fn();
    panel({ settings: base, onChange, prefabs, is3d: true });
    expect(screen.getByText('model: tree.glb')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove model: tree.glb'));
    expect(onChange).toHaveBeenCalledWith({ ...base, sources: [] });
  });
  it('offers only this level\'s dimension of prefab, and adds the chosen one', () => {
    const onChange = vi.fn();
    panel({ settings: base, onChange, prefabs, is3d: true });
    const options = Array.from((screen.getByLabelText('Add a prefab') as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['', 'camp']);
    fireEvent.change(screen.getByLabelText('Add a prefab'), { target: { value: 'camp' } });
    expect(onChange.mock.calls[0]![0].sources).toHaveLength(2);
  });
  it('adds an entity type by name', () => {
    const onChange = vi.fn();
    panel({ settings: base, onChange, prefabs: [], is3d: false });
    fireEvent.change(screen.getByLabelText('Add an entity type'), { target: { value: 'coin' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange.mock.calls[0]![0].sources[1]).toEqual({ kind: 'type', type: 'coin', weight: 1 });
  });
  it('New seed changes the seed', () => {
    const onChange = vi.fn();
    panel({ settings: base, onChange, prefabs: [], is3d: true });
    fireEvent.click(screen.getByTestId('scatter-new-seed'));
    expect(onChange.mock.calls[0]![0].seed).not.toBe(9);
  });
  it('turns a model tile or a prefab tile into a source, and refuses other assets', () => {
    expect(sourceFromPayload({ kind: 'asset', name: 'a.glb', assetKind: 'model' })).toEqual({ kind: 'model', name: 'a.glb', weight: 1 });
    expect(sourceFromPayload({ kind: 'prefab', name: 'camp' })).toEqual({ kind: 'prefab', name: 'camp', weight: 1 });
    expect(sourceFromPayload({ kind: 'asset', name: 'a.png', assetKind: 'image' })).toBeNull();
  });
});
