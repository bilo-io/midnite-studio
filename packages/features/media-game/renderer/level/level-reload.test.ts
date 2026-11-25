import { describe, expect, it } from 'vitest';

import { addObject, createEditState, markSaved, serialise, toEditLevel } from './level-edit-model';
import { decideReload } from './level-reload';
import { blankLevel } from './test-helpers';

// vitest: the reload rule is a pure function of the file's level and the edit state.
const open = () => createEditState(toEditLevel(blankLevel())!);

describe('decideReload (F5, F6)', () => {
  it('F5: a file equal to what is on screen is `same`, dirty or not', () => {
    const edit = open();
    expect(decideReload(serialise(edit), edit)).toBe('same');
    const objectsLayer = edit.level.layers.find((l) => l.type === 'objectgroup')?.id;
    const dirty = addObject(edit, objectsLayer!, { type: 'pickup', x: 1, y: 1 });
    expect(dirty.dirty).toBe(true);
    expect(decideReload(JSON.parse(JSON.stringify(serialise(dirty))), dirty)).toBe('same');
    expect(markSaved(dirty).dirty).toBe(false);
  });

  it('a clean editor takes a different file; a dirty one is a conflict', () => {
    const clean = open();
    const other = { ...serialise(clean), nextobjectid: 77 };
    expect(decideReload(other, clean)).toBe('reload');
    const objectsLayer = clean.level.layers.find((l) => l.type === 'objectgroup')?.id;
    const dirty = addObject(clean, objectsLayer!, { type: 'pickup', x: 1, y: 1 });
    expect(decideReload(other, dirty)).toBe('conflict');
  });
});
