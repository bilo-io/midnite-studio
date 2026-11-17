import type { LauncherApp } from '../../common/catalog';
import { replacesLine } from '../../common/migration';
import { appNumber } from '../model';
import type { AppView } from '../use-apps';
import { AppIcon } from './app-icon';
import { MODULE_GLYPHS } from '../app-glyphs';
import { AppMenu, type MenuItem } from './app-menu';
import { PrimaryAction, type ActionHandlers } from './primary-action';
import { StatusPill } from './status-pill';
import { AppWordmark } from './wordmark';

export type TileProps = {
  app: LauncherApp;
  view: AppView;
  handlers: ActionHandlers & { onDetails: (app: LauncherApp) => void };
  menuItems: readonly MenuItem[];
};

export function versionLine(view: AppView): string {
  if (view.state === 'coming-soon') return 'Coming soon';
  const version = view.version ?? view.latest;
  if (!version) return view.feedError ?? '—';
  const date = view.releasedAt ? new Date(view.releasedAt) : null;
  return date
    ? `Version ${version} · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : `Version ${version}`;
}

export function AppTile({ app, view, handlers, menuItems }: TileProps) {
  return (
    <article
      className="tile"
      data-brand={app.gradient === 'brand' || undefined}
      style={{ ['--accent' as string]: app.accent }}
      aria-labelledby={`tile-${app.id}`}
    >
      <span className="tile-glow" aria-hidden="true" />
      <header className="tile-head">
        <span className="chip-number" data-brand={app.gradient === 'brand' || undefined}>{appNumber(app)}</span>
        <div className="tile-head-links">
          {app.runsIn === 'studio' && app.id !== 'studio' && view.source === 'studio' && !app.comingSoon && <span className="caption">Runs in Studio</span>}
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

      {app.modules.length > 1 && (
        <ul className="tile-modules" aria-label={`Midnite ${app.name} modules`}>
          {app.modules.map((m) => {
            const Glyph = MODULE_GLYPHS[m.id];
            return (
              <li key={m.id} className="module-chip" data-soon={m.comingSoon || undefined}>
                <Glyph size={12} aria-hidden="true" />
                {m.name}
              </li>
            );
          })}
        </ul>
      )}

      {view.replaces.length > 0 && <p className="tile-replaces">{replacesLine(view.replaces)}</p>}

      <ul className="tile-features" aria-label={`Midnite ${app.name} features`}>
        {app.features.map((f) => (
          <li key={f.id}>{f.label}</li>
        ))}
      </ul>

      <div className="tile-meta">
        <StatusPill state={view.state} installing={view.installing} />
        <span className="tile-version">{versionLine(view)}</span>
      </div>

      <footer className="tile-actions">
        <PrimaryAction app={app} view={view} handlers={handlers} />
        <AppMenu app={app} items={menuItems} />
      </footer>
    </article>
  );
}
