import { LOOP_EFFORT_RAG, LOOP_EFFORTS, LOOP_MODELS, type TerminalSession } from '@midnite/studio-shared';
import { LuChevronRight, LuFolder } from 'react-icons/lu';

/** The RAG rating's pill colours — same as the loop composer's effort picker. */
const RAG_TONE = {
  green: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  red: 'bg-red-500/15 text-red-400 ring-red-500/30',
} as const;

/** "Claude Code" → "Claude": the row names the provider, not its CLI product. */
export function providerName(agentLabel: string | undefined): string {
  return (agentLabel ?? 'Agent').replace(/\s+(Code|CLI)$/i, '');
}

function folderName(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

/**
 * A loop session's row text: **Provider** (model · effort) > 📁 folder.
 * The model and effort appear only when the launch actually pinned them;
 * a `--model`-less, `--effort`-less run reads just "Claude > folder".
 */
export function LoopSessionLabel({
  session,
  agentLabel,
  live,
}: {
  session: Pick<TerminalSession, 'cwd' | 'loopModel' | 'loopEffort'>;
  agentLabel: string | undefined;
  live: boolean;
}) {
  const model = LOOP_MODELS.find((m) => m.id === session.loopModel)?.label;
  const effort = LOOP_EFFORTS.find((e) => e.id === session.loopEffort);
  const rag = effort ? LOOP_EFFORT_RAG[effort.id] : null;
  const folder = folderName(session.cwd);
  return (
    <span
      data-testid="terminal-session-loop-label"
      className={`flex min-w-0 items-center gap-1 ${live ? '' : 'opacity-70'}`}
    >
      <span className="shrink-0 font-semibold">{providerName(agentLabel)}</span>
      {model || effort ? (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          (
          {model ? <span data-testid="terminal-session-loop-model">{model}</span> : null}
          {model && effort ? <span aria-hidden>·</span> : null}
          {effort ? (
            <span
              data-testid="terminal-session-loop-effort"
              data-effort={effort.id}
              className={`rounded-full px-1.5 text-[10px] font-medium leading-4 ring-1 ring-inset ${
                rag ? RAG_TONE[rag] : 'bg-muted text-muted-foreground ring-border'
              }`}
            >
              {effort.label.toLowerCase()}
            </span>
          ) : null}
          )
        </span>
      ) : null}
      <LuChevronRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
      <LuFolder aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate" title={session.cwd}>
        {folder}
      </span>
    </span>
  );
}
