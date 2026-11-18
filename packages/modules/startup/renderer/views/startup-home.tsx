import { Suspense, lazy } from 'react';

import { moneyCurrency, seedFleetCatalog, type FleetCatalog } from '@midnite/studio-shared';

import { useStartupSnapshot } from '../data/use-startup';
import { InvoicesView } from '../invoices/invoices-view';
import { RoadmapView } from '../roadmap/roadmap-view';
import { useProjectionsUi } from '../projections/use-projections-ui';
import { RunwayView } from '../runway/runway-view';
import { UpdatesView } from '../updates/updates-view';
import { VendorsView } from '../vendors/vendors-view';
import { CompanyForm } from './company-form';
import { Overview } from './overview';

// A workspace with no catalog of its own prices from the seeded built-ins; one object per currency keeps the model's memo stable.
const SEEDED = new Map<string, FleetCatalog>();
const seeded = (currency: string): FleetCatalog => {
  let c = SEEDED.get(currency);
  if (c === undefined) SEEDED.set(currency, (c = seedFleetCatalog(currency)));
  return c;
};

// Projections is the heaviest view and the home view; its own chunk keeps the app's entry small.
const ProjectionsView = lazy(() => import('../projections/projections-view'));

const TITLES: Readonly<Record<string, string>> = {
  'startup.projections': 'Projections',
  'startup.overview': 'Overview',
  'startup.roadmap': 'Roadmap',
  'startup.runway': 'Runway',
  'startup.updates': 'Updates',
  'startup.invoices': 'Invoices',
  'startup.vendors': 'Vendors',
};

/** The view's heading; an unknown id falls back to Overview, as a stale deep link should. */
export function startupViewTitle(view: string): string {
  return TITLES[view] ?? 'Overview';
}

/**
 * What Startup shows in the shell: the rail's rows are the five views, so the page is only the active one.
 * With no company yet every view is the setup form; a workspace that cannot load shows why.
 */
export function StartupHome({ view, onView }: { view: string; onView: (view: string) => void }) {
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
  const currency = moneyCurrency(workspace.company);
  // Projections needs no company, so it renders before the setup gate.
  if (view === 'startup.projections') return (
      <Suspense fallback={<p className="p-6 text-xs text-muted-foreground">Loading…</p>}>
        <ProjectionsView projections={workspace.fleetProjections} readOnly={readOnly} currency={currency} catalog={workspace.fleetCatalog ?? seeded(currency)} lines={workspace.lines} hasCompany={workspace.company !== null} />
      </Suspense>
    );
  if (workspace.company === null) {
    return (
      <main className="flex h-full min-h-0 flex-col overflow-y-auto" aria-label={title}>
        <CompanyForm company={null} heading="Set up your company" />
      </main>
    );
  }
  if (view === 'startup.roadmap') return <RoadmapView milestones={workspace.milestones} />;
  if (view === 'startup.runway') return <RunwayView
        company={workspace.company}
        lines={workspace.lines}
        scenarios={workspace.scenarios}
        linked={workspace.ledger !== null}
        projections={workspace.fleetProjections}
        onOpenProjection={(id) => {
          useProjectionsUi.getState().select(id);
          onView('startup.projections');
        }}
      />;
  if (view === 'startup.updates') return <UpdatesView updates={workspace.investorUpdates} readOnly={readOnly} />;
  if (view === 'startup.invoices') return <InvoicesView company={workspace.company} customers={workspace.customers} invoices={workspace.invoices} bookId={workspace.ledger?.bookId ?? null} />;
  if (view === 'startup.vendors') return <VendorsView company={workspace.company} vendors={workspace.vendors} contracts={workspace.contracts} />;
  return (
    <>
      {readOnly ? <p className="px-6 pt-4 text-xs text-amber-500">This workspace was written by a newer Midnite Startup. It is read-only here.</p> : null}
      <Overview company={workspace.company} milestones={workspace.milestones} lines={workspace.lines} invoices={workspace.invoices} contracts={workspace.contracts} linked={workspace.ledger !== null} onView={onView} />
    </>
  );
}
