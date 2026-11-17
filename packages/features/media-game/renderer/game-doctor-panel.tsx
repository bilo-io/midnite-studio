import { useState } from 'react';

import {
  GAME_GENRES,
  GAME_RULES,
  GAME_RULE_AREAS,
  type GameFinding,
  type GameGenre,
  type GameRuleArea,
  type GameRuleLevel,
} from '@midnite/studio-shared';
import { LuCircleCheck, LuCircleX, LuInfo, LuRefreshCw, LuStethoscope, LuTriangleAlert, LuX } from 'react-icons/lu';

import { useDoctorFix, useGameDiagnosis } from './use-games';
import { GENRE_LABEL } from './game-labels';

const AREA_LABEL: Record<GameRuleArea, string> = {
  manifest: 'Manifest',
  entry: 'Entry',
  kit: 'Kit',
  levels: 'Levels',
  assets: 'Assets',
};

const LEVEL_ICON: Record<GameRuleLevel, { Icon: typeof LuCircleX; className: string; label: string }> = {
  error: { Icon: LuCircleX, className: 'text-red-500', label: 'Error' },
  warn: { Icon: LuTriangleAlert, className: 'text-amber-500', label: 'Warning' },
  info: { Icon: LuInfo, className: 'text-muted-foreground', label: 'Info' },
};

/** Findings grouped in the standard's area order; areas with no findings are left out. */
export function groupFindings(findings: readonly GameFinding[]): { area: GameRuleArea; findings: GameFinding[] }[] {
  return GAME_RULE_AREAS.map((area) => ({ area, findings: findings.filter((f) => f.area === area) })).filter((g) => g.findings.length > 0);
}

/**
 * The Doctor panel (Phase 149 Theme G): the game's findings against the Midnite game standard, grouped by area,
 * each with what it unlocks, the fix hint and — where main has a safe one — a **Fix** button. It sits in the right
 * column's detail slot. A fix that main refuses (an uncommitted manifest, say) shows its message inline.
 */
