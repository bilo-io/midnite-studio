import { Accordion } from '@bilo-io/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LuCopy, LuServer } from 'react-icons/lu';

import { MCP_TOOLS, MCP_TOOL_IDS } from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { Field } from './controls';

const MCP_STATUS_KEY = ['mcp-status'] as const;
const MCP_CALLS_KEY = ['mcp-calls'] as const;

/** Pulled on an interval while this page is mounted, never pushed (Theme F's own rule). */
const CALLS_POLL_MS = 3000;

/**
 * Turns the MCP server on (Phase 57 Theme F) — off by default, and until this
 * page existed there was no way to change that. Copies `git-safety-page.tsx`'s
 * shape: a default-off switch whose real blast radius (a local socket handing
 * any process on the machine a parsed view of every open repository) gets a
 * page a user has to go looking for, plus a diagnostics readout underneath it.
 */
export function McpSettingsPage() {
  const client = useQueryClient();

  const status = useQuery({
    queryKey: MCP_STATUS_KEY,
    queryFn: async () =>
      (await bridge()?.mcp.get()) ?? { enabled: false, running: false, socketPath: null, shimPath: null },
  });

  const setEnabled = useMutation({
    mutationFn: async (nextEnabled: boolean) => bridge()?.mcp.set({ enabled: nextEnabled }),
    // Refetch even when the switch failed to bind: the flag is still
    // persisted either way (Theme E's "persist before acting" rule), so the
    // checkbox has to reflect the real `enabled`/`running` split rather than
    // staying wherever the click left it.
    onSettled: () => void client.invalidateQueries({ queryKey: MCP_STATUS_KEY }),
  });

  const calls = useQuery({
    queryKey: MCP_CALLS_KEY,
    queryFn: async () => (await bridge()?.mcp.calls())?.calls ?? [],
    // Only worth polling while the server might actually be doing something —
    // an off switch means the ring can only ever be empty.
    refetchInterval: status.data?.running ? CALLS_POLL_MS : false,
  });

  const copy = (text: string) => void bridge()?.clipboard.writeText({ text });

  const enabled = status.data?.enabled ?? false;
  const running = status.data?.running ?? false;
  const shimCommand = status.data?.shimPath ? `claude mcp add midnite-studio -- node ${status.data.shimPath}` : null;

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="MCP Server" icon={<LuServer className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Enable MCP server"
            hint="Serves eight read-only tools (repo, status, graph, diff, branches, pull requests, checks) over a local Unix socket, so an agent started in this app's own terminal can ask instead of shelling out to git/gh. Off by default — turning it on widens this app's attack surface to any process on the machine that can reach the socket."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled.mutate(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Enable MCP server
            </label>
          </Field>

          {setEnabled.data?.error && <div className="text-xs text-destructive">{setEnabled.data.error}</div>}

          <div className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'}`}
            />
            <span className="text-muted-foreground">{running ? 'Listening' : 'Not running'}</span>
          </div>

          {status.data?.socketPath && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Socket path</span>
              <code className="block select-all break-all rounded bg-muted/40 p-1.5 font-mono text-[11px] text-foreground">
                {status.data.socketPath}
              </code>
            </div>
          )}

          {shimCommand && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Connect an MCP client (Claude Code)</span>
              <div className="flex items-start gap-2">
                <code className="block flex-1 select-all break-all rounded bg-muted/40 p-1.5 font-mono text-[11px] text-foreground">
                  {shimCommand}
                </code>
                <button
                  type="button"
                  onClick={() => copy(shimCommand)}
                  aria-label="Copy command"
                  title="Copy command"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <LuCopy aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                `codex` and `opencode` have their own MCP config formats — point them at the same socket
                path above, through their own config.
              </p>
            </div>
          )}
        </div>
      </Accordion>

      <Accordion title="Tools" icon={<LuServer className="h-4 w-4" />}>
        <div className="flex flex-col gap-2 p-3">
          {MCP_TOOL_IDS.map((id) => (
            <div key={id} className="rounded border border-border/60 bg-card/50 p-2">
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11px] font-medium text-foreground">{id}</code>
                <span className="text-[11px] text-muted-foreground">{MCP_TOOLS[id].title}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{MCP_TOOLS[id].description}</p>
            </div>
          ))}
        </div>
      </Accordion>

      <Accordion title="Recent calls" icon={<LuServer className="h-4 w-4" />}>
        <div className="flex flex-col gap-1.5 p-3">
          {!calls.data || calls.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tool calls yet.</p>
          ) : (
            calls.data.map((call, index) => (
              <div
                key={`${call.at}-${index}`}
                className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1 text-[11px]"
              >
                <span className="font-mono text-foreground">{call.tool}</span>
                <span className="truncate text-muted-foreground">{call.repoPath || '—'}</span>
                <span className={call.ok ? 'text-[hsl(var(--success))]' : 'text-destructive'}>
                  {call.ok ? 'ok' : 'err'}
                </span>
                <span className="text-muted-foreground">{call.ms}ms</span>
              </div>
            ))
          )}
        </div>
      </Accordion>
    </div>
  );
}
