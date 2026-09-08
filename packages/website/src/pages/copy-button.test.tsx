import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyButton } from './copy-button';

const stubClipboard = (writeText: () => Promise<void>) => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CopyButton', () => {
  it('writes the value and confirms', async () => {
    stubClipboard(() => Promise.resolve());
    render(<CopyButton value="curl … | sh" label="the install command" />);

    screen.getByTestId('copy-button').click();

    await waitFor(() => expect(screen.getByTestId('copy-button').textContent).toContain('Copied'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('curl … | sh');
  });

  it('says so when the clipboard rejects', async () => {
    // writeText rejects on an insecure origin and wherever the permission is
    // declined. A button that says "Copied" regardless is worse than none.
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<CopyButton value="curl … | sh" label="the install command" />);

    screen.getByTestId('copy-button').click();

    await waitFor(() =>
      expect(screen.getByTestId('copy-button').textContent).toContain('Select it instead'),
    );
  });
});
