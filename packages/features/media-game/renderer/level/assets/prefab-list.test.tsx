// vitest/jsdom: the Prefabs tab and the save dialog (Phase 139 Theme G).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assetDragStore } from './asset-drag';
import { PrefabList } from './prefab-list';
import { SavePrefabDialog, validatePrefabName } from './save-prefab-dialog';

const entry = (name: string, over: Record<string, unknown> = {}) => ({ name, dimension: '3d' as const, objects: 3, ...over });

beforeEach(() => assetDragStore.set({ dragging: null, armed: null }));
afterEach(cleanup);

describe('PrefabList', () => {
  it('shows skeletons while loading and an empty state with no prefabs', () => {
    const { rerender } = render(<PrefabList prefabs={undefined} is3d onDelete={vi.fn()} />);
    expect(screen.getByTestId('level-prefabs-loading')).toBeTruthy();
    rerender(<PrefabList prefabs={[]} is3d onDelete={vi.fn()} />);
    expect(screen.getByText('No prefabs yet')).toBeTruthy();
  });

  it('arms a tile on click (and disarms on a second) with the prefab payload', () => {
    render(<PrefabList prefabs={[entry('crate-stack')]} is3d onDelete={vi.fn()} />);
    const tile = screen.getByTestId('level-prefab-tile');
    fireEvent.click(tile);
    expect(assetDragStore.get().armed).toEqual({ kind: 'prefab', name: 'crate-stack' });
    fireEvent.click(tile);
    expect(assetDragStore.get().armed).toBeNull();
  });

  it('starts a drag with the prefab kind', () => {
    render(<PrefabList prefabs={[entry('crate-stack')]} is3d onDelete={vi.fn()} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByTestId('level-prefab-tile'), { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith('application/x-midnite-level-asset', JSON.stringify({ kind: 'prefab', name: 'crate-stack' }));
    expect(assetDragStore.get().dragging).toEqual({ kind: 'prefab', name: 'crate-stack' });
  });

  it('disables a prefab of the other dimension and asks the editor to delete', () => {
    const onDelete = vi.fn();
    render(<PrefabList prefabs={[entry('wall', { dimension: '2d' })]} is3d onDelete={onDelete} />);
    expect((screen.getByTestId('level-prefab-tile') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete prefab wall' }));
    expect(onDelete).toHaveBeenCalledWith('wall');
  });
});

describe('SavePrefabDialog', () => {
  it('validates the name live and only saves a valid one', () => {
    expect(validatePrefabName('Bad Name')).not.toBeNull();
    expect(validatePrefabName('crate-stack')).toBeNull();
    const onSave = vi.fn();
    render(<SavePrefabDialog initialName="crate" existing={['crate']} onSave={onSave} onClose={vi.fn()} />);
    expect(screen.getByText(/will be replaced/)).toBeTruthy();
    const input = screen.getByLabelText('Prefab name');
    fireEvent.change(input, { target: { value: 'Bad Name' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'stack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('stack');
  });
});
