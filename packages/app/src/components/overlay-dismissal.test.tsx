import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';
import { Popover } from './popover';
import { PromptDialog } from './prompt-dialog';
import { ToastHost, useToasts } from './toast-host';
import { Tooltip } from './tooltip';
import { MergeDialog } from '../features/reviews/merge-dialog';
import { StashPushDialog } from '../features/status/stash-push-dialog';
import { useUiStore } from '../store/ui-store';

/**
 * Phase 62 Theme B — the overlays on the shared dismissal stack.
 *
 * Two properties, asserted once per surface rather than once per component
 * file, because they are properties of the *migration* and not of any one
 * overlay: Escape reaches exactly the surface it was meant for, and a blocking
 * surface counts as an occluder for exactly as long as it is mounted.
 *
 * The occluder half is the bug that made this phase worth doing. A loaded
 * browser tab's page is an Electron `WebContentsView`, an OS-composited layer
 * that paints above the whole renderer window regardless of `z-index`;
 * `use-browser-bounds.ts` hides it while `occluders > 0`, and `confirm-dialog`,
 * `prompt-dialog`, `palette` and `tooltip` were the four surfaces that never
 * counted — so a destructive confirm raised over a live page was painted
 * UNDERNEATH it, with no way to reach the button.
 */

afterEach(() => {
  cleanup();
  // The stack is module state shared by every test in this file, so an
  // unbalanced entry would leak into the next one as a phantom occluder.
  expect(useUiStore.getState().occluders).toBe(0);
});

function pressEscape() {
  fireEvent.keyDown(window, { key: 'Escape' });
}

describe('blocking overlays register as occluders', () => {
  it('ConfirmDialog counts while mounted', () => {
    expect(useUiStore.getState().occluders).toBe(0);
    const { unmount } = render(
      <ConfirmDialog
        request={{ title: 'Delete branch', confirmLabel: 'Delete', onConfirm: () => {} }}
        onCancel={() => {}}
      />,
    );
    expect(useUiStore.getState().occluders).toBe(1);
    unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  });

  it('PromptDialog counts while mounted', () => {
    const { unmount } = render(
      <PromptDialog
        request={{ title: 'New branch', label: 'Name', confirmLabel: 'Create', onConfirm: () => {} }}
        onCancel={() => {}}
      />,
    );
    expect(useUiStore.getState().occluders).toBe(1);
    unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  });

  it('MergeDialog counts while mounted', () => {
    const { unmount } = render(
      <MergeDialog
        pullNumber={7}
        title="Add the parser"
        baseBranch="main"
        detail={null}
        pending={false}
        error={null}
        onCancel={() => {}}
        onMerge={() => {}}
      />,
    );
    expect(useUiStore.getState().occluders).toBe(1);
    unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  });

  it('StashPushDialog counts while mounted', () => {
    const { unmount } = render(
      <StashPushDialog request={{ onConfirm: () => {} }} onCancel={() => {}} />,
    );
    expect(useUiStore.getState().occluders).toBe(1);
    unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  });

  it('Popover counts only while open, and stops counting when Escape closes it', () => {
    render(
      <Popover trigger={<span>Details</span>} label="Details">
        <p>body</p>
      </Popover>,
    );
    expect(useUiStore.getState().occluders).toBe(0);

    fireEvent.click(document.querySelector('button')!);
    expect(useUiStore.getState().occluders).toBe(1);

    pressEscape();
    expect(useUiStore.getState().occluders).toBe(0);
  });
});

describe('passive overlays do not occlude', () => {
  it('a Tooltip never hides the browser view', () => {
    render(
      <Tooltip label="Reload">
        <button type="button">Reload</button>
      </Tooltip>,
    );

    fireEvent.focus(document.querySelector('button')!);
    // Visible, and still not an occluder: a tooltip is the one surface that
    // paints highest and matters least.
    expect(useUiStore.getState().occluders).toBe(0);
  });

  it('a toast never hides the browser view', () => {
    function Trigger() {
      const toast = useToasts();
      return (
        <button type="button" onClick={() => toast.show({ message: 'Fetched origin' })}>
          fire
        </button>
      );
    }

    render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );
    fireEvent.click(document.querySelector('button')!);
    expect(useUiStore.getState().occluders).toBe(0);
  });
});

describe('one Escape, one dismissal', () => {
  it('cancels the dialog and leaves a visible toast alone', () => {
    const onCancel = vi.fn();

    function Trigger() {
      const toast = useToasts();
      return (
        <button
          type="button"
          data-testid="fire"
          onClick={() => toast.show({ message: 'Fetched origin' })}
        >
          fire
        </button>
      );
    }

    const view = render(
      <ToastHost>
        <Trigger />
      </ToastHost>,
    );
    fireEvent.click(view.getByTestId('fire'));
    expect(view.queryByText('Fetched origin')).not.toBeNull();

    const dialog = render(
      <ConfirmDialog
        request={{ title: 'Reset hard', confirmLabel: 'Reset', onConfirm: () => {} }}
        onCancel={onCancel}
      />,
    );

    pressEscape();

    // The toast paints ABOVE the dialog (`z-toast` 92 vs `z-dialog` 90) and
    // still does not take the key: `blocking` decides delivery, not paint order.
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Fetched origin')).not.toBeNull();

    dialog.unmount();

    // With the dialog gone the toast is the only entry left, and the passive
    // fallback hands it the key.
    pressEscape();
    expect(view.queryByText('Fetched origin')).toBeNull();
  });

  it('dismisses only the newer of two stacked dialogs', () => {
    const cancelFirst = vi.fn();
    const cancelSecond = vi.fn();

    const first = render(
      <ConfirmDialog
        request={{ title: 'One', confirmLabel: 'OK', onConfirm: () => {} }}
        onCancel={cancelFirst}
      />,
    );
    const second = render(
      <PromptDialog
        request={{ title: 'Two', label: 'Name', confirmLabel: 'Create', onConfirm: () => {} }}
        onCancel={cancelSecond}
      />,
    );

    pressEscape();
    expect(cancelSecond).toHaveBeenCalledTimes(1);
    expect(cancelFirst).not.toHaveBeenCalled();

    second.unmount();
    pressEscape();
    expect(cancelFirst).toHaveBeenCalledTimes(1);

    first.unmount();
  });
});
