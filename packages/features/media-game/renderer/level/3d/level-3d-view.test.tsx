// jsdom: WebGL is not available, so the canvas and the scene are stubbed; what is under test is the view's own
// chrome and keys (Phase 137 Theme D). Real gizmo dragging is covered by the Verification gate.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEditState } from '../level-edit-model';
import { blankLevel3d } from '../test-helpers';
import Level3dView from './level-3d-view';
import { useLevelViewStore } from './level-view-store';

vi.mock('@react-three/fiber', () => ({ Canvas: () => null }));
vi.mock('./level-scene', () => ({ LevelScene: () => null, NO_DRAFT: { volume: null, path: [], aim: null }, SCENE_BACKGROUND: '#000', disposeTree: () => undefined }));

afterEach(() => {
  cleanup();
  useLevelViewStore.setState({ pivot: 'pivot', space: 'world' });
});

const mount = () => {
  const state = createEditState(blankLevel3d());
  return render(
    <Level3dView
      gameId="g1"
      level={state.level}
      terrain={null}
      selection={null}
      selected={[]}
      readOnly={false}
      tool="select"
      entityName="prop"
      objectLayerId={null}
      pathDraft={[]}
      onPathPoint={() => undefined}
      update={() => undefined}
      enterFrom={null}
      handle={{ current: null }}
      onEditorKey={() => undefined}
    />,
  );
};
const checked = (group: string) => Array.from(screen.getByRole('radiogroup', { name: group }).querySelectorAll('[role=radio]')).find((r) => r.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label');

describe('Level3dView chrome (Phase 137 Theme D)', () => {
  it('D6 Z flips Pivot / Centre and X flips Local / World, and the store keeps them', () => {
    mount();
    const view = screen.getByTestId('level-3d-view');
    expect([checked('Gizmo pivot'), checked('Gizmo space')]).toEqual(['Pivot', 'World']);
    fireEvent.keyDown(view, { key: 'z' });
    fireEvent.keyDown(view, { key: 'x' });
    expect([checked('Gizmo pivot'), checked('Gizmo space')]).toEqual(['Centre', 'Local']);
    expect([useLevelViewStore.getState().pivot, useLevelViewStore.getState().space]).toEqual(['centre', 'local']);
    fireEvent.keyDown(view, { key: 'z' });
    expect(checked('Gizmo pivot')).toBe('Pivot');
  });

  it('the radios click too', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Local' }));
    expect(checked('Gizmo space')).toBe('Local');
  });
});
