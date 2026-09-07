import { useEffect } from 'react';

import { useDialogs } from '../components/dialog-host';
import { useUiStore } from '../store/ui-store';
import { useToastStore } from '../store/toast-store';
import { bridge } from './bridge';
import { useOpenRepo } from './queries';

/**
 * Subscribes to `mstudio:protocol:deep-link` and enforces the consent gate
 * (Phase 33 Theme C, Decision 5): a repo already in `repos.json` opens
 * silently, because `midnite-studio .` has to stay one gesture, but any other
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
