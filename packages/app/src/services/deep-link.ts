import { useEffect } from 'react';

import { selectCapture } from '@midnite/studio-feature-capture/renderer';
import type { ViewId } from '@midnite/studio-shared';

import { useDialogs } from '../components/dialog-host';
import { useUiStore } from '../store/ui-store';
import { useToastStore } from '../store/toast-store';
import { bridge } from './bridge';
import { useOpenRepo } from './queries';
import { revealResource } from '../features/companion/reveal/reveal';
import { liveNavigationState, resolveNavigation } from '../features/companion/navigate';
import { liveAgentRunDeps, receiveAgentRun } from './agent-run-receiver';

/**
 * Subscribes to `mstudio:protocol:deep-link` and enforces the consent gate
 * (Phase 33 Theme C, Decision 5): a repo already in `repos.json` opens
 * silently, because `midnite .` has to stay one gesture, but any other
 * path is a *proposal* — main never opens it, and this hook is what actually
 * asks. A deep link is remote-triggerable (any web page can issue one), so
 * adding a repository or acting on a clone URL needs a human's click.
 *
 * No return value: this is the whole feature, mounted once from `<Shell>`.
 */
export function useDeepLinks(): void {
  const selectRepo = useUiStore((s) => s.selectRepo);
  const { confirm, notify } = useDialogs();
  const openRepo = useOpenRepo();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    const b = bridge();
    if (!b?.protocol) return;

    /**
     * Lands on a view through the same resolver the companion and `ui.navigate` use, so a locked screen
     * or a popped-out page is handled the way every other navigation handles it, not bypassed by a link.
     * `prepare` runs just before the view is shown (never when the navigation is refused).
     */
    const land = (view: ViewId, prepare?: (view: ViewId) => void): void => {
      const plan = resolveNavigation({ kind: 'navigate', view }, liveNavigationState());
      if (plan.kind === 'refused') {
        addToast({
          message: plan.reason === 'locked' ? 'The screen is locked — unlock it first.' : "That link doesn't point at anything I can open.",
          status: 'error',
        });
        return;
      }
      if (plan.kind === 'focus-window') {
        b.window.focusRole({ role: plan.role });
        return;
      }
      if (plan.kind === 'view') {
        prepare?.(plan.view);
        useUiStore.getState().setActiveView(plan.view);
      }
    };

    const unsub = b.protocol.onDeepLink(({ link, known, origin }) => {
      if (link.kind === 'open') {
        if (known) {
          // Already in `repos.json` — dispatched straight through, no dialog.
          selectRepo(`repo:${link.repo}`);
          return;
        }

        confirm({
          title: 'Open this repository?',
          body: origin !== undefined ? `${link.repo}\n\nAsked for by ${origin || 'a web page'}.` : link.repo,
          confirmLabel: 'Open',
          onConfirm: () => {
            openRepo.mutate(link.repo, {
              onSuccess: (result) => {
                if (result?.ok) {
                  selectRepo(result.repo.id);
                } else {
                  addToast({
                    message: result?.message ?? "Couldn't open that repository.",
                    status: 'error',
                  });
                }
              },
            });
          },
        });
        return;
      }

      if (link.kind === 'reveal') {
        // Phase 112 Theme I — a ref that failed validation is a toast, never a throw.
        if (link.ref === null) {
          addToast({ message: "That link doesn't point at anything I can open.", status: 'error' });
          return;
        }
        void revealResource(link.ref, { caller: 'link' }).then((outcome) => {
          if (!outcome.ok) addToast({ message: outcome.say, status: 'error' });
        });
        return;
      }

      if (link.kind === 'run') {
        // Phase 113 Theme O — an agent run handed off from Coder. Re-validated, known repositories
        // only, and always confirmed before anything starts (`agent-run-receiver.ts`).
        void receiveAgentRun(
          link.run,
          liveAgentRunDeps({ confirm, refuse: (message) => addToast({ message, status: 'error' }) }),
          origin !== undefined ? { pageOrigin: origin } : {},
        );
        return;
      }

      if (link.kind === 'view') {
        // The launcher's tiles.
        land(link.view, (view) => {
          if (link.tab !== undefined) useUiStore.getState().setMediaTab(link.tab);
          if (link.page !== undefined && view === 'settings') useUiStore.getState().setSettingsPage(link.page);
        });
        return;
      }

      if (link.kind === 'capture') {
        // Phase 113 Theme K — Midnite Capture's "Open in Midnite Studio". Remote-triggerable like every
        // link, so it is a proposal: main copies the one capture out of Midnite Capture's own directory
        // only after this confirm, and nothing is sent anywhere either way.
        if (link.id === null) {
          addToast({ message: "That link doesn't point at a capture I can open.", status: 'error' });
          return;
        }
        const id = link.id;
        confirm({
          title: 'Import this capture from Midnite Capture?',
          body: `${id}\n\nThe file is copied into Midnite Studio's own captures, where Send to reaches a chat, a pull-request comment or a Creator project. Nothing is sent anywhere.`,
          confirmLabel: 'Import',
          onConfirm: () => {
            const api = b.capture;
            if (!api) return;
            void api.importFromApp({ id }).then((result) => {
              if (!result.ok) {
                addToast({ message: result.kind === 'error' ? result.message : "Couldn't import that capture.", status: 'error' });
                return;
              }
              selectCapture(result.value.id);
              land('capture');
            });
          },
        });
        return;
      }

      // `clone` — no clone flow exists in the app yet (see Phase 33's file
      // map), so the proposal is a notice rather than an action. Main never
      // touches the filesystem for it either way; this is purely informational.
      notify({
        title: origin !== undefined ? 'A web page sent a clone link' : 'Clone link received',
        body: `${origin !== undefined ? `Asked for by ${origin || 'a web page'}.\n\n` : ''}${link.url}\n\nCloning from a link isn't supported yet — clone it yourself, then open the folder.`,
        okLabel: 'OK',
      });
    });

    return unsub;
  }, [selectRepo, confirm, notify, openRepo, addToast]);
}
