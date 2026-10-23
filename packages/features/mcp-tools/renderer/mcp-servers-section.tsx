import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuCheck, LuShieldAlert, LuShieldCheck } from 'react-icons/lu';

import { bridge, SettingsAccordion } from '@midnite/studio-frame';
import { MCP_SERVER_SOURCE_LABELS, type McpServerStatus, type McpTrustVerdict } from '@midnite/studio-shared';

/**
 * The MCP servers a repo's agents will load, trusted by hash (Phase 121 Theme C). Each server shows its
 * verdict; one that is new, edited since approval (MCPoison), has a different tools list (rug-pull) or is
 * held for a poisoned description shows a diff and an Approve button. A held server cannot be approved until
 * its descriptions are fixed. Nothing here writes to a config file: Approve records a hash in the app's own
 * allowlist.
 */

const SERVERS_KEY = ['mcp-trust'] as const;
const POLL_MS = 15_000;

const VERDICT_LABEL: Record<McpTrustVerdict, string> = {
  approved: 'Approved',
  new: 'Needs approval',
  'config-changed': 'Config changed',
  'tools-changed': 'Tools changed',
  held: 'Held',
};

const VERDICT_TONE: Record<McpTrustVerdict, string> = {
  approved: 'text-[hsl(var(--success))]',
  new: 'text-muted-foreground',
  'config-changed': 'text-amber-600 dark:text-amber-400',
  'tools-changed': 'text-amber-600 dark:text-amber-400',
  held: 'text-destructive',
};

const VERDICT_EXPLAINER: Record<Exclude<McpTrustVerdict, 'approved'>, string> = {
  new: 'No Chats run in this repo will start until you approve it.',
  'config-changed': 'This entry was approved, then edited. Review the change before agents load it again.',
  'tools-changed': 'The config is the one you approved, but the server now offers different tools.',
  held: 'A tool description looks poisoned, so the server stays unapproved.',
};

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

/** A line diff by longest common subsequence; the configs are a few dozen lines, so O(n·m) is nothing. */
export function diffLines(before: string | null, after: string): DiffLine[] {
  const a = before === null ? [] : before.split('\n');
  const b = after.split('\n');
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: 'del', text: a[i]! });
      i += 1;
    } else {
      out.push({ kind: 'add', text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i++]! });
  while (j < b.length) out.push({ kind: 'add', text: b[j++]! });
  return out;
}

const LINE_CLASS: Record<DiffLine['kind'], string> = {
  same: 'text-muted-foreground',
  add: 'bg-[hsl(var(--success)/0.14)] text-foreground',
  del: 'bg-destructive/10 text-foreground',
};
const LINE_MARK: Record<DiffLine['kind'], string> = { same: ' ', add: '+', del: '-' };