export function GameDoctorPanel({ gameId, name, onClose }: { gameId: string; name: string; onClose: () => void }) {
  const diagnosis = useGameDiagnosis(gameId);
  const fix = useDoctorFix(gameId);
  const [form, setForm] = useState<'set-genre' | 'add-build' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const apply = (req: Parameters<typeof fix.mutate>[0]): void => {
    setError(null);
    setNote(null);
    fix.mutate(req, {
      onSuccess: (result) => {
        if (!result.ok) {
          setError('message' in result ? result.message : 'The fix could not be applied.');
          return;
        }
        setForm(null);
        setNote(
          result.value.branch
            ? `Kit upgraded on branch ${result.value.branch}.`
            : result.value.commit
              ? `Fixed in ${result.value.commit.slice(0, 7)}.`
              : 'Already fixed.',
        );
      },
    });
  };

  const data = diagnosis.data ?? null;
  const groups = data ? groupFindings(data.findings) : [];
  return (
    <section aria-label="Game doctor" className="flex h-full min-h-0 flex-col" data-testid="game-doctor-panel">
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <LuStethoscope aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={name}>Doctor · {name}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void diagnosis.refetch()}
            disabled={diagnosis.isFetching}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-60"
          >
            <LuRefreshCw aria-hidden className={`h-3 w-3 ${diagnosis.isFetching ? 'animate-spin' : ''}`} />
            Re-check
          </button>
          <button type="button" aria-label="Close doctor" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent">
            <LuX aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
        {error ? (
          <p role="alert" className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-red-500">
            {error}
          </p>
        ) : null}
        {note ? (
          <p role="status" className="mb-3 rounded-md border border-border bg-card px-2 py-1.5 text-muted-foreground">
            {note}
          </p>
        ) : null}
        {diagnosis.isPending ? (
          <p className="text-muted-foreground">Checking {name}…</p>
        ) : diagnosis.isError ? (
          <p role="alert" className="text-red-500">
            {diagnosis.error instanceof Error ? diagnosis.error.message : 'The doctor could not run.'}
          </p>
        ) : groups.length === 0 ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <LuCircleCheck aria-hidden className="h-4 w-4 text-green-500" />
            No findings — {name} meets the Midnite game standard.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.area} className="mb-4" data-testid={`doctor-area-${group.area}`}>
              <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{AREA_LABEL[group.area]}</h3>
              <ul className="flex flex-col gap-2">
                {group.findings.map((finding) => (
                  <FindingRow
                    key={`${finding.rule}:${finding.path ?? ''}:${finding.message}`}
                    finding={finding}
                    busy={fix.isPending}
                    formOpen={form !== null && form === finding.fixId}
                    onFix={() => {
                      if (finding.fixId === 'set-genre' || finding.fixId === 'add-build') setForm(finding.fixId);
                      else if (finding.fixId) apply({ fixId: finding.fixId });
                    }}
                    onCancel={() => setForm(null)}
                    onSubmit={apply}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function FindingRow({
  finding,
  busy,
  formOpen,
  onFix,
  onCancel,
  onSubmit,
}: {
  finding: GameFinding;
  busy: boolean;
  formOpen: boolean;
  onFix: () => void;
  onCancel: () => void;
  onSubmit: (req: { fixId: 'set-genre'; genre: GameGenre | null } | { fixId: 'add-build'; build?: { command: string; out: string } }) => void;
}) {
  const rule = GAME_RULES[finding.rule];
  const { Icon, className, label } = LEVEL_ICON[finding.level];
  return (
    <li className="rounded-md border border-border bg-card p-2" data-testid={`finding-${finding.rule}`}>
      <div className="flex items-start gap-2">
        <Icon aria-label={label} className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${className}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span>{finding.message}</span>
          <span className="text-muted-foreground">Unlocks: {rule.unlocks}</span>
          <span className="text-muted-foreground">{rule.fix}</span>
          {finding.fixId === 'upgrade-kit' ? (
            <span className="text-muted-foreground">Makes a new branch; your current branch is untouched.</span>
          ) : null}
        </div>
        {finding.fixId && !formOpen ? (
          <button
            type="button"
            disabled={busy}
            onClick={onFix}
            className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-60"
          >
            {finding.fixId === 'upgrade-kit' ? 'Fix · new branch' : 'Fix'}
          </button>
        ) : null}
      </div>
      {formOpen && finding.fixId === 'set-genre' ? <GenreForm busy={busy} onCancel={onCancel} onSubmit={(genre) => onSubmit({ fixId: 'set-genre', genre })} /> : null}
      {formOpen && finding.fixId === 'add-build' ? <BuildForm busy={busy} onCancel={onCancel} onSubmit={(build) => onSubmit({ fixId: 'add-build', ...(build ? { build } : {}) })} /> : null}
    </li>
  );
}

const CUSTOM = '__custom__';

function GenreForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (genre: GameGenre | null) => void }) {
  const [value, setValue] = useState<string>(GAME_GENRES[0]);
  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value === CUSTOM ? null : (value as GameGenre));
      }}
    >
      <label className="flex items-center gap-1.5">
        Genre
        <select value={value} onChange={(event) => setValue(event.target.value)} className="rounded border border-border bg-background px-1.5 py-1">
          {GAME_GENRES.map((genre) => (
            <option key={genre} value={genre}>
              {GENRE_LABEL[genre] ?? genre}
            </option>
          ))}
          <option value={CUSTOM}>Custom (no genre)</option>
        </select>
      </label>
      <button type="submit" disabled={busy} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-60">
        Set genre
      </button>
      <button type="button" onClick={onCancel} className="text-[11px] text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </form>
  );
}

function BuildForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (build: { command: string; out: string } | null) => void }) {
  const [command, setCommand] = useState('');
  const [out, setOut] = useState('');
  return (
    <form
      className="mt-2 flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        // Both blank: main infers the build from package.json.
        onSubmit(command.trim() && out.trim() ? { command: command.trim(), out: out.trim() } : null);
      }}
    >
      <label className="flex items-center gap-1.5">
        Command
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npm run build (blank: infer)" className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 font-mono" />
      </label>
      <label className="flex items-center gap-1.5">
        Output
        <input value={out} onChange={(event) => setOut(event.target.value)} placeholder="dist (blank: infer)" className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 font-mono" />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-60">
          Add build
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
