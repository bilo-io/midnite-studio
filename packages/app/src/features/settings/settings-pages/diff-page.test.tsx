import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { DiffPage } from './diff-page';

const DEFAULTS = {
  diffLayout: 'unified' as const,
  diffShowOldGutter: false,
  commitFileView: 'tree' as const,
  changesFileView: 'list' as const,
};

/**
 * "File lists" is not `defaultOpen` (only "Diff view" is — Decision 3's two
 * clusters read differently on first paint). Its controls stay in the DOM
 * when collapsed (`Accordion` marks the closed body `inert`, it does not
 * unmount it), but `inert` content is invisible to `getByRole` — a real user
 * has to open the section first, so the test does too.
 */
function openFileLists() {
  fireEvent.click(screen.getByRole('button', { name: 'File lists' }));
}

function checkedOption(radiogroupName: string, optionName: string) {
  return within(screen.getByRole('radiogroup', { name: radiogroupName })).getByRole('radio', {
    name: optionName,
  });
}

describe('DiffPage', () => {
  afterEach(() => {
    cleanup();
    useUiStore.setState(DEFAULTS);
  });

  it("renders all four controls reflecting the store's current values", () => {
    useUiStore.setState({
      diffLayout: 'split',
      diffShowOldGutter: true,
      commitFileView: 'list',
      changesFileView: 'tree',
    });
    render(<DiffPage />);
    openFileLists();

    expect(checkedOption('Layout', 'Split').getAttribute('aria-checked')).toBe('true');
    expect(checkedOption('Old-image gutter', 'On').getAttribute('aria-checked')).toBe('true');
    expect(checkedOption('Commit files', 'List').getAttribute('aria-checked')).toBe('true');
    expect(checkedOption('Uncommitted changes', 'Tree').getAttribute('aria-checked')).toBe('true');
  });

  it('choosing a diff layout option calls setDiffLayout', () => {
    render(<DiffPage />);
    fireEvent.click(checkedOption('Layout', 'Split'));
    expect(useUiStore.getState().diffLayout).toBe('split');
  });

  it('choosing the old-gutter option toggles diffShowOldGutter', () => {
    render(<DiffPage />);
    fireEvent.click(checkedOption('Old-image gutter', 'On'));
    expect(useUiStore.getState().diffShowOldGutter).toBe(true);

    fireEvent.click(checkedOption('Old-image gutter', 'Off'));
    expect(useUiStore.getState().diffShowOldGutter).toBe(false);
  });

  it('choosing a commit-file-view option calls setCommitFileView', () => {
    render(<DiffPage />);
    openFileLists();
    fireEvent.click(checkedOption('Commit files', 'List'));
    expect(useUiStore.getState().commitFileView).toBe('list');
  });

  it('choosing a changes-file-view option calls setChangesFileView independently of commitFileView', () => {
    render(<DiffPage />);
    openFileLists();
    fireEvent.click(checkedOption('Uncommitted changes', 'Tree'));
    expect(useUiStore.getState().changesFileView).toBe('tree');
    expect(useUiStore.getState().commitFileView).toBe('tree'); // unchanged from its own default
  });

  it('"Reset to defaults" in "Diff view" restores layout and old-gutter only', () => {
    useUiStore.setState({
      diffLayout: 'split',
      diffShowOldGutter: true,
      commitFileView: 'list',
      changesFileView: 'tree',
    });
    render(<DiffPage />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset to defaults' })[0]!);

    expect(useUiStore.getState().diffLayout).toBe('unified');
    expect(useUiStore.getState().diffShowOldGutter).toBe(false);
    // The other accordion's reset was not clicked — its keys are untouched.
    expect(useUiStore.getState().commitFileView).toBe('list');
    expect(useUiStore.getState().changesFileView).toBe('tree');
  });

  it('"Reset to defaults" in "File lists" restores commitFileView and changesFileView only', () => {
    useUiStore.setState({
      diffLayout: 'split',
      diffShowOldGutter: true,
      commitFileView: 'list',
      changesFileView: 'tree',
    });
    render(<DiffPage />);
    openFileLists();

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset to defaults' })[1]!);

    expect(useUiStore.getState().commitFileView).toBe('tree');
    expect(useUiStore.getState().changesFileView).toBe('list');
    // The other accordion's reset was not clicked — its keys are untouched.
    expect(useUiStore.getState().diffLayout).toBe('split');
    expect(useUiStore.getState().diffShowOldGutter).toBe(true);
  });
});
