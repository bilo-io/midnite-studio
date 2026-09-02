import { Accordion } from '@bilo-io/ui';
import { LuFilter, LuPanelLeft, LuRefreshCw } from 'react-icons/lu';

import { useUiStore, VIEW_IDS, type NavMode, type ViewId } from '../../../store/ui-store';
import {
  ALL_SECTIONS,
  childrenOf,
  filtersByDefault,
  VIEW_FILTERS,
  type SectionKey,
} from '../../repos/view-sections';
import { Choice, Field } from './controls';

/**
 * The repositories sidebar's settings page.
 *
 * The panel's funnel button flips one view's narrowing at a time, from inside
 * that view; this page is the same setting seen whole — every view's answer in
 * one column, plus the way back to the defaults. Both write
 * `sectionFilters`, so flipping a row here is immediately what the funnel
 * button reads, and vice versa.
 */

/** The rail's names for the views, so the two lists read as one vocabulary. */
const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: 'Dashboard',
  files: 'Files',
  search: 'Search',
  tests: 'Tests',
  graph: 'Graph',
  changes: 'Changes',
  actions: 'Actions',
  reviews: 'Reviews',
  history: 'History',
  councils: 'Councils',
  workflows: 'Workflows',
  sessions: 'Sessions',
  settings: 'Settings',
};


/**
 * The sidebar's own section headings, reused as the filter's vocabulary.
 *
 * `branches`, `forge` and `stashes` are placeholders in the sense that
 * `SectionKey` widened for them in Phase 28 Theme A before any `VIEW_FILTERS`
 * entry named one directly — `Record<SectionKey, string>` makes an incomplete
 * label map a compile error rather than an `undefined` string. `stashes` has
 * no row anywhere on this page yet: Phase 22 is what gives it a body to
 * describe. `branches` and `forge` are used by `describeNarrowed` below,
 * which reads the nesting these labels imply.
 */
const SECTION_LABELS: Record<SectionKey, string> = {
  local: 'Local',
  remotes: 'Remotes',
  tags: 'Tags',
  worktrees: 'Worktrees',
  branches: 'Branches',
  forge: 'Forge',
  stashes: 'Stashes',
  actions: 'Actions',
  reviews: 'Reviews',
  issues: 'Issues',
  tests: 'Tests',
};

/**
 * Collapses a set of leaf sections to parent names wherever every one of a
 * parent's children is present — "Branches", not "Local and Remotes" — and
 * leaves a section naming only some of a parent's children exactly as given.
 * Order-preserving against `ALL_SECTIONS`, so the result reads in tree order
 * regardless of the input's own order.
 *
 * A pure function of `SectionKey`s rather than of `ViewId` so it is testable
 * against inputs `VIEW_FILTERS` does not happen to produce today — no entry
 * currently names every child of a parent, which is exactly the case this
 * exists for.
 */
export function summarizeSections(sections: readonly SectionKey[]): readonly SectionKey[] {
  const admitted = new Set(sections);
  for (const key of ALL_SECTIONS) {
    const children = childrenOf(key);
    if (children.length > 0 && children.every((child) => admitted.has(child))) {
      children.forEach((child) => admitted.delete(child));
      admitted.add(key);
    }
  }
  return ALL_SECTIONS.filter((key) => admitted.has(key));
}

/**
 * What "narrowed" means for one view, in the sidebar's own section names —
 * spelt out from `VIEW_FILTERS` rather than written by hand, so a view whose
 * narrowing changes cannot leave a stale description here.
 */
function describeNarrowed(view: ViewId): string {
  const filter = VIEW_FILTERS[view];
  const names = summarizeSections(filter.sections)
    .map((key) => SECTION_LABELS[key])
    .join(' and ');
  return filter.dirtyOnly ? `${names} only, and only checkouts with changes` : `${names} only`;
}

