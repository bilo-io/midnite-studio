import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuLayoutGrid, LuMonitor, LuMoon, LuRefreshCw, LuSearch, LuSun, LuTable, LuTrash2, LuX } from 'react-icons/lu';

import type { LauncherResult, ThemeSource } from '../common/bridge';
import { APPS, SECTION_LABELS, appById, type AppId, type LauncherApp } from '../common/catalog';
import { getBridge } from './bridge';
import { AppDetail } from './components/app-detail';
import type { MenuItem } from './components/app-menu';
import { AppTable } from './components/app-table';
import { AppTile } from './components/app-tile';
import { LauncherWordmark } from './components/wordmark';
import {
  FILTER_LABELS,
  FILTERS,
  filterCounts,
  removableApps,
  removalSummary,
  visibleSections,
  type Filter,
  type SortKey,
} from './model';
import { applyTheme, readTheme } from './theme';
import { useApps } from './use-apps';

type Layout = 'grid' | 'table';
const STUDIO_APP = appById('studio');

const THEME_OPTIONS: readonly { value: ThemeSource; label: string; Icon: typeof LuSun }[] = [
  { value: 'system', label: 'System theme', Icon: LuMonitor },
  { value: 'light', label: 'Light theme', Icon: LuSun },
  { value: 'dark', label: 'Dark theme', Icon: LuMoon },
];
const LAYOUT_KEY = 'midnite-launcher.layout';

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid';
  }
}

function checkedAgo(checkedAt: number | undefined, now: number): string {
  if (checkedAt === undefined) return 'Checking';
  const s = Math.round((now - checkedAt) / 1000);
  if (s < 30) return 'Checked just now';
  if (s < 3600) return `Checked ${Math.round(s / 60)}m ago`;
  return `Checked ${Math.round(s / 3600)}h ago`;
}

