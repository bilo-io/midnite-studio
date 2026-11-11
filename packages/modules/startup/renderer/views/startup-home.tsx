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
 * Themes B to F replace each placeholder with its view.
 */
export function StartupHome({ view }: { view: string }) {
  const title = startupViewTitle(view);
  return (
    <main className="flex h-full min-h-0 flex-col gap-1 p-6" aria-label={title}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Startup</p>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">Coming together in the next slices of Phase 130.</p>
    </main>
  );
}
