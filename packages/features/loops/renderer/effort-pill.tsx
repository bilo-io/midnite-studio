import { LOOP_EFFORT_RAG, LOOP_EFFORTS, type LoopEffort } from '@midnite/studio-shared';

const RAG_TONE = {
  green: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  red: 'bg-red-500/15 text-red-400 ring-red-500/30',
} as const;

/**
 * An effort level as a red/amber/green pill — the same pill the terminal
 * list's loop rows wear, so the picker and the row read alike. The neutral
 * entry has no rating and draws as plain muted text.
 */
export function EffortPill({ effort }: { effort: LoopEffort }) {
  const rag = LOOP_EFFORT_RAG[effort];
  const label = LOOP_EFFORTS.find((e) => e.id === effort)?.label ?? effort;
  if (rag === null) return <span className="truncate text-muted-foreground">{label}</span>;
  return (
    <span
      data-testid="loop-effort-pill"
      data-effort={effort}
      className={`rounded-full px-1.5 text-[10px] font-medium leading-4 ring-1 ring-inset ${RAG_TONE[rag]}`}
    >
      {label.toLowerCase()}
    </span>
  );
}
