import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RebaseModal } from './rebase-modal';

/**
 * Phase 68 Theme D — a bottom sheet over a history-rewriting operation that
 * declared no `role`, no accessible name and no focus management at all. Tab
 * walked straight out of it into the graph it was about to rewrite.
 */
describe('RebaseModal focus and role', () => {
  afterEach(cleanup);

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function open() {
    render(
      <RebaseModal
        isOpen
        targetRef="main"
        initialCommits={[
          { sha: 'aaaaaaa', subject: 'first' },
          { sha: 'bbbbbbb', subject: 'second' },
        ]}
        onClose={() => {}}
        onConfirm={async () => {}}
      />,
    );
    return screen.getByRole('dialog', { name: 'Interactive rebase onto main' });
  }

  it('is a named modal dialog that holds focus on open', () => {
    const dialog = open();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Nothing inside asks for focus, so the trap parks it on the container —
    // which is the whole reason the container carries `tabIndex={-1}`.
    expect(document.activeElement).toBe(dialog);
  });

  it('wraps Tab rather than letting it escape into the graph behind', () => {
    const dialog = open();
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    expect(first).not.toBe(last);

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
