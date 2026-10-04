import { Accordion } from '@bilo-io/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LuCopy, LuServer } from 'react-icons/lu';

import { MCP_TOOLS, MCP_TOOL_IDS } from '@midnite/studio-shared';

import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { bridge } from '../../../services/bridge';

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
      (await bridge()?.mcp.get()) ?? {
        enabled: false,
        running: false,
        socketPath: null,
        shimPath: null,
        allowUi: false,
        allowGateDecide: false,
        allowModels: false,
      },
  });

  const setEnabled = useMutation({
    mutationFn: async (nextEnabled: boolean) => bridge()?.mcp.set({ enabled: nextEnabled }),
    // Refetch even when the switch failed to bind: the flag is still
    // persisted either way (Theme E's "persist before acting" rule), so the
    // checkbox has to reflect the real `enabled`/`running` split rather than
    // staying wherever the click left it.
    onSettled: () => void client.invalidateQueries({ queryKey: MCP_STATUS_KEY }),
  });

  /**
   * Phase 81 Theme F's second switch — a narrower control under the master
   * one, never a widening of it. `mcpSet` takes `allowUi` on its own
   * (independent of `enabled`), so flipping this never touches the socket.
   */
  const setAllowUi = useMutation({
    mutationFn: async (nextAllowUi: boolean) => bridge()?.mcp.set({ allowUi: nextAllowUi }),
    onSettled: () => void client.invalidateQueries({ queryKey: MCP_STATUS_KEY }),
  });

  /**
   * Phase 97 Theme D's third switch — the same shape as `setAllowUi`, just as
   * narrow: it never touches the socket, only whether `workflow_gate_decide`
   * will act once a call reaches it.
   */
  const setAllowGateDecide = useMutation({
    mutationFn: async (nextAllowGateDecide: boolean) => bridge()?.mcp.set({ allowGateDecide: nextAllowGateDecide }),
    onSettled: () => void client.invalidateQueries({ queryKey: MCP_STATUS_KEY }),
  });

  /**
   * Phase 99 Theme G's fourth switch — as narrow as the other two: it never
   * touches the socket, only whether the `model_*` tools that change a 3D
   * model (or open it in the window) act once a call reaches them.
   */
  const setAllowModels = useMutation({
    mutationFn: async (nextAllowModels: boolean) => bridge()?.mcp.set({ allowModels: nextAllowModels }),
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
  const allowUi = status.data?.allowUi ?? false;
  const allowGateDecide = status.data?.allowGateDecide ?? false;
  const allowModels = status.data?.allowModels ?? false;
  const shimCommand = status.data?.shimPath ? `claude mcp add midnite -- node ${status.data.shimPath}` : null;

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="MCP Server" icon={<LuServer className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="mcp-enabled"
            label="Enable MCP server"
            description="Serves read-only tools (repo, status, graph, diff, branches, pull requests, checks, 3D model reads and previews) over a local Unix socket, so an agent started in this app's own terminal can ask instead of shelling out to git/gh. Off by default — turning it on widens this app's attack surface to any process on the machine that can reach the socket."
            on={enabled}
            onToggle={(_id, next) => setEnabled.mutate(next)}
          />

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
              <p className="text-[11px] text-muted-foreground" data-testid="mcp-rename-note">
                The server is now named <code className="font-mono">midnite</code> (it was{' '}
                <code className="font-mono">midnite-studio</code>). A client already registered under the old
                name keeps working, because the shim path is unchanged. To switch:{' '}
                <code className="select-all font-mono">claude mcp remove midnite-studio &amp;&amp; claude mcp add midnite -- node &lt;shim&gt;</code>
                . Allow-listed tools are named <code className="font-mono">mcp__midnite__*</code> after the switch.
              </p>
              <p className="text-[11px] text-muted-foreground">
                `codex` and `opencode` have their own MCP config formats — point them at the same socket
                path above, through their own config.
              </p>
            </div>
          )}
        </div>
      </Accordion>

      <Accordion title="Let agents steer the UI" icon={<LuServer className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="mcp-allow-ui"
            label="Let agents steer the UI"
            description="A second, narrower switch under the one above — off by default, and disabled until the master switch is on. It gates two tools: ui.navigate and ui.command, which open a view or run a palette command the same way the companion does."
            on={allowUi}
            onToggle={(_id, next) => setAllowUi.mutate(next)}
            testId="mcp-allow-ui"
            disabled={!enabled}
            title={!enabled ? 'Enable the MCP server first.' : undefined}
          />

          {setAllowUi.data?.error && (
            <div className="text-xs text-destructive">{setAllowUi.data.error}</div>
          )}

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">What this lets an agent do</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Open a view or settings page, or focus it if it is already detached into its own window.</li>
              <li>Run the same palette commands the companion runs — without asking.</li>
            </ul>
            <p className="pt-1 font-medium text-foreground">What it never does</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Push, pull, commit, or start a skill.</li>
              <li>Answer a dialog.</li>
              <li>Act while the screen is locked.</li>
            </ul>
          </div>
        </div>
      </Accordion>

      <Accordion title="Let agents decide workflow gates" icon={<LuServer className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="mcp-allow-gate-decide"
            label="Let agents decide workflow gates"
            description="A third switch, as narrow as the one above — off by default, and disabled until the master switch is on. It gates one tool: workflow_gate_decide, which approves or rejects a workflow run currently paused on a human gate. workflow_gates_list (read-only) always works once the server is on."
            on={allowGateDecide}
            onToggle={(_id, next) => setAllowGateDecide.mutate(next)}
            testId="mcp-allow-gate-decide"
            disabled={!enabled}
            title={!enabled ? 'Enable the MCP server first.' : undefined}
          />

          {setAllowGateDecide.data?.error && (
            <div className="text-xs text-destructive">{setAllowGateDecide.data.error}</div>
          )}
        </div>
      </Accordion>

      <Accordion title="Let agents edit 3D models" icon={<LuServer className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="mcp-allow-models"
            label="Let agents edit 3D models"
            description="A fourth switch, as narrow as the ones above — off by default, and disabled until the master switch is on. It gates the model_* tools that change something: model_set_spec, model_patch_parts, model_auto_rig, model_patch_rig, model_patch_animations, model_retarget, model_save, model_open and model_generate_sf3d (which also needs SF3D installed from Media ▸ Models). Listing models, reading a design, rendering previews and reading a reference picture always work once the server is on. Edits appear live in Media ▸ Models. Generating a model with Claude Code or Codex from the Models tab does not need this switch — it uses its own one-model connection for that run."
            on={allowModels}
            onToggle={(_id, next) => setAllowModels.mutate(next)}
            testId="mcp-allow-models"
            disabled={!enabled}
            title={!enabled ? 'Enable the MCP server first.' : undefined}
          />

          {setAllowModels.data?.error && <div className="text-xs text-destructive">{setAllowModels.data.error}</div>}

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">Use your own Claude Code session</p>
            <p>
              Connect it with the command under "MCP Server" above, then ask it to build a model: it calls model_set_spec to start one,
              model_render_preview to see it, model_patch_parts to refine, and model_save to finish. Open the Models tab to watch.
            </p>
          </div>
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
