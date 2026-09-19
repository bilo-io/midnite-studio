import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProvenanceMarkPicker } from './provenance-mark-picker';
import {
  DEFAULT_PROVENANCE_MARK_MODE,
  PROVENANCE_MARK_MODES,
  resetProvenanceSwapForTests,
} from '../graph/provenance-display';
import { useUiStore } from '../../store/ui-store';

/**
 * The Graph ▸ Agent provenance picker — vitest/jsdom. Three buttons, one store
 * field, `aria-pressed` on the active one: no browser capability is involved.
 */
describe('ProvenanceMarkPicker', () => {
  beforeEach(() => {
    useUiStore.setState({ graphProvenanceMark: DEFAULT_PROVENANCE_MARK_MODE });
  });

  afterEach(() => {
    cleanup();
    resetProvenanceSwapForTests();
    useUiStore.setState({ graphProvenanceMark: DEFAULT_PROVENANCE_MARK_MODE });
  });

  it('offers every mode, each with its own preview', () => {
    render(<ProvenanceMarkPicker />);
    expect(screen.getAllByRole('button')).toHaveLength(PROVENANCE_MARK_MODES.length);
    for (const mode of PROVENANCE_MARK_MODES) {
      expect(screen.getByTestId(`provenance-mode-preview-${mode}`)).toBeTruthy();
    }
  });

  it('marks the persisted mode as pressed', () => {
    useUiStore.setState({ graphProvenanceMark: 'beside' });
    render(<ProvenanceMarkPicker />);
    expect(screen.getByRole('button', { name: /Beside the avatar/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Corner badge/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('writes the chosen mode to the store', () => {
    render(<ProvenanceMarkPicker />);

    fireEvent.click(screen.getByRole('button', { name: /Alternating/ }));
    expect(useUiStore.getState().graphProvenanceMark).toBe('swap');

    fireEvent.click(screen.getByRole('button', { name: /Beside the avatar/ }));
    expect(useUiStore.getState().graphProvenanceMark).toBe('beside');
  });

  it('shows the corner badge as pressed for an unrecognised persisted value', () => {
    // A mode written by a future build, or a hand-edited localStorage: the
    // picker must still show SOMETHING selected rather than three unpressed
    // buttons. Same coercion the graph itself applies.
    useUiStore.setState({
      graphProvenanceMark: 'inline' as never,
    });
    render(<ProvenanceMarkPicker />);
    expect(screen.getByRole('button', { name: /Corner badge/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
