import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../store/ui-store';
import { useSlidesStore } from '../features/slides/slides-store';
import { Modal } from './modal';
import { ConfirmDialog } from './confirm-dialog';
import { PromptDialog } from './prompt-dialog';
import { Palette } from './palette';
import { BrowserLauncher } from '../features/browser/browser-launcher';
import { SlidesModal } from '../features/slides/slides-modal';
import { CouncilCreateDialog } from '../features/councils/council-create-dialog';
import { FirstRunModal } from '../features/onboarding/first-run-modal';
import { MergeDialog } from '../features/reviews/merge-dialog';
import { HelpOverlay } from '../features/slides/help-overlay';
import { StashPushDialog } from '../features/status/stash-push-dialog';
import { SetupDialog } from '../features/agent/setup-dialog';

import { DialogHost } from './dialog-host';
import { ToastHost } from './toast-host';

function withProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastHost>
        <DialogHost>{ui}</DialogHost>
      </ToastHost>
    </QueryClientProvider>
  );
}

describe('occluder coverage across overlays', () => {
  beforeEach(() => {
    useUiStore.setState({ occluders: 0 });
  });

  afterEach(() => {
    cleanup();
    useUiStore.setState({ occluders: 0 });
  });

  function assertOccluderLifecycle(renderOverlay: () => { unmount: () => void }) {
    expect(useUiStore.getState().occluders).toBe(0);
    const { unmount } = renderOverlay();
    expect(useUiStore.getState().occluders).toBe(1);
    unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  }

  it('1. Modal registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <Modal open onClose={() => {}}>
          <div>Content</div>
        </Modal>,
      ),
    );
  });

  it('2. PromptDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <PromptDialog
          request={{
            title: 'Prompt',
            label: 'Name',
            confirmLabel: 'OK',
            onConfirm: () => {},
          }}
          onCancel={() => {}}
        />,
      ),
    );
  });

  it('3. BrowserLauncher registers as an occluder', () => {
    useUiStore.setState({ browserLauncherOpen: true });
    assertOccluderLifecycle(() => render(<BrowserLauncher />));
    useUiStore.setState({ browserLauncherOpen: false });
  });

  it('4. ConfirmDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <ConfirmDialog
          request={{
            title: 'Confirm deletion',
            body: 'Are you sure?',
            confirmLabel: 'Delete',
            onConfirm: () => {},
          }}
          onCancel={() => {}}
        />,
      ),
    );
  });

  it('5. Palette registers as an occluder', () => {
    assertOccluderLifecycle(() => render(withProviders(<Palette />)));
  });

  it('6. SlidesModal registers as an occluder', () => {
    useSlidesStore.setState({ deck: { label: 'Demo', content: '# Slide' } });
    assertOccluderLifecycle(() => render(<SlidesModal />));
    useSlidesStore.setState({ deck: null });
  });

  it('7. CouncilCreateDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(<CouncilCreateDialog onCancel={() => {}} onCreate={() => {}} />),
    );
  });

  it('8. FirstRunModal registers as an occluder', () => {
    useUiStore.setState({ onboardedAt: null });
    assertOccluderLifecycle(() => render(withProviders(<FirstRunModal />)));
  });

  it('9. MergeDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <MergeDialog
          pullNumber={42}
          title="Add feature"
          baseBranch="main"
          detail={null}
          pending={false}
          error={null}
          onCancel={() => {}}
          onMerge={() => {}}
        />,
      ),
    );
  });

  it('10. HelpOverlay registers as an occluder', () => {
    assertOccluderLifecycle(() => render(<HelpOverlay onClose={() => {}} />));
  });

  it('11. StashPushDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(<StashPushDialog request={{ onConfirm: () => {} }} onCancel={() => {}} />),
    );
  });

  it('12. SetupDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <SetupDialog
          repoId="repo-1"
          repoName="midnite"
          hasExistingKit={false}
          onClose={() => {}}
        />,
      ),
    );
  });
});