function ViewRow({ view }: { view: ViewId }) {
  const override = useUiStore((s) => s.sectionFilters[view]);
  const setSectionFilter = useUiStore((s) => s.setSectionFilter);
  const narrowedByDefault = filtersByDefault(view);
  const narrowed = override ?? narrowedByDefault;

  const options: [boolean, string, string][] = [
    [true, 'Narrowed', describeNarrowed(view)],
    [false, 'Everything', 'Every section, every checkout'],
  ];

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-xs">
        {VIEW_LABELS[view]}
        {/*
          Which of the two the view would do on its own — visible, not just in
          the reset button's promise, or "back to defaults" is a jump into the
          dark for anyone who has flipped a few rows and forgotten which.
        */}
        <span className="ml-1.5 text-[11px] text-muted-foreground">
          {narrowedByDefault ? 'narrowed by default' : 'everything by default'}
        </span>
      </span>
      <div role="radiogroup" aria-label={VIEW_LABELS[view]} className="flex shrink-0 gap-1">
        {options.map(([value, label, title]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={narrowed === value}
            title={title}
            onClick={() => setSectionFilter(view, value)}
            className={`h-6 rounded-md border px-2 text-xs transition-colors ${
              narrowed === value
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SidebarPage() {
  const overrides = useUiStore((s) => s.sectionFilters);
  const resetSectionFilters = useUiStore((s) => s.resetSectionFilters);
  const anyOverride = Object.keys(overrides).length > 0;
  /*
    Nav mode lives in the UI store, not the appearance store: it is the shape of
    the window rather than a theme token, and `AppFrame` reads it straight off
    `useUiStore` (see `app.tsx`). The rail's chevron is the same setting seen
    from the other side — a two-state pin between `auto` and `expanded` — so
    both controls write the one field and each reflects the other immediately.

    Moved here from Appearance: locking the nav is a sidebar decision, and this
    page is where someone looking for it looks. Locked closed really means
    closed — the rail never hover-expands in that mode; each item names itself
    in a tooltip instead (that behaviour is `AppFrame`'s, keyed off this value).
  */
  const navMode = useUiStore((s) => s.navMode);
  const setNavMode = useUiStore((s) => s.setNavMode);
  const autoFetchIntervalMs = useUiStore((s) => s.autoFetchIntervalMs);
  const setAutoFetchIntervalMs = useUiStore((s) => s.setAutoFetchIntervalMs);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Navigation" icon={<LuPanelLeft className="h-4 w-4" />} defaultOpen>
        <div className="p-3">
          <Choice<NavMode>
            label="Side navigation"
            hint="Lock the nav open or closed, or let it stay collapsed and expand on hover."
            value={navMode}
            onChange={setNavMode}
            options={[
              ['auto', 'Auto', 'Collapsed; expands on hover'],
              ['expanded', 'Locked open', 'Always expanded'],
              [
                'collapsed',
                'Locked closed',
                'Always the icon bar — never expands, items show tooltips',
              ],
            ]}
          />
        </div>
      </Accordion>

      <Accordion
        title="View filters"
        icon={<LuFilter className="h-4 w-4" />}
        count={Object.keys(overrides).length || undefined}
        defaultOpen
      >
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="What each view shows"
            hint="Views that are a question about a subset — Changes, Actions, Tests — arrive narrowed to it; the rest start with the whole tree. This is the setting the panel's own filter button flips, one view at a time."
          >
            <div className="flex flex-col gap-1.5">
              {VIEW_IDS.map((view) => (
                <ViewRow key={view} view={view} />
              ))}
            </div>
          </Field>

          <Field
            label="Reset"
            hint="Forget every per-view choice above and let each view decide again."
          >
            <button
              type="button"
              onClick={resetSectionFilters}
              disabled={!anyOverride}
              className="h-6 w-fit rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset to view defaults
            </button>
          </Field>
        </div>
      </Accordion>

      <Accordion title="Repository Sync" icon={<LuRefreshCw className="h-4 w-4" />} defaultOpen>
        <div className="p-3">
          <Field
            label="Auto fetch interval"
            hint="Fetch all listed repositories automatically. Range is 10s to 10m."
          >
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="10"
                max="600"
                step="1"
                value={autoFetchIntervalMs ? Math.round(autoFetchIntervalMs / 1000) : 60}
                onChange={(e) => setAutoFetchIntervalMs(parseInt(e.target.value) * 1000)}
                className="flex-1"
              />
              <input
                type="number"
                min="10"
                max="600"
                value={autoFetchIntervalMs ? Math.round(autoFetchIntervalMs / 1000) : 60}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val)) return;
                  setAutoFetchIntervalMs(Math.max(10, Math.min(600, val)) * 1000);
                }}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}
