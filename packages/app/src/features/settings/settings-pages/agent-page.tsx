import { useEffect, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuRefreshCw } from 'react-icons/lu';

import { CLAUDE_COMMANDS, type ClaudeInfo } from '@midnite/git-shared';

import { IconButton } from '../../../components/icon-button';
import { bridge, hasBridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { FileTree } from '../../files/file-tree';
import { FilePreview } from '../../files/preview/file-preview';
import { Field } from './controls';

/**
 * The Agent page: what `~/.claude` holds, which Claude CLI is installed, and
 * the two maintenance actions with deliberately different postures —
 *
 * - **Update** runs in main and streams its output here (low blast radius).
 * - **Uninstall** is only ever PASTED into the integrated terminal, without a
 *   newline. Pressing Enter is the confirmation — the app never removes an
 *   installation itself.
 */
export function AgentPage() {
  const queryClient = useQueryClient();
  const { data: info } = useQuery({
    queryKey: ['claude-info'],
    queryFn: async () => bridge()!.agent.claudeInfo(),
    enabled: hasBridge(),
  });

  return (
    <div className="flex flex-col gap-5">
      <Field label="Claude Code" hint="Detected through your login shell, the same way the terminal resolves it.">
        <ClaudeCard
          info={info}
          onRefresh={() => void queryClient.invalidateQueries({ queryKey: ['claude-info'] })}
        />
      </Field>

      <Field label="~/.claude" hint="Your agent's home folder — skills, projects, plans, settings. Read-only here.">
        <ClaudeHomeTree />
      </Field>
    </div>
  );
}

function ClaudeCard({ info, onRefresh }: { info: ClaudeInfo | undefined; onRefresh: () => void }) {
  const [log, setLog] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const update = useMutation({
    mutationFn: async () => {
      setLog('');
      const result = await bridge()!.agent.claudeUpdate();
      if (result.ok) {
        setLog((current) => `${current ?? ''}\n[exited ${result.exitCode}]`);
        onRefresh();
      } else {
        setLog((current) => `${current ?? ''}\n[failed: ${result.message}]`);
      }
      return result;
    },
  });

  // Output chunks stream on their own event channel while the update runs.
  useEffect(() => {
    const api = bridge();
    if (!api) return;
    return api.agent.onClaudeUpdateData(({ chunk }) => {
      setLog((current) => (current ?? '') + chunk);
    });
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const commands = CLAUDE_COMMANDS[info?.method ?? 'unknown'];

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      <div className="flex items-center gap-2">
        {!info ? (
          <span className="text-xs text-muted-foreground">Checking…</span>
        ) : info.installed ? (
          <>
            <span className="text-sm font-medium">claude</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" data-selectable>
              v{info.version ?? '?'}
            </code>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              via {info.method}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Not installed — paste the install command into the terminal below.
          </span>
        )}
        <span className="ml-auto">
          <IconButton icon={LuRefreshCw} label="Re-check Claude version" size="sm" onClick={onRefresh} />
        </span>
      </div>

      {info?.binPath ? (
        <code className="truncate font-mono text-[10px] text-muted-foreground" data-selectable>
          {info.binPath}
        </code>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {info?.installed ? (
          <>
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate()}
              className="h-6 rounded-md border border-primary bg-primary/10 px-2 text-xs transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {update.isPending ? 'Updating…' : 'Update'}
            </button>
            <button
              type="button"
              onClick={() => pasteCommand(commands.uninstall)}
              title="Opens the terminal with the command pasted — you press Enter"
              className="h-6 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              Uninstall…
            </button>
          </>
        ) : info ? (
          <button
            type="button"
            onClick={() => pasteCommand(commands.install)}
            className="h-6 rounded-md border border-primary bg-primary/10 px-2 text-xs transition-colors hover:bg-primary/20"
          >
            Install…
          </button>
        ) : null}
      </div>

      {log !== null ? (
        <pre
          ref={logRef}
          className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-relaxed"
          data-selectable
        >
          {log || 'Starting…'}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * Open the terminal panel with `command` typed at a fresh shell's prompt and
 * NOT executed — no trailing newline anywhere in this path. The session opens
 * in the selected worktree like any other new terminal.
 */
function pasteCommand(command: string): void {
  const ui = useUiStore.getState();
  ui.setTerminalOpen(true);
  // No checkout selected → no cwd to spawn a shell in. The panel opens and
  // says so, matching the + menu's own disabled state.
  if (!ui.selectedWorktreePath || !ui.selectedRepoId) return;
  const session = useTerminalStore.getState().openSession({
    kind: 'shell',
    title: 'claude setup',
    cwd: ui.selectedWorktreePath,
    repoId: ui.selectedRepoId,
  });
  useTerminalStore.getState().queueInput(session.id, command);
}

function ClaudeHomeTree() {
  // Local expansion state: the Agent page's browse is independent of the
  // Files view's per-repo store — different scope, different lifetime.
  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-72 overflow-auto rounded border border-border">
        <FileTree
          scope={{ scope: 'claude-home' }}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleDir={(relPath) =>
            setExpanded((current) => {
              const next = { ...current };
              if (next[relPath]) delete next[relPath];
              else next[relPath] = true;
              return next;
            })
          }
          onSelectFile={setSelectedPath}
        />
      </div>
      {selectedPath ? (
        <div className="flex max-h-96 min-h-0 flex-col overflow-hidden rounded border border-border">
          <FilePreview key={selectedPath} scope={{ scope: 'claude-home' }} relPath={selectedPath} />
        </div>
      ) : null}
    </div>
  );
}
