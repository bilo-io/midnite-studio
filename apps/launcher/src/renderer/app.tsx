import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuLayoutGrid, LuMonitor, LuMoon, LuRefreshCw, LuSearch, LuSun, LuTable, LuX } from 'react-icons/lu';

import type { ThemeSource } from '../common/bridge';
import { APPS, SECTION_LABELS, type AppId, type LauncherApp } from '../common/catalog';
import { getBridge } from './bridge';
import { AppDetail } from './components/app-detail';
import type { MenuItem } from './components/app-menu';
import { AppTable } from './components/app-table';
import { AppTile } from './components/app-tile';
import { LauncherWordmark } from './components/wordmark';
import { FILTER_LABELS, FILTERS, filterCounts, visibleSections, type Filter, type SortKey } from './model';
import { applyTheme, readTheme } from './theme';
import { useStudio } from './use-studio';

type Layout = 'grid' | 'table';

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
  const studio = useStudio();
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
  const [confirmUninstall, setConfirmUninstall] = useState(false);
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

  const stateOf = useCallback(() => studio.state, [studio.state]);
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
    onInstall: () => {
      void studio.install().then((r) => report(r, 'Midnite Studio is installed.'));
    },
    onDetails: (app: LauncherApp) => setDetail(app),
  };

  const installed = studio.state === 'installed' || studio.state === 'update';
  const menuItemsFor = (app: LauncherApp): MenuItem[] => [
    { id: 'details', label: 'About this app', onSelect: () => setDetail(app) },
    { id: 'notes', label: 'Release notes', onSelect: () => void bridge.links.open('notes') },
    ...(installed
      ? [
          { id: 'reveal', label: 'Show Midnite Studio in Finder', onSelect: () => void bridge.studio.reveal().then((r) => report(r)) },
          ...(studio.state === 'update'
            ? [{ id: 'update', label: 'Update Midnite Studio', onSelect: handlers.onInstall, disabled: studio.installing }]
            : []),
          { id: 'uninstall', label: 'Move Midnite Studio to Trash…', danger: true, onSelect: () => setConfirmUninstall(true) },
        ]
      : [{ id: 'download', label: 'Download page', onSelect: () => void bridge.links.open('download') }]),
  ];

  const showBanner = studio.state === 'update' && !bannerDismissed && studio.status?.latest;

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
            onClick={() => void studio.refresh()}
            disabled={studio.refreshing}
          >
            <LuRefreshCw size={15} className={studio.refreshing ? 'spin' : undefined} />
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
              <button type="button" className="btn btn-primary btn-compact" onClick={handlers.onInstall} disabled={studio.installing}>
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
                  <AppTile key={app.id} app={app} studio={studio} handlers={handlers} menuItems={menuItemsFor(app)} />
                ))}
              </div>
            ) : (
              <AppTable apps={group.apps} studio={studio} handlers={handlers} menuItemsFor={menuItemsFor} />
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

      {detail && <AppDetail app={detail} studio={studio} handlers={handlers} onClose={() => setDetail(null)} />}

      {confirmUninstall && (
        <div className="sheet-backdrop sheet-backdrop-center">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="uninstall-title">
            <h2 id="uninstall-title" className="dialog-title">
              Move Midnite Studio to the Trash?
            </h2>
            <p className="dialog-body">
              Every app in this launcher runs in Midnite Studio today, so all {APPS.length} of them go with it. Your
              settings, repositories and media stay where they are, and you can put it back from the Trash.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmUninstall(false)} autoFocus>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmUninstall(false);
                  void studio.uninstall().then((r) => report(r, 'Midnite Studio moved to the Trash.'));
                }}
              >
                Move to Trash
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
