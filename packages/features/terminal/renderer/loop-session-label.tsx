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

/**
 * The agent's own title for what it is doing, cut to its gist: the leading
 * product or folder word goes ("Midnite address issue triage" → "address
 * issue triage"), so does everything after the first clause break ("build
 * iteration across FEATURES, SECURITY" → "build iteration"), and at most four
 * words are kept. The row's tooltip carries the full text.
 */
export function succinctDescription(text: string | undefined, folder: string): string | undefined {
  if (!text) return undefined;
  const lead = new Set(['midnite', folder.toLowerCase()]);
  let words = text.trim().split(/\s+/);
  while (words.length > 1 && lead.has(words[0]!.toLowerCase().replace(/[:,]$/, ''))) words = words.slice(1);
  const clause = words.join(' ').split(/\s*(?:[:,;(]|\s[—–-]\s|\s(?:across|for|in|on|with)\s)/i)[0] ?? '';
  const gist = clause.trim().split(/\s+/).slice(0, 4).join(' ');
  return gist.length > 0 ? gist : undefined;
}

function folderName(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

/**
 * A loop session's row text: **Provider** (model · effort) > 📁 folder > gist.
 * The model and effort appear only when the launch actually pinned them;
 * a `--model`-less, `--effort`-less run reads just "Claude > folder".
 */
export function LoopSessionLabel({
  session,
  agentLabel,
  description,
  live,
}: {
  session: Pick<TerminalSession, 'cwd' | 'loopModel' | 'loopEffort'>;
  agentLabel: string | undefined;
  /** The agent's own title for the session (its auto-name), if it has set one. */
  description?: string | undefined;
  live: boolean;
}) {
  const model = LOOP_MODELS.find((m) => m.id === session.loopModel)?.label;
  const effort = LOOP_EFFORTS.find((e) => e.id === session.loopEffort);
  const rag = effort ? LOOP_EFFORT_RAG[effort.id] : null;
  const folder = folderName(session.cwd);
  const gist = succinctDescription(description, folder);
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
      <span className={`truncate ${gist ? 'shrink-0' : 'min-w-0'}`} title={session.cwd}>
        {folder}
      </span>
      {gist ? (
        <>
          <LuChevronRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span
            data-testid="terminal-session-loop-description"
            className="min-w-0 truncate"
            title={description}
          >
            {gist}
          </span>
        </>
      ) : null}
    </span>
  );
}
