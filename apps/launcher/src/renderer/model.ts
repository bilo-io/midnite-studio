import { APPS, SECTION_ORDER, type AppSection, type LauncherApp } from '../common/catalog';
import type { AppInstallState } from '../common/status';

/** The filter strip: ArtCraft's All / Installed / Updates / Not installed. */
export const FILTERS = ['all', 'installed', 'updates', 'not-installed'] as const;
export type Filter = (typeof FILTERS)[number];

export const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  installed: 'Installed',
  updates: 'Updates',
  'not-installed': 'Not installed',
};

export type SortKey = 'suite' | 'name';

export function matchesFilter(filter: Filter, state: AppInstallState): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'installed':
      return state === 'installed' || state === 'update';
    case 'updates':
      return state === 'update';
    case 'not-installed':
      return state === 'not-installed';
  }
}

/** Case-insensitive match over everything a tile shows — name, pitch, features. */
export function matchesQuery(app: LauncherApp, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const haystack = [
    `midnite ${app.name}`,
    app.tagline,
    app.like,
    ...app.features.flatMap((f) => [f.label, f.blurb]),
  ]
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

export function filterCounts(stateOf: (app: LauncherApp) => AppInstallState): Record<Filter, number> {
  const counts = { all: 0, installed: 0, updates: 0, 'not-installed': 0 };
  for (const app of APPS) {
    for (const filter of FILTERS) if (matchesFilter(filter, stateOf(app))) counts[filter]++;
  }
  return counts;
}

/** The suite number shown on a tile's chip: its position in catalog order, from 01. */
export function appNumber(app: LauncherApp): string {
  return String(APPS.indexOf(app) + 1).padStart(2, '0');
}

export type SectionGroup = { section: AppSection; apps: LauncherApp[] };

/** The visible apps, grouped by section in suite order; empty sections are dropped. */
export function visibleSections(opts: {
  filter: Filter;
  query: string;
  sort: SortKey;
  stateOf: (app: LauncherApp) => AppInstallState;
}): SectionGroup[] {
  return SECTION_ORDER.map((section) => {
    const apps = APPS.filter(
      (app) => app.section === section && matchesFilter(opts.filter, opts.stateOf(app)) && matchesQuery(app, opts.query),
    );
    if (opts.sort === 'name') apps.sort((a, b) => a.name.localeCompare(b.name));
    return { section, apps };
  }).filter((group) => group.apps.length > 0);
}
