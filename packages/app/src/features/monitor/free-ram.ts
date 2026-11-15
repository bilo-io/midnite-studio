import { runFreeRam } from '@midnite/studio-feature-optimizer/renderer';

import { useFullRecoveryStore, type WidgetDialogs } from './full-recovery';

/** Free RAM with the palette's dialogs (Phase 148 Theme C). */
export function runFreeRamWith(dialogs: WidgetDialogs): void {
  runFreeRam({ dialogs }).catch((error: unknown) =>
    dialogs.notify({
      title: 'Could not free RAM',
      body: error instanceof Error ? error.message : String(error),
    }),
  );
}

/** The flyout's seam, a no-op before the dialog host has mounted (it lends the dialogs, as for Clean system). */
export function runFreeRamFromWidget(): void {
  const dialogs = useFullRecoveryStore.getState().dialogs;
  if (dialogs) runFreeRamWith(dialogs);
}
