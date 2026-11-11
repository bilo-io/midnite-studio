import { useState } from 'react';

import type { Milestone } from '@midnite/studio-shared';

import { MilestoneSheet } from './milestone-sheet';
import { atRisk, byIdMap, groupByStatus, overdue, positionInRange, timelineRange } from './roadmap-model';
import { useRoadmapUi } from './use-roadmap-ui';

const today = (): string => new Date().toISOString().slice(0, 10);

const STATUS_BAR: Record<Milestone['status'], string> = {
  planned: 'bg-slate-400',
  'in-progress': 'bg-violet-500',
  done: 'bg-emerald-500',
  dropped: 'bg-zinc-500/50',
};

function Badges({ milestone, byId, now }: { milestone: Milestone; byId: ReadonlyMap<string, Milestone>; now: string }) {
  return (
    <>
      {atRisk(milestone, byId) ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">At risk</span> : null}
      {overdue(milestone, now) ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-500">Overdue</span> : null}
    </>
  );
}

function ListMode({ milestones, onOpen, now }: { milestones: readonly Milestone[]; onOpen: (m: Milestone) => void; now: string }) {
  const byId = byIdMap(milestones);
  return (
    <div className="flex flex-col gap-4">
      {groupByStatus(milestones).map((group) => (
        <section key={group.status} aria-label={group.status}>
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{group.status}</h3>
          <ul className="flex flex-col">
            {group.items.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onOpen(m)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60">
                  <span className="flex-1 truncate">{m.title}</span>
                  <Badges milestone={m} byId={byId} now={now} />
                  <span className="text-xs text-muted-foreground">{m.due}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const ROW = 32;

function TimelineMode({ milestones, onOpen, now }: { milestones: readonly Milestone[]; onOpen: (m: Milestone) => void; now: string }) {
  const range = timelineRange(milestones, now);
  const rows = [...milestones].sort((a, b) => (a.start ?? a.due).localeCompare(b.start ?? b.due) || a.due.localeCompare(b.due));
  const rowOf = new Map(rows.map((m, index) => [m.id, index]));
  const pct = (date: string): number => positionInRange(date, range) * 100;
  const months = Array.from({ length: range.months }, (_, i) => {
    const [y, mo] = range.from.split('-').map(Number) as [number, number];
    const index = y * 12 + (mo - 1) + i;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
  const todayPct = pct(now);
  return (
    <div className="flex flex-col gap-1" data-testid="roadmap-timeline">
      <div className="grid text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${range.months}, minmax(0, 1fr))` }}>
        {months.map((month) => (
          <span key={month} className="truncate border-l border-border px-1">
            {month}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height: rows.length * ROW }}>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${range.months}, minmax(0, 1fr))` }} aria-hidden="true">
          {months.map((month) => (
            <span key={month} className="border-l border-border/50" />
          ))}
        </div>
        <div className="absolute bottom-0 top-0 w-px bg-red-500/70" style={{ left: `${todayPct}%` }} data-testid="today-line" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${rows.length * ROW}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 L6 3 L0 6 z" className="fill-muted-foreground" />
            </marker>
          </defs>
          {rows.flatMap((m) =>
            m.dependsOn.flatMap((depId) => {
              const dep = milestones.find((x) => x.id === depId);
              const from = rowOf.get(depId);
              const to = rowOf.get(m.id);
              if (dep === undefined || from === undefined || to === undefined) return [];
              const x1 = pct(dep.due);
              const x2 = pct(m.start ?? m.due);
              const y1 = from * ROW + ROW / 2;
              const y2 = to * ROW + ROW / 2;
              const xm = Math.min(Math.max((x1 + x2) / 2, x1), 100);
              return [
                <path
                  key={`${depId}->${m.id}`}
                  data-edge={`${depId}->${m.id}`}
                  d={`M ${x1} ${y1} H ${xm} V ${y2} H ${x2}`}
                  fill="none"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-muted-foreground"
                  markerEnd="url(#arrow)"
                />,
              ];
            }),
          )}
        </svg>
        {rows.map((m, index) => {
          const left = pct(m.start ?? m.due);
          const width = Math.max(pct(m.due) - left, 1.5);
          return (
            <button
              key={m.id}
              type="button"
              data-bar={m.id}
              onClick={() => onOpen(m)}
              title={`${m.title} · due ${m.due}`}
              className={`absolute flex items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-left text-[11px] text-white ${STATUS_BAR[m.status]}`}
              style={{ top: index * ROW + 4, height: ROW - 8, left: `${left}%`, width: `${width}%` }}
            >
              {m.title}
            </button>
          );
        })}
      </div>
      {range.later > 0 ? <p className="text-xs text-muted-foreground">+{range.later} later</p> : null}
    </div>
  );
}

/** The roadmap: a List | Timeline switch over the workspace's milestones, with one add/edit sheet. */
export function RoadmapView({ milestones }: { milestones: readonly Milestone[] }) {
  const mode = useRoadmapUi((s) => s.mode);
  const setMode = useRoadmapUi((s) => s.setMode);
  const [sheet, setSheet] = useState<{ milestone: Milestone | null } | null>(null);
  const now = today();
  const open = (milestone: Milestone | null): void => setSheet({ milestone });

  return (
    <main className="flex h-full min-h-0" aria-label="Roadmap">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Roadmap</h1>
          <div role="group" aria-label="Roadmap mode" className="ml-4 flex overflow-hidden rounded-md border border-border text-xs">
            {(['list', 'timeline'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`px-3 py-1 capitalize ${mode === value ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
              >
                {value}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => open(null)} className="ml-auto h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Add milestone
          </button>
        </div>
        {milestones.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-8">
            <p className="text-sm font-medium">No milestones yet</p>
            <p className="text-xs text-muted-foreground">Milestones with dates and dependencies make up the roadmap.</p>
          </div>
        ) : mode === 'list' ? (
          <ListMode milestones={milestones} onOpen={open} now={now} />
        ) : (
          <TimelineMode milestones={milestones} onOpen={open} now={now} />
        )}
      </div>
      {sheet !== null ? <MilestoneSheet key={sheet.milestone?.id ?? 'new'} milestone={sheet.milestone} milestones={milestones} onClose={() => setSheet(null)} /> : null}
    </main>
  );
}
