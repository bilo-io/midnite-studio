import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT, useUiStore } from '../../store/ui-store';
import { ApiClientView } from './api-client-view';

describe('ApiClientView', () => {
  afterEach(() => {
    cleanup();
    useUiStore.setState({ layout: DEFAULT_LAYOUT });
  });

  it('renders the empty-collections state — nothing else fills the tree pane yet', () => {
    render(<ApiClientView />);
    expect(screen.getByText('No collections yet')).toBeDefined();
    // The body sentence is split across text nodes by the two <code> spans it
    // wraps around `.postman_collection.json` and `.midnite/api/`, so it is
    // matched against the paragraph's combined textContent rather than a
    // single node's text.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          (element.textContent ?? '').includes(
            'Collections are stored in .midnite/api/ in this repository',
          ),
      ),
    ).toBeDefined();
  });

  it('shows the import button, disabled — Theme G wires it up', () => {
    render(<ApiClientView />);
    const button = screen.getByRole('button', { name: 'Import collection…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the placeholder right pane with no request open', () => {
    render(<ApiClientView />);
    expect(screen.getByText('Import a collection to build and send a request.')).toBeDefined();
  });
});
