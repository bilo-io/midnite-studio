import type { LauncherApp } from '../../common/catalog';
import { appNumber } from '../model';
import type { StudioController } from '../use-studio';
import { AppIcon } from './app-icon';
import { AppMenu, type MenuItem } from './app-menu';
import { PrimaryAction, type ActionHandlers } from './primary-action';
import { StatusPill } from './status-pill';
import { AppWordmark } from './wordmark';

export type TileProps = {
  app: LauncherApp;
  studio: StudioController;
  handlers: ActionHandlers & { onDetails: (app: LauncherApp) => void };
  menuItems: readonly MenuItem[];
};

export function versionLine(studio: StudioController): string {
  const { status } = studio;
  if (status === null) return '—';
  const version = status.installed?.version ?? status.latest?.version;
  if (!version) return status.feedError ?? '—';
  const date = status.latest?.releasedAt ? new Date(status.latest.releasedAt) : null;
  return date
    ? `Version ${version} · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : `Version ${version}`;
}

export function AppTile({ app, studio, handlers, menuItems }: TileProps) {
  return (
    <article className="tile" style={{ ['--accent' as string]: app.accent }} aria-labelledby={`tile-${app.id}`}>
      <header className="tile-head">
        <span className="chip-number">{appNumber(app)}</span>
        <div className="tile-head-links">
          {app.runsIn === 'studio' && app.id !== 'studio' && <span className="caption">Runs in Studio</span>}
          <button type="button" className="link" onClick={() => handlers.onDetails(app)}>
            Details ↗
          </button>
        </div>
      </header>

      <button type="button" className="tile-body" onClick={() => handlers.onDetails(app)} id={`tile-${app.id}`}>
        <AppIcon app={app} />
        <span className="tile-title">
          <AppWordmark app={app} />
          <span className="tile-tagline">{app.tagline}</span>
          <span className="tile-like">{app.like}</span>
        </span>
      </button>

      <ul className="tile-features" aria-label={`Midnite ${app.name} features`}>
        {app.features.map((f) => (
          <li key={f.id}>{f.label}</li>
        ))}
      </ul>

      <div className="tile-meta">
        <StatusPill state={studio.state} installing={studio.installing} />
        <span className="tile-version">{versionLine(studio)}</span>
      </div>

      <footer className="tile-actions">
        <PrimaryAction app={app} studio={studio} handlers={handlers} />
        <AppMenu app={app} items={menuItems} />
      </footer>
    </article>
  );
}
