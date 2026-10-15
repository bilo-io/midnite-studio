// vitest/jsdom: confirm must park behind a real dialog, not run immediately.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { BROWSER_CHROME, BrowserDialogHost } from './browser-chrome';

afterEach(cleanup);

it('confirm shows a dialog and runs onConfirm only from its button', () => {
  const onConfirm = vi.fn();
  render(<BrowserDialogHost />);
  act(() => BROWSER_CHROME.useDialogs().confirm({ title: 'Close tabs?', confirmLabel: 'Close', onConfirm }));
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onConfirm).toHaveBeenCalledOnce();
});
