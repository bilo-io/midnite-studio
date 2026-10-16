import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { ThemeProvider } from '@bilo-io/ui/theme';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../store/ui-store';
import { HelpOverlay, SlidesHostProvider, useSlidesStore } from '@midnite/studio-feature-slides/renderer';
import { Modal } from './modal';
import { ConfirmDialog } from './confirm-dialog';
import { PromptDialog } from './prompt-dialog';
import { Palette } from './palette';
import { BrowserLauncher } from '../features/browser/browser-launcher';
import { BrowserSwitcherOverlay } from '../features/browser/browser-switcher-overlay';
import { TerminalSwitcherOverlay } from '../features/terminal/terminal-switcher-overlay';
import { SlidesModal } from '@midnite/studio-feature-slides/renderer/modal';
import { STUDIO_SLIDES_HOST } from '../compose/slides-host';
import { CouncilsHostProvider } from '@midnite/studio-feature-councils/renderer';
import { CouncilCreateDialog } from '@midnite/studio-feature-councils/renderer/testing';
import { SetupOverlay } from '../features/setup/setup-overlay';
import { INITIAL_SETUP_STATE } from '../store/setup-state';
import { MergeDialog } from '@midnite/studio-feature-forge/renderer/testing';
import { StashPushDialog } from '../features/status/stash-push-dialog';
import { SetupDialog } from '../features/agent/setup-dialog';
import { LockScreen } from '../features/screensaver/lock-screen';
import { ActivityTooltip } from './commit-activity-timeline/activity-tooltip';
import { mediaKit } from '@midnite/studio-feature-media-core/renderer';
import { Lightbox } from '@midnite/studio-feature-media-images/renderer';
import { MediaKitProvider } from '@midnite/studio-frame';
import { StudioProviders } from '../compose/studio-providers';
import { StudioMediaTabHosts } from '../features/media/media-view';
import { IssueModal } from '../features/tasks/issue/issue-modal';

import { STUDIO_COUNCILS_HOST } from '../compose/councils-host';
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

  it('3b. BrowserSwitcherOverlay registers as an occluder', () => {
    useUiStore.setState({ browserSwitcherOpen: true });
    assertOccluderLifecycle(() => render(<BrowserSwitcherOverlay />));
    useUiStore.setState({ browserSwitcherOpen: false });
  });

  it('3c. TerminalSwitcherOverlay registers as an occluder', () => {
    useUiStore.setState({ terminalSwitcherOpen: true });
    assertOccluderLifecycle(() => render(withProviders(<TerminalSwitcherOverlay />)));
    useUiStore.setState({ terminalSwitcherOpen: false });
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
    assertOccluderLifecycle(() =>
      render(
        <SlidesHostProvider host={STUDIO_SLIDES_HOST}>
          <SlidesModal />
        </SlidesHostProvider>,
      ),
    );
    useSlidesStore.setState({ deck: null });
  });

  it('7. CouncilCreateDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <CouncilsHostProvider host={STUDIO_COUNCILS_HOST}>
          <CouncilCreateDialog onCancel={() => {}} onCreate={() => {}} />
        </CouncilsHostProvider>,
      ),
    );
  });

  it('8. SetupOverlay registers as an occluder', () => {
    // A fresh gate — the first-run auto-open — is what mounts it.
    useUiStore.setState({ setupState: INITIAL_SETUP_STATE });
    assertOccluderLifecycle(() =>
      render(
        withProviders(
          <ThemeProvider>
            <SetupOverlay />
          </ThemeProvider>,
        ),
      ),
    );
  });

  it('9. MergeDialog registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <StudioProviders>
          <MergeDialog
            pullNumber={42}
            title="Add feature"
            baseBranch="main"
            detail={null}
            pending={false}
            error={null}
            onCancel={() => {}}
            onMerge={() => {}}
          />
        </StudioProviders>,
      ),
    );
  });

  it('10. HelpOverlay registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <SlidesHostProvider host={STUDIO_SLIDES_HOST}>
          <HelpOverlay onClose={() => {}} />
        </SlidesHostProvider>,
      ),
    );
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

  // Phase 32 Theme E's audit found six overlays portalling without
  // registering at all. Two of them — ActivityTooltip and LockScreen — are
  // standalone enough to sit in this file's own numbered list; the other
  // four (project-actions.tsx's SetupDialog portal, tab-strip.tsx's group
  // chip context menu, graph-row.tsx's ref-overflow flyout, ref-badge.tsx's
  // sync strip) are colocated with their own component's test instead, since
  // rendering them here would mean reconstructing a graph row or a tab strip
  // from scratch for no more coverage than the colocated test already gives.

  it('13. ActivityTooltip registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        <ActivityTooltip
          bucket={{ start: Date.now(), count: 3, additions: 10, deletions: 2 }}
          timeframe="week"
          windowCommits={12}
          hasChurn
          at={{ x: 100, y: 100 }}
        />,
      ),
    );
  });

  it('14. LockScreen registers as an occluder', () => {
    assertOccluderLifecycle(() => render(<LockScreen />));
  });

  it('15. Media Images Lightbox registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(
        withProviders(
          <StudioProviders>
            <MediaKitProvider kit={mediaKit}>
              <StudioMediaTabHosts>
                <Lightbox
                  images={[
                    { key: 'k', project: 'p', path: 'a.png', url: 'mstudio-file://repo/r/a.png' },
                  ]}
                  index={0}
                  repoId="r"
                  onIndex={() => {}}
                  onClose={() => {}}
                  onRerun={() => {}}
                  onReveal={() => {}}
                  onDelete={() => {}}
                />
              </StudioMediaTabHosts>
            </MediaKitProvider>
          </StudioProviders>,
        ),
      ),
    );
  });

  it('Issue modal registers as an occluder', () => {
    assertOccluderLifecycle(() =>
      render(withProviders(<IssueModal target={{ repoId: 'r', number: 1 }} onClose={() => {}} />)),
    );
  });
});
