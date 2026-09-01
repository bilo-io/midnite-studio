import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FileIcon, FolderIcon } from './file-icons';

afterEach(() => {
  cleanup();
});

describe('FileIcon', () => {
  it('renders a recognized extension icon', () => {
    const { container } = render(<FileIcon name="example.ts" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('falls back to the default icon for an unknown extension', () => {
    const { container } = render(<FileIcon name="mystery.xyzabc" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('FolderIcon', () => {
  it('renders a named folder icon regardless of open state', () => {
    const { container: closed } = render(<FolderIcon name="src" open={false} />);
    const { container: open } = render(<FolderIcon name="src" open />);
    expect(closed.querySelector('svg')).toBeTruthy();
    expect(open.querySelector('svg')).toBeTruthy();
  });

  it('swaps to the opened default icon for an unmatched folder name when open', () => {
    const { container } = render(<FolderIcon name="totally-unmatched-folder-name" open />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
