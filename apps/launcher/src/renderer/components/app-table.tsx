import type { LauncherApp } from '../../common/catalog';
import { appNumber } from '../model';
import type { AppView } from '../use-apps';
import { AppIcon } from './app-icon';
import { AppMenu, type MenuItem } from './app-menu';
import { versionLine } from './app-tile';
import { PrimaryAction, type ActionHandlers } from './primary-action';
import { StatusPill } from './status-pill';
import { AppWordmark } from './wordmark';

export function AppTable({
  apps,
  viewOf,
  handlers,
  menuItemsFor,
}: {
  apps: readonly LauncherApp[];
  viewOf: (app: LauncherApp) => AppView;
  handlers: ActionHandlers & { onDetails: (app: LauncherApp) => void };
  menuItemsFor: (app: LauncherApp) => readonly MenuItem[];
}) {
  return (
    <div className="table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">App</th>
            <th scope="col">Features</th>
            <th scope="col">Status</th>
            <th scope="col">Version</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => {
            const view = viewOf(app);
            return (
              <tr
                key={app.id}
                data-brand={app.gradient === 'brand' || undefined}
                style={{ ['--accent' as string]: app.accent }}
              >
                <td>
                  {app.gradient === 'brand' && <span className="row-frame" aria-hidden="true" />}
                  <span className="chip-number" data-brand={app.gradient === 'brand' || undefined}>
                    {appNumber(app)}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="table-app"
                    onClick={() => handlers.onDetails(app)}
                  >
                    <AppIcon app={app} size={32} />
                    <span>
                      <AppWordmark app={app} />
                      <span className="table-tagline">{app.tagline}</span>
                    </span>
                  </button>
                </td>
                <td className="table-features">{app.features.map((f) => f.label).join(' · ')}</td>
                <td>
                  <StatusPill state={view.state} installing={view.installing} />
                </td>
                <td className="table-version">{versionLine(view)}</td>
                <td>
                  <div className="table-actions">
                    <PrimaryAction app={app} view={view} handlers={handlers} compact />
                    <AppMenu app={app} items={menuItemsFor(app)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
