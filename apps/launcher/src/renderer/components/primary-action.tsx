import type { LauncherApp } from '../../common/catalog';
import type { AppView } from '../use-apps';
import { progressFraction, progressLabel } from '../use-studio';

export type ActionHandlers = {
  onOpen: (app: LauncherApp, featureId?: string) => void;
  onInstall: (app: LauncherApp) => void;
};

/**
 * The tile's one big button. Install pulls the app's own bundle when the catalog
 * publishes one; for an app nothing has published yet it installs Midnite Studio,
 * which runs it today. Open launches the bundle's stub, or lands in Studio on the
 * app's own view.
 */
export function PrimaryAction({
  app,
  view,
  handlers,
  compact = false,
}: {
  app: LauncherApp;
  view: AppView;
  handlers: ActionHandlers;
  compact?: boolean;
}) {
  const cls = `btn btn-primary${compact ? ' btn-compact' : ''}`;
  if (view.installing) {
    const fraction = progressFraction(view.progress);
    return (
      <button type="button" className={`${cls} btn-progress`} disabled aria-busy="true">
        <span className="btn-progress-fill" style={{ transform: `scaleX(${fraction ?? 0.15})` }} aria-hidden="true" />
        <span className="btn-label">{progressLabel(view.progress)}</span>
      </button>
    );
  }
  switch (view.state) {
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
          onClick={() => handlers.onInstall(app)}
          aria-label={`Install Midnite ${app.name}`}
          title={view.source === 'studio' && app.id !== 'studio' ? `Installs Midnite Studio, which runs Midnite ${app.name} today` : undefined}
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
    case 'coming-soon':
      return (
        <button type="button" className={cls} disabled aria-disabled="true">
          Coming soon
        </button>
      );
  }
}
