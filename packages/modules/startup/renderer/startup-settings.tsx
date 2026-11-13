import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LuBuilding2 } from 'react-icons/lu';

import type { SettingsPageDef } from '@midnite/studio-frame';

import { useStartupSnapshot } from './data/use-startup';
import { BookLink } from './ledger/book-link';
import { CompanyForm } from './views/company-form';

/** A host's settings render outside the pane's providers, so the page brings its own client. */
const settingsClient = new QueryClient();

function CompanyPage() {
  const snapshot = useStartupSnapshot();
  if (snapshot.isPending) return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  if (snapshot.isError) return <p role="alert" className="p-4 text-sm text-red-500">{snapshot.error.message}</p>;
  const { company, ledger } = snapshot.data.workspace;
  return (
    <>
      <CompanyForm key={snapshot.data.revision} company={company} heading="Company" />
      {company !== null ? <BookLink key={`book-${snapshot.data.revision}`} currency={company.currency} ledger={ledger} /> : null}
    </>
  );
}

function StartupCompanySettings() {
  return (
    <QueryClientProvider client={settingsClient}>
      <CompanyPage />
    </QueryClientProvider>
  );
}

/** Startup's own Settings pages, after the suite's: the company profile. */
export const STARTUP_SETTINGS: readonly SettingsPageDef[] = [
  { id: 'app:startup-company', label: 'Company', group: 'general', scope: 'app', icon: LuBuilding2, Page: StartupCompanySettings },
];