function ServerCard({ server, onApprove, approving, error }: { server: McpServerStatus; onApprove: () => void; approving: boolean; error: string | null }) {
  const trusted = server.verdict === 'approved';
  const held = server.verdict === 'held';
  const lines = server.diff.config ? diffLines(server.diff.config.before, server.diff.config.after) : [];
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid={`mcp-server-${server.serverName}`} data-verdict={server.verdict}>
      <div className="flex flex-wrap items-center gap-2">
        {trusted ? <LuShieldCheck aria-hidden className="h-4 w-4 text-[hsl(var(--success))]" /> : <LuShieldAlert aria-hidden className={`h-4 w-4 ${VERDICT_TONE[server.verdict]}`} />}
        <span className="font-mono text-xs font-medium">{server.serverName}</span>
        <span className={`text-[11px] font-medium ${VERDICT_TONE[server.verdict]}`} data-testid="mcp-server-verdict">
          {VERDICT_LABEL[server.verdict]}
        </span>
        <span className="text-[11px] text-muted-foreground">{MCP_SERVER_SOURCE_LABELS[server.source]}</span>
        {!trusted && (
          <button
            type="button"
            disabled={held || approving}
            onClick={onApprove}
            title={held ? 'Held: fix the flagged descriptions first.' : undefined}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LuCheck aria-hidden className="h-3.5 w-3.5" />
            Approve
          </button>
        )}
      </div>
      <code className="break-all font-mono text-[11px] text-muted-foreground" title={server.configHash}>
        {server.command || '(no command)'}
      </code>
      {!trusted && <p className="text-[11px] text-muted-foreground">{VERDICT_EXPLAINER[server.verdict as Exclude<McpTrustVerdict, 'approved'>]}</p>}
      {server.findings.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="mcp-server-findings">
          {server.findings.map((f, i) => (
            <li key={`${f.kind}-${f.tool}-${f.field}-${i}`} className="text-[11px] text-destructive">
              {f.message} <span className="font-mono text-muted-foreground">{f.evidence}</span>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && (
        <pre className="max-h-56 overflow-auto rounded border border-border bg-background p-2 font-mono text-[11px] leading-snug" data-testid="mcp-server-diff" aria-label={`Config diff for ${server.serverName}`}>
          {lines.map((line, i) => (
            <div key={i} className={LINE_CLASS[line.kind]} data-diff={line.kind}>
              <span aria-hidden className="select-none pr-2">{LINE_MARK[line.kind]}</span>
              {line.text}
            </div>
          ))}
        </pre>
      )}
      {server.diff.tools.length > 0 && (
        <pre className="rounded border border-border bg-background p-2 font-mono text-[11px] leading-snug" data-testid="mcp-server-tools-diff" aria-label={`Tools diff for ${server.serverName}`}>
          {server.diff.tools.map((line) => (
            <div key={line} className={line.startsWith('+') ? LINE_CLASS.add : line.startsWith('-') ? LINE_CLASS.del : 'bg-amber-500/15'}>
              {line}
            </div>
          ))}
        </pre>
      )}
      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}
    </li>
  );
}

export function McpServersSection({ repoId, repoName }: { repoId: string; repoName?: string }) {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: [...SERVERS_KEY, repoId],
    queryFn: async () => {
      const result = await bridge()?.mcpTrust.list({ repoId });
      return result?.ok ? result.value.servers : [];
    },
    refetchInterval: POLL_MS,
  });
  const approve = useMutation({
    mutationFn: async (server: McpServerStatus) => {
      const result = await bridge()?.mcpTrust.approve({ repoId, serverName: server.serverName, configHash: server.configHash });
      if (result && !result.ok) throw new Error(result.kind === 'error' ? result.message : 'Could not approve this server.');
      return server.serverName;
    },
    onSettled: () => void client.invalidateQueries({ queryKey: [...SERVERS_KEY, repoId] }),
  });

  const servers = list.data ?? [];
  const failed = approve.isError ? (approve.error as Error).message : null;
  const failedFor = approve.variables?.serverName;

  return (
    <SettingsAccordion title="MCP servers" icon={<LuShieldCheck className="h-4 w-4" />} defaultOpen>
      <div className="flex flex-col gap-3 p-3" data-testid="mcp-servers">
        <p className="text-xs text-muted-foreground">
          The MCP servers agents will load in {repoName ?? 'this repository'}, read from <code className="font-mono">.mcp.json</code>, the editor
          configs and your own Claude and Codex settings. A server is trusted by a hash of its config, not by its name: edit it, or change what it
          offers, and it asks again. Nothing here edits those files.
        </p>
        {servers.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="mcp-servers-empty">No MCP servers are configured for this repository.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {servers.map((server) => (
              <ServerCard
                key={`${server.serverName}:${server.source}`}
                server={server}
                onApprove={() => approve.mutate(server)}
                approving={approve.isPending && approve.variables?.serverName === server.serverName}
                error={failedFor === server.serverName ? failed : null}
              />
            ))}
          </ul>
        )}
      </div>
    </SettingsAccordion>
  );
}
