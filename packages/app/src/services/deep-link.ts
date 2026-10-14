import { useEffect } from 'react';

import { useDialogs } from '../components/dialog-host';
import { useUiStore } from '../store/ui-store';
import { useToastStore } from '../store/toast-store';
import { bridge } from './bridge';
import { useOpenRepo } from './queries';
import { revealResource } from '../features/companion/reveal/reveal';
import { liveNavigationState, resolveNavigation } from '../features/companion/navigate';

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

    const unsub = b.protocol.onDeepLink(({ link, known }) => {
      if (link.kind === 'open') {
        if (known) {
          // Already in `repos.json` — dispatched straight through, no dialog.
          selectRepo(`repo:${link.repo}`);
          return;
        }

        confirm({
          title: 'Open this repository?',
          body: link.repo,
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

      if (link.kind === 'view') {
        // The launcher's tiles. Planned by the same resolver the companion and
        // `ui.navigate` use, so a locked screen or a popped-out page is handled
        // the way every other navigation handles it, not bypassed by a link.
        const plan = resolveNavigation({ kind: 'navigate', view: link.view }, liveNavigationState());
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
          if (link.tab !== undefined) useUiStore.getState().setMediaTab(link.tab);
          if (link.page !== undefined && plan.view === 'settings') useUiStore.getState().setSettingsPage(link.page);
          useUiStore.getState().setActiveView(plan.view);
        }
        return;
      }

      // `clone` — no clone flow exists in the app yet (see Phase 33's file
      // map), so the proposal is a notice rather than an action. Main never
      // touches the filesystem for it either way; this is purely informational.
      notify({
        title: 'Clone link received',
        body: `${link.url}\n\nCloning from a link isn't supported yet — clone it yourself, then open the folder.`,
        okLabel: 'OK',
      });
    });

    return unsub;
  }, [selectRepo, confirm, notify, openRepo, addToast]);
}
