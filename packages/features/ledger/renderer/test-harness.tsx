import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { vi } from 'vitest';

import { FrameChromeProvider, type FrameChrome } from '@midnite/studio-frame';

import { createMemoryLedger, type MemoryLedgerOptions } from './memory-ledger';
import { LEDGER_UI_DEFAULTS, useLedgerUiStore } from './ledger-ui-store';

export const confirm = vi.fn();

const chrome: FrameChrome = {
  IconButton: ({ label, onClick, disabled }) => <button type="button" aria-label={label} onClick={onClick} disabled={disabled} />,
  ConfirmDialog: () => null,
  useDialogs: () => ({ confirm, notify: vi.fn(), setBlastRadius: vi.fn(), close: vi.fn() }),
  PageDetachMark: () => null,
};

/** Mounts `ui` over the in-memory books bridge, a fresh query client and a stub frame chrome. */
export function mountLedger(ui: ReactNode, options?: MemoryLedgerOptions) {
  const ledger = createMemoryLedger(options);
  Object.assign(window, { midniteStudio: { ledger } });
  useLedgerUiStore.setState({ ...LEDGER_UI_DEFAULTS, settingsOpen: false });
  confirm.mockReset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactNode): ReactNode => (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={chrome}>{node}</FrameChromeProvider>
    </QueryClientProvider>
  );
  const view = render(wrap(ui));
  return { ledger, ...view, rerender: (next: ReactNode) => view.rerender(wrap(next)) };
}

export function teardownLedger(): void {
  cleanup();
  Reflect.deleteProperty(window, 'midniteStudio');
}
