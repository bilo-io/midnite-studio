import type { LauncherApp } from '../../common/catalog';
import { progressFraction, progressLabel, type StudioController } from '../use-studio';

export type ActionHandlers = {
  onOpen: (app: LauncherApp, featureId?: string) => void;
  onInstall: () => void;
};

/**
 * The tile's one big button. Install installs Midnite Studio — the product
 * every app runs in today — so the same install shows its progress on every
 * tile at once. Open lands in Studio on the app's own view.
 */
export function PrimaryAction({
  app,
  studio,
  handlers,
  compact = false,
}: {
  app: LauncherApp;
  studio: StudioController;
  handlers: ActionHandlers;
  compact?: boolean;
}) {
  const cls = `btn btn-primary${compact ? ' btn-compact' : ''}`;
  if (studio.installing) {
    const fraction = progressFraction(studio.progress);
    return (
      <button type="button" className={`${cls} btn-progress`} disabled aria-busy="true">
        <span className="btn-progress-fill" style={{ transform: `scaleX(${fraction ?? 0.15})` }} aria-hidden="true" />
        <span className="btn-label">{progressLabel(studio.progress)}</span>
      </button>
    );
  }
  switch (studio.state) {
    case 'checking':
      return (
        <button type="button" className={cls} disabled>
          Checking…
        </button>
      );
    case 'not-installed':
      return (
        <button
          type="button"
          className={cls}
          onClick={handlers.onInstall}
          aria-label={`Install Midnite ${app.name}`}
          title={app.id === 'studio' ? undefined : `Installs Midnite Studio, which runs Midnite ${app.name} today`}
        >
          Install
        </button>
      );
    case 'installed':
    case 'update':
      return (
        <button type="button" className={cls} onClick={() => handlers.onOpen(app)} aria-label={`Open Midnite ${app.name}`}>
          Open
        </button>
      );
  }
}