export function App() {
  const apps = useApps();
  const { studio } = apps;
  const bridge = getBridge();
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const [theme, setThemeState] = useState<ThemeSource>(readTheme);
  const setTheme = (next: ThemeSource) => {
    setThemeState(next);
    applyTheme(next);
  };
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('suite');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<LauncherApp | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState<LauncherApp | null>(null);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);

  // A `midnite://` link for an app that cannot open yet lands here: its detail sheet, which is where Install lives.
  useEffect(() => {
    const show = (id: AppId) => setDetail(APPS.find((a) => a.id === id) ?? null);
    void bridge.apps.takePending().then((id) => {
      if (id !== null) show(id);
    });
    return bridge.apps.onShow(show);
  }, [bridge]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const setLayout = (next: Layout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // per-viewer convenience only
    }
  };

  const { viewOf } = apps;
  const stateOf = useCallback((app: LauncherApp) => viewOf(app).state, [viewOf]);
  const counts = useMemo(() => filterCounts(stateOf), [stateOf]);
  const sections = useMemo(() => visibleSections({ filter, query, sort, stateOf }), [filter, query, sort, stateOf]);

  const report = (result: { ok: boolean; message?: string }, success?: string) => {
    if (!result.ok) setToast({ message: result.message ?? 'Something went wrong.', tone: 'error' });
    else if (success) setToast({ message: success, tone: 'info' });
  };

  const handlers = {
    onOpen: (app: LauncherApp, featureId?: string) => {
      void bridge.apps.open(app.id, featureId).then((r) => report(r));
    },
    onInstall: (app: LauncherApp) => {
      const hosted = app.id === 'studio' || viewOf(app).source === 'studio';
      void apps.install(app).then((r) => report(r, hosted ? 'Midnite Studio is installed.' : `Midnite ${app.name} is installed.`));
    },
    onDetails: (app: LauncherApp) => setDetail(app),
  };

  const menuItemsFor = (app: LauncherApp): MenuItem[] => {
    const view = viewOf(app);
    if (view.state === 'coming-soon') {
      return [{ id: 'details', label: 'About this app', onSelect: () => setDetail(app) }];
    }
    const base: MenuItem[] = [
      { id: 'details', label: 'About this app', onSelect: () => setDetail(app) },
      { id: 'notes', label: 'Release notes', onSelect: () => void bridge.links.open('notes') },
    ];
    if (view.source === 'bundle') {
      // Its own bundle: every action here touches this one app and nothing else.
      const has = view.state === 'installed' || view.state === 'update';
      return [
        ...base,
        ...(has
          ? [
              ...(view.state === 'update'
                ? [{ id: 'update', label: `Update Midnite ${app.name}`, onSelect: () => handlers.onInstall(app), disabled: view.installing }]
                : []),
              { id: 'uninstall', label: `Move Midnite ${app.name} to Trash…`, danger: true, onSelect: () => setConfirmUninstall(app) },
            ]
          : view.studioFallback
            ? [{ id: 'open-studio', label: `Open in Midnite Studio`, onSelect: () => handlers.onOpen(app) }]
            : []),
      ];
    }
    // Hosted by Studio: the Studio install is what these act on, exactly as before.
    const hosted = view.state === 'installed' || view.state === 'update';
    return [
      ...base,
      ...(hosted
        ? [
            { id: 'reveal', label: 'Show Midnite Studio in Finder', onSelect: () => void bridge.studio.reveal().then((r) => report(r)) },
            ...(view.state === 'update'
              ? [{ id: 'update', label: 'Update Midnite Studio', onSelect: () => handlers.onInstall(app), disabled: view.installing }]
              : []),
            {
              id: 'uninstall',
              label: 'Move Midnite Studio to Trash…',
              danger: true,
              onSelect: () => setConfirmUninstall(STUDIO_APP),
            },
          ]
        : [{ id: 'download', label: 'Download page', onSelect: () => void bridge.links.open('download') }]),
    ];
  };

  const removable = useMemo(() => removableApps(viewOf), [viewOf]);
  // One at a time, through the same per-app ops as each tile's own Move to Trash, so every guard
  // still applies; a running app refuses and is reported, and the rest still go.
  const removeAll = async (targets: readonly LauncherApp[]) => {
    setRemovingAll(true);
    const results: { app: LauncherApp; result: LauncherResult }[] = [];
    try {
      for (const app of targets) results.push({ app, result: await apps.uninstall(app) });
    } finally {
      setRemovingAll(false);
    }
    setToast(removalSummary(results));
  };

  const studioView = viewOf(STUDIO_APP);
  const showBanner = studioView.state === 'update' && !bannerDismissed && studio.status?.latest;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <LauncherWordmark />
        </div>
        <div className="topbar-tabs">
          <span className="tab tab-active">Launcher</span>
          <span className="tab">Midnite app suite</span>
        </div>
        <div className="topbar-right">
          <div className="segmented" role="group" aria-label="Layout">
            <button type="button" className="tab" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>
              <LuLayoutGrid size={13} aria-hidden="true" /> Grid
            </button>
            <button type="button" className="tab" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}>
              <LuTable size={13} aria-hidden="true" /> Table
            </button>
          </div>
          <div className="segmented theme-switch" role="group" aria-label="Theme">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                className="tab"
                aria-label={label}
                title={label}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-icon topbar-refresh"
            aria-label="Check again"
            onClick={() => void apps.refresh()}
            disabled={apps.refreshing}
          >
            <LuRefreshCw size={15} className={apps.refreshing ? 'spin' : undefined} />
          </button>
          <button
            type="button"
            className="btn btn-icon topbar-remove-all"
            aria-label="Move all apps to Trash…"
            title={removable.length === 0 ? 'No apps installed' : 'Move all apps to Trash…'}
            onClick={() => setConfirmRemoveAll(true)}
            disabled={removable.length === 0 || removingAll}
          >
            <LuTrash2 size={15} />
          </button>
        </div>
      </header>

      <main className="content">
        {showBanner && studio.status?.latest && (
          <div className="banner" role="status">
            <span className="pill pill-solid">Update</span>
            <span className="banner-text">Midnite Studio {studio.status.latest.version} is available.</span>
            <div className="banner-actions">
              <button type="button" className="link" onClick={() => void bridge.links.open('notes')}>
                What’s new ↗
              </button>
              <button type="button" className="btn btn-primary btn-compact" onClick={() => handlers.onInstall(STUDIO_APP)} disabled={studio.installing}>
                {studio.installing ? 'Updating…' : 'Update'}
              </button>
              <button type="button" className="btn btn-icon" aria-label="Dismiss" onClick={() => setBannerDismissed(true)}>
                <LuX size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="toolbar">
          <div className="filters" role="group" aria-label="Filter apps">
            {FILTERS.map((f) => (
              <button key={f} type="button" className="filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {FILTER_LABELS[f]} <span className="filter-count">{counts[f]}</span>
              </button>
            ))}
          </div>
          <div className="toolbar-right">
            <label className="sort">
              <span className="eyebrow">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="suite">Suite order</option>
                <option value="name">Name</option>
              </select>
            </label>
            <label className="search">
              <LuSearch size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search apps"
                aria-label="Search apps"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </div>

        {sections.length === 0 && <p className="empty">No apps match. Try another filter or search.</p>}

        {sections.map((group, i) => (
          <section key={group.section} className="section" aria-labelledby={`section-${group.section}`}>
            <div className="section-head">
              <h2 className="eyebrow" id={`section-${group.section}`}>
                <span className="section-index">{String(i + 1).padStart(2, '0')} /</span> {SECTION_LABELS[group.section]}
              </h2>
              <span className="eyebrow">
                {group.apps.length} {group.apps.length === 1 ? 'app' : 'apps'}
              </span>
            </div>
            {layout === 'grid' ? (
              <div className="grid">
                {group.apps.map((app) => (
                  <AppTile key={app.id} app={app} view={viewOf(app)} handlers={handlers} menuItems={menuItemsFor(app)} />
                ))}
              </div>
            ) : (
              <AppTable apps={group.apps} viewOf={viewOf} handlers={handlers} menuItemsFor={menuItemsFor} />
            )}
          </section>
        ))}
      </main>

      <footer className="statusbar">
        <span className="eyebrow">
          {checkedAgo(studio.status?.checkedAt, Date.now())} · {studio.status?.feedError ?? 'using the midnite-apps feed'}
        </span>
        <span className="statusbar-right">
          <button type="button" className="link eyebrow" onClick={() => void bridge.links.open('website')}>
            Website ↗
          </button>
          <button type="button" className="link eyebrow" onClick={() => void bridge.links.open('github')}>
            GitHub ↗
          </button>
          <span className="eyebrow">
            {APPS.length} apps · Launcher {bridge.launcherVersion} · macOS {bridge.platform.arch}
          </span>
        </span>
      </footer>

      {detail && <AppDetail app={detail} view={viewOf(detail)} handlers={handlers} onClose={() => setDetail(null)} />}

      {confirmUninstall && (
        <div className="sheet-backdrop sheet-backdrop-center">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="uninstall-title">
            <h2 id="uninstall-title" className="dialog-title">
              Move Midnite {confirmUninstall.name} to the Trash?
            </h2>
            <p className="dialog-body">
              {confirmUninstall.id === 'studio'
                ? `Every app in this launcher runs in Midnite Studio today, so all ${APPS.length} of them go with it. Your settings, repositories and media stay where they are, and you can put it back from the Trash.`
                : `Only Midnite ${confirmUninstall.name} is removed — its app and its Dock icon. The other apps and Midnite Studio stay, your data stays where it is, and you can put it back from the Trash.`}
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmUninstall(null)} autoFocus>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const target = confirmUninstall;
                  setConfirmUninstall(null);
                  void apps.uninstall(target).then((r) => report(r, `Midnite ${target.name} moved to the Trash.`));
                }}
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveAll && (
        <div className="sheet-backdrop sheet-backdrop-center">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-all-title">
            <h2 id="remove-all-title" className="dialog-title">
              Move {removable.length === 1 ? 'this app' : `all ${removable.length} apps`} to the Trash?
            </h2>
            <ul className="dialog-list">
              {removable.map((app) => (
                <li key={app.id}>
                  Midnite {app.name}
                  {app.id === 'studio' && studio.status?.running ? ' — running, will be skipped' : ''}
                </li>
              ))}
            </ul>
            <p className="dialog-body">
              {removable.some((app) => app.id === 'studio')
                ? `Every app in this launcher runs in Midnite Studio today, so they all go with it. `
                : ''}
              An app that is running is skipped — quit it first. Midnite Apps stays, your settings, repositories and media stay where
              they are, and you can put any of them back from the Trash.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmRemoveAll(false)} autoFocus>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmRemoveAll(false);
                  void removeAll(removable);
                }}
              >
                Move all to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span>{toast.message}</span>
          <button type="button" className="btn btn-icon" aria-label="Dismiss" onClick={() => setToast(null)}>
            <LuX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
