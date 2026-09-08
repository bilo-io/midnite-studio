import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { DialogHost } from '../../components/dialog-host';

/**
 * Render a companion panel the way the app actually mounts one — inside a
 * `DialogHost`.
 *
 * Not a convenience. The header's Clear-conversation control raises its
 * confirm through `useDialogs()`, which *throws* outside a host, so a bare
 * `render(<CompanionPanel />)` fails on mount and every case in the file goes
 * with it. Both production hosts (`app.tsx` and `detached-root.tsx`) already
 * wrap their whole tree in one, so this is the real environment rather than a
 * prop stubbed for the test's benefit.
 *
 * A module rather than a per-file helper for the same reason `test-doubles.ts`
 * is one: `companion-panel.test.tsx` and `companion-input-voice.test.tsx` both
 * mount the whole panel, and two copies of the wrapper would let them drift
 * apart about what the panel's surroundings are.
 *
 * Passed as `render`'s `wrapper` rather than wrapped at the call site, because
 * the `rerender` several cases rely on keeps the wrapper only that way.
 */
const withDialogs = ({ children }: { children: ReactNode }) => <DialogHost>{children}</DialogHost>;

export function renderPanel(ui: ReactElement): ReturnType<typeof render> {
  return render(ui, { wrapper: withDialogs });
}
