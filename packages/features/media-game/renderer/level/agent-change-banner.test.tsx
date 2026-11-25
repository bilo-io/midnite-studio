// vitest/jsdom: the banner's text, buttons and the Undo rule; the shimmer and ring are CSS and canvas, not asserted here.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { AgentChangeBanner, changeCounts } from './agent-change-banner';
import { answerLevelEditorRequest } from './use-level-editor-bridge';
import { addObject } from './level-edit-model';
import { useLevelStore } from './level-store';
import { blankLevel } from './test-helpers';

const data = (level: unknown) => ({ level, issues: [], images: [] }) as never;

function Harness() {
  const entry = useLevelStore((s) => s.byGame.g1);
  return <FrameChromeProvider chrome={createFrameChrome().chrome}>{entry ? <AgentChangeBanner gameId="g1" entry={entry} /> : null}</FrameChromeProvider>;
}

const applyTwo = () =>
  answerLevelEditorRequest({
    kind: 'apply',
    gameId: 'g1',
    scene: 'level',
    unit: 'px',
    label: 'Add 2 objects',
    select: true,
    ops: [
      { op: 'add', entity: { type: 'pickup', x: 10, y: 10 } },
      { op: 'add', entity: { type: 'pickup', x: 20, y: 20 } },
    ],
  });

describe('AgentChangeBanner', () => {
  beforeEach(() => {
    useLevelStore.setState({ byGame: {} });
    useLevelStore.getState().open('g1', 'level', data(blankLevel()));
  });
  afterEach(cleanup);

  it('F2: shows the label and the counts, and Keep removes it', () => {
    render(<Harness />);
    expect(screen.queryByTestId('agent-change-banner')).toBeNull();
    applyTwo();
    // The store changed outside React's batch: re-render through a fresh mount.
    cleanup();
    render(<Harness />);
    const banner = screen.getByTestId('agent-change-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Add 2 objects');
    expect(banner.textContent).toContain('2 added');
    fireEvent.click(screen.getByRole('button', { name: /Keep/ }));
    expect(screen.queryByTestId('agent-change-banner')).toBeNull();
  });

  it('F3: Undo is enabled right after the change, disabled after a further edit, and reverts the change when used', () => {
    applyTwo();
    render(<Harness />);
    const undoButton = () => screen.getByRole('button', { name: /Undo/ }) as HTMLButtonElement;
    expect(undoButton().disabled).toBe(false);
    const layerId = useLevelStore.getState().byGame.g1!.edit.level.layers.find((l) => l.type === 'objectgroup')!.id!;
    // A later user edit.
    cleanup();
    useLevelStore.getState().update('g1', (s) => addObject(s, layerId, { type: 'exit', x: 5, y: 5 }));
    render(<Harness />);
    expect(undoButton().disabled).toBe(true);
    expect(undoButton().title).toContain('use Mod+Z');
  });

  it('Undo reverts the whole change set', () => {
    const before = JSON.stringify(useLevelStore.getState().byGame.g1!.edit.level);
    applyTwo();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(JSON.stringify(useLevelStore.getState().byGame.g1!.edit.level)).toBe(before);
    expect(useLevelStore.getState().byGame.g1!.agentChanges).toEqual([]);
  });

  it('counts only what changed', () => {
    expect(changeCounts({ added: [1, 2, 3], updated: [4, 5], deleted: [6] })).toBe('3 added · 2 changed · 1 removed');
    expect(changeCounts({ added: [], updated: [], deleted: [7] })).toBe('1 removed');
  });
});
