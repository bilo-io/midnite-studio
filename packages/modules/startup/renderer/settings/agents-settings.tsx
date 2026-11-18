import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { SettingsSwitchRow } from '@midnite/studio-frame';
import { DEFAULT_STARTUP_AGENT_CONSENT, type StartupAgentConsent } from '@midnite/studio-shared';

import { STARTUP_KEY, startupBridge, StartupError, unwrap } from '../data/use-startup';

/** A host's settings render outside the pane's providers, so the page brings its own client. */
const settingsClient = new QueryClient();
const CONSENT_KEY = [...STARTUP_KEY, 'agentConsent'] as const;

/**
 * Settings ▸ Agents (Phase 153 Theme C): the two switches that decide what an agent connected to the `midnite` MCP
 * server can do with Startup. Both are off by default, and they live in Startup's own app settings, never in the
 * workspace. "Make changes" is disabled until "read" is on; turning read off turns changes off with it.
 */
function AgentsPage() {
  const client = useQueryClient();
  const consent = useQuery<StartupAgentConsent>({
    queryKey: CONSENT_KEY,
    queryFn: async () => {
      const bridge = startupBridge();
      if (bridge === undefined) throw new StartupError('io', 'Midnite Startup is not available here.');
      return unwrap(await bridge.getAgentConsent());
    },
  });
  const save = useMutation({
    mutationFn: async (next: StartupAgentConsent) => unwrap(await (startupBridge()?.setAgentConsent({ consent: next }) ?? Promise.reject(new StartupError('io', 'Midnite Startup is not available here.')))),
    onSuccess: (value) => client.setQueryData(CONSENT_KEY, value),
  });

  const current = consent.data ?? DEFAULT_STARTUP_AGENT_CONSENT;
  const busy = consent.isPending || save.isPending;
  return (
    <section className="flex flex-col gap-3 p-4" aria-label="Agents">
      <header>
        <h2 className="text-sm font-semibold">Agents</h2>
        <p className="text-xs text-muted-foreground">
          Let a coding agent connected to the <code>midnite</code> MCP server work with Startup. Off by default; nothing here ever touches invoices, vendors, contracts or the ledger.
        </p>
      </header>
      <SettingsSwitchRow
        id="startup-agents-read"
        label="Let agents read Startup"
        description="Runway, milestones and fleet projections, so an agent can answer how the company is doing."
        on={current.read}
        disabled={busy}
        onToggle={(_id, on) => save.mutate({ read: on, write: on && current.write })}
      />
      <SettingsSwitchRow
        id="startup-agents-write"
        label="Let agents make changes"
        description="Add or change milestones and fleet projections, and send a projection to the runway."
        on={current.read && current.write}
        disabled={busy || !current.read}
        title={current.read ? undefined : 'Turn on "Let agents read Startup" first.'}
        onToggle={(_id, on) => save.mutate({ read: current.read, write: on })}
      />
      {consent.isError ? <p role="alert" className="text-xs text-red-500">{consent.error.message}</p> : null}
      {save.isError ? <p role="alert" className="text-xs text-red-500">{save.error.message}</p> : null}
    </section>
  );
}

export function StartupAgentsSettings() {
  return (
    <QueryClientProvider client={settingsClient}>
      <AgentsPage />
    </QueryClientProvider>
  );
}
