import { SpriteFramesFileSchema, SpriteSheetSpecSchema, type SpritePatchOp } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpriteFrameStrip } from './sprite-frame-strip';

/**
 * Phase 106 Theme G's frame strip (vitest/jsdom: keys and the ops they send; no layout needed).
 * Every edit is one `patchFrames` call, and `Mod+Z` sends its inverse.
 */
afterEach(cleanup);

const spec = SpriteSheetSpecSchema.parse({ kind: 'sheet', name: 'hero', clips: [{ name: 'walk', frames: 3 }] });
const file = SpriteFramesFileSchema.parse({
  frames: {
    'walk/e/000': {},
    'walk/e/001': { badges: ['clipped'] },
    'walk/e/002': {},
    'walk/e/003': {},
  },
});

function setup(selected = 0) {
  const apply = vi.fn(async (_ops: SpritePatchOp[]) => true);
  const onSelect = vi.fn();
  render(
    <SpriteFrameStrip
      repoId="r"
      target={{ group: 'characters', asset: 'hero-1' }}
      spec={spec}
      file={file}
      clip="walk"
      dir="e"
      version="1"
      selected={selected}
      onSelect={onSelect}
      apply={apply}
    />,
  );
  return { apply, onSelect, list: screen.getByRole('listbox', { name: 'Frames' }) };
}

describe('SpriteFrameStrip', () => {
  it('shows the clip’s frames only — a stale frame past the clip is not listed — with their badges', () => {
    setup();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[1]!.getAttribute('aria-label')).toBe('Frame 2, clipped');
    expect(screen.getByText('clipped').getAttribute('title')).toMatch(/^Clipped:/);
  });

  it('ArrowRight sends a nudge with dx 1 (Shift: 4), and Mod+Z sends its inverse', async () => {
    const { apply, list } = setup();
    await act(async () => {
      fireEvent.keyDown(list, { key: 'ArrowRight' });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'nudge', key: 'walk/e/000', dx: 1, dy: 0 }]);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'z', metaKey: true });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'nudge', key: 'walk/e/000', dx: -1, dy: 0 }]);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'z', metaKey: true, shiftKey: true });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'nudge', key: 'walk/e/000', dx: 1, dy: 0 }]);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'ArrowUp', shiftKey: true });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'nudge', key: 'walk/e/000', dx: 0, dy: -4 }]);
  });

  it('H flips, Delete deletes (undone by restore), Alt+→ moves, R re-rolls', async () => {
    const { apply, list, onSelect } = setup(1);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'h' });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'flip', key: 'walk/e/001' }]);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'Delete' });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'delete', key: 'walk/e/001' }]);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'z', ctrlKey: true });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'restore', key: 'walk/e/001' }]);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'move', key: 'walk/e/001', to: 2 }]);
    expect(onSelect).toHaveBeenLastCalledWith(2);
    await act(async () => {
      fireEvent.keyDown(list, { key: 'r' });
    });
    expect(apply).toHaveBeenLastCalledWith([{ op: 'reroll', keys: ['walk/e/001'] }]);
  });

  it('`,` and `.` move the focus between frames', () => {
    const { list, onSelect } = setup(1);
    fireEvent.keyDown(list, { key: '.' });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(list, { key: ',' });
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });
});
