import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LuBot, LuBuilding2, LuServer } from 'react-icons/lu';

import { FrameChromeProvider, type SettingsPageDef } from '@midnite/studio-frame';

import { STARTUP_CHROME, StartupDialogHost } from './compose/startup-chrome';

import { useStartupSnapshot } from './data/use-startup';
import { BookLink } from './ledger/book-link';
import { StartupAgentsSettings } from './settings/agents-settings';
import { CatalogPage } from './settings/catalog-settings';
import { CompanyForm } from './views/company-form';

/** A host's settings render outside the pane's providers, so the page brings its own client. */
export const settingsClient = new QueryClient();

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

function StartupCatalogSettings() {
  return (
    <QueryClientProvider client={settingsClient}>
      <FrameChromeProvider chrome={STARTUP_CHROME}>
        <CatalogPage />
        <StartupDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}

/** Startup's own Settings pages, after the suite's: the company profile and the fleet catalog. */
export const STARTUP_SETTINGS: readonly SettingsPageDef[] = [
  { id: 'app:startup-company', label: 'Company', group: 'general', scope: 'app', icon: LuBuilding2, Page: StartupCompanySettings },
  { id: 'app:startup-catalog', label: 'Catalog', group: 'general', scope: 'app', icon: LuServer, Page: StartupCatalogSettings },
  { id: 'app:startup-agents', label: 'Agents', group: 'general', scope: 'app', icon: LuBot, Page: StartupAgentsSettings },
];
