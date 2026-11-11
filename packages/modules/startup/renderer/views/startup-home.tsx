import { useStartupSnapshot } from '../data/use-startup';
import { RoadmapView } from '../roadmap/roadmap-view';
import { CompanyForm } from './company-form';

const TITLES: Readonly<Record<string, string>> = {
  'startup.overview': 'Overview',
  'startup.roadmap': 'Roadmap',
  'startup.runway': 'Runway',
  'startup.invoices': 'Invoices',
  'startup.vendors': 'Vendors',
};

/** The view's heading; an unknown id falls back to Overview, as a stale deep link should. */
export function startupViewTitle(view: string): string {
  return TITLES[view] ?? 'Overview';
}

/**
 * What Startup shows in the shell: the rail's rows are the five views, so the page is only the active one.
 * With no company yet every view is the setup form; a workspace that cannot load shows why. Themes C to F
 * replace each placeholder with its view.
 */
export function StartupHome({ view }: { view: string }) {
  const title = startupViewTitle(view);
  const snapshot = useStartupSnapshot();
  if (snapshot.isPending) return <p className="p-6 text-xs text-muted-foreground">Loading…</p>;
  if (snapshot.isError) {
    return (
      <main className="p-6" aria-label={title}>
        <p role="alert" className="text-sm text-red-500">
          {snapshot.error.message}
        </p>
      </main>
    );
  }
  const { workspace, readOnly } = snapshot.data;
  if (workspace.company === null) {
    return (
      <main className="flex h-full min-h-0 flex-col overflow-y-auto" aria-label={title}>
        <CompanyForm company={null} heading="Set up your company" />
      </main>
    );
  }
  if (view === 'startup.roadmap') return <RoadmapView milestones={workspace.milestones} />;
  return (
    <main className="flex h-full min-h-0 flex-col gap-1 p-6" aria-label={title}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{workspace.company.name}</p>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {readOnly ? <p className="text-xs text-amber-500">This workspace was written by a newer Midnite Startup. It is read-only here.</p> : null}
      <p className="text-sm text-muted-foreground">Coming together in the next slices of Phase 130.</p>
    </main>
  );
}
