import { useMemo, useState } from 'react';
import {
  LuExternalLink,
  LuHistory,
  LuRefreshCw,
  LuSearch,
  LuX,
} from 'react-icons/lu';

import { APPS, appById, type AppId } from '../../common/catalog';
import type { ChangelogCategory } from '../../common/changelog';
import type { ChangelogController } from '../use-changelog';

export type ChangelogViewProps = {
  changelog: ChangelogController;
  initialAppId?: AppId | 'all';
  onOpenExternalLink: (link: 'changelog' | 'website') => void;
};

const CATEGORY_ORDER: readonly ChangelogCategory[] = [
  'Added',
  'Changed',
  'Fixed',
  'Security',
  'Removed',
  'General',
];

export function ChangelogView({
  changelog,
  initialAppId = 'all',
  onOpenExternalLink,
}: ChangelogViewProps) {
  const [selectedApp, setSelectedApp] = useState<AppId | 'all'>(initialAppId);
  const [query, setQuery] = useState('');

  const { releases, loading, error, refresh, filter } = changelog;

  const filteredReleases = useMemo(() => {
    return filter(query, selectedApp);
  }, [filter, query, selectedApp]);

  // Compute item count per app for badges
  const appCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const app of APPS) {
      counts[app.id] = 0;
    }
    for (const r of releases) {
      for (const item of r.items) {
        counts.all = (counts.all ?? 0) + 1;
        for (const id of item.appIds) {
          counts[id] = (counts[id] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [releases]);

  return (
    <div className="changelog-container">
      <div className="changelog-header-bar">
        <div className="changelog-title-group">
          <div className="changelog-title-row">
            <LuHistory size={20} className="changelog-title-icon" aria-hidden="true" />
            <h1 className="changelog-title">Changelog</h1>
            <span className="changelog-suite-badge">Midnyte Studio Suite</span>
          </div>
          <p className="changelog-subtitle">
            User-facing updates across Midnyte Studio and individual apps.
          </p>
        </div>

        <div className="changelog-header-actions">
          <button
            type="button"
            className="btn btn-compact"
            onClick={() => onOpenExternalLink('changelog')}
            title="Open upstream CHANGELOG.md on GitHub"
          >
            <span>GitHub</span>
            <LuExternalLink size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-compact changelog-refresh"
            aria-label="Refresh changelog"
            title="Refresh changelog"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <LuRefreshCw size={14} className={loading ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      <div className="changelog-toolbar">
        <div className="changelog-app-filter-scroll" role="group" aria-label="Filter by app">
          <button
            type="button"
            className="filter"
            aria-pressed={selectedApp === 'all' || selectedApp === 'studio'}
            onClick={() => setSelectedApp('all')}
          >
            All
            <span className="filter-count">{appCounts.all ?? 0}</span>
          </button>
          {APPS.filter((a) => a.id !== 'studio').map((app) => (
            <button
              key={app.id}
              type="button"
              className="filter"
              aria-pressed={selectedApp === app.id}
              onClick={() => setSelectedApp(app.id)}
            >
              <span
                className="changelog-app-dot"
                style={{ backgroundColor: app.accent }}
                aria-hidden="true"
              />
              {app.name}
              <span className="filter-count">{appCounts[app.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="changelog-search-wrap">
          <label className="search">
            <LuSearch size={14} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search updates…"
              aria-label="Search updates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="changelog-search-clear"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <LuX size={12} />
              </button>
            )}
          </label>
        </div>
      </div>

      <div className="changelog-content-area">
        {loading && releases.length === 0 && (
          <div className="changelog-status-card">
            <LuRefreshCw size={20} className="spin" />
            <p>Loading changelog…</p>
          </div>
        )}

        {error && (
          <div className="banner" role="alert">
            <span className="pill pill-solid">Notice</span>
            <span className="banner-text">Changelog unavailable: {error}</span>
            <button type="button" className="btn btn-compact" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}

        {!loading && filteredReleases.length === 0 && (
          <div className="changelog-empty">
            <p className="empty">No updates found matching your filter or search.</p>
            {(selectedApp !== 'all' || query.trim() !== '') && (
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => {
                  setSelectedApp('all');
                  setQuery('');
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {filteredReleases.map((release) => {
          // Group items by category in preferred order
          const categoriesPresent = CATEGORY_ORDER.filter((cat) =>
            release.items.some((item) => item.category === cat),
          );

          return (
            <article key={release.version} className="changelog-release-card">
              <header className="changelog-release-header">
                <div className="changelog-release-badge-wrap">
                  <span className="changelog-version-chip">v{release.version}</span>
                  {release.date && (
                    <time className="changelog-release-date" dateTime={release.date}>
                      {release.date}
                    </time>
                  )}
                </div>
                <span className="changelog-release-count">
                  {release.items.length} {release.items.length === 1 ? 'change' : 'changes'}
                </span>
              </header>

              <div className="changelog-release-body">
                {categoriesPresent.map((category) => {
                  const items = release.items.filter((item) => item.category === category);
                  return (
                    <div key={category} className="changelog-category-block">
                      <h3 className="changelog-category-title">
                        <span className={`changelog-pill pill-${category.toLowerCase()}`}>
                          {category}
                        </span>
                        <span className="changelog-category-count">({items.length})</span>
                      </h3>

                      <ul className="changelog-list">
                        {items.map((item) => (
                          <li key={item.id} className="changelog-entry">
                            <div className="changelog-entry-main">
                              <span className="changelog-entry-title">{item.title}</span>
                              {item.body && (
                                <p className="changelog-entry-body">{item.body}</p>
                              )}
                            </div>

                            <div className="changelog-entry-apps">
                              {item.appIds
                                .filter((id) => id !== 'studio')
                                .map((id) => {
                                  const app = appById(id);
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      className="changelog-tag"
                                      style={{
                                        borderColor:
                                          selectedApp === id ? app.accent : 'var(--line)',
                                        color: selectedApp === id ? app.accent : 'var(--fg-muted)',
                                      }}
                                      title={`Filter to ${app.name} changes`}
                                      onClick={() => setSelectedApp(id)}
                                    >
                                      <span
                                        className="changelog-tag-dot"
                                        style={{ backgroundColor: app.accent }}
                                      />
                                      {app.name}
                                    </button>
                                  );
                                })}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
