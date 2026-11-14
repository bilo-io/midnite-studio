import { runCleanSystem } from '@midnite/studio-feature-optimizer/renderer';

import { STUDIO_OPTIMIZER_HOST } from '../../compose/optimizer-host';
import { requestHandoff } from '../../services/handoff';
import { useFullRecoveryStore, type WidgetDialogs } from './full-recovery';

type Dialogs = WidgetDialogs;

/** Clean system over Studio's optimizer settings; the palette passes its dialogs, the widget borrows the host's. */
export function runCleanSystemWith(dialogs: Dialogs): void {
  runCleanSystem({
    dialogs,
    getSettings: STUDIO_OPTIMIZER_HOST.getSettings,
    openOptimizer: () => void requestHandoff({ app: 'cleaner', view: 'optimizer' }),
  }).catch((error: unknown) =>
    dialogs.notify({
      title: 'Could not clean the system',
      body: error instanceof Error ? error.message : String(error),
    }),
  );
}

/** The flyout's seam, a no-op before the dialog host has mounted (it lends the dialogs, as for Full recovery). */
export function runCleanSystemFromWidget(): void {
  const dialogs = useFullRecoveryStore.getState().dialogs;
  if (dialogs) runCleanSystemWith(dialogs);
}
