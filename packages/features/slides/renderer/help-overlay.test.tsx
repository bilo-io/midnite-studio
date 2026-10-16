import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HelpOverlay } from './help-overlay';
import { SlidesHostProvider } from './host';

/**
 * Phase 68 Theme D — the overlay already said `role="dialog"` and autofocused
 * its Close button, but without a trap Tab walked out of it and into the deck
 * behind, where every keystroke drives the presentation. The trap itself is the
 * host's now (`SlidesHost.useFocusTrap`), so the Studio-wired assertion — Tab
 * stays on Close — lives beside the app (`compose/slides/help-overlay.trap.test.tsx`);
 * here is what the overlay does on its own.
 */
describe('HelpOverlay without a host trap', () => {
  afterEach(cleanup);

  it('still takes focus on its own Close button, with no trap from the host', () => {
    render(
      <SlidesHostProvider host={{}}>
        <HelpOverlay onClose={() => {}} />
      </SlidesHostProvider>,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });
});
