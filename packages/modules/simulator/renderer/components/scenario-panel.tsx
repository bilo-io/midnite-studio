import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge, noBridge, useFrameChrome } from '@midnite/studio-frame';
import type { GitOpResult, SimKind, SimScenario, SimScenarioSummary } from '@midnite/studio-shared';

import { relativeTime } from './relative-time';

/** What a view hands the panel to save: the scenario minus its title. */
export type ScenarioCapture = { seed: number; params: Record<string, unknown>; state?: unknown };

type Props = {
  /** The kinds this view can open; the list shows only these. */
  kinds: readonly SimKind[];
  /** The kind a Save is filed under. */
  kind: SimKind;
  capture(): Promise<ScenarioCapture>;
  /** Opens a loaded scenario; returns a message when its params or state do not fit this version. */
  apply(scenario: SimScenario): string | null;
};

/** A failed result's text; a conflict (never produced here) reads generically. */
const failText = (r: { kind: string; message?: string }): string => (r.kind === 'error' && r.message !== undefined ? r.message : 'Something went wrong');

const CANNOT_OPEN = 'This scenario was saved by a newer or different version and cannot be opened';

type ListValue = { scenarios: SimScenarioSummary[]; quarantined: number };

/** A view's saved scenarios: Save, list, load, Rename and Delete (Phase 127 Theme F.3). */
export function ScenarioPanel({ kinds, kind, capture, apply }: Props) {
  const dialogs = useFrameChrome().useDialogs();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [unopenable, setUnopenable] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<GitOpResult<ListValue> | null>(null);
  const [fetching, setFetching] = useState(true);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const refresh = useCallback(async () => {
    setFetching(true);
    let res: GitOpResult<ListValue>;
    try {
      res = (await bridge()?.simulator?.list()) ?? noBridge<ListValue>();
    } catch (e) {
      res = { ok: false, kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (!alive.current) return;
    setResult(res);
    setFetching(false);
  }, []);
  useEffect(() => void refresh(), [refresh]);

  // An inline spinner only once the list has taken longer than 150 ms.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!fetching) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 150);
    return () => clearTimeout(t);
  }, [fetching]);

  const failure = result && !result.ok ? failText(result) : null;
  const scenarios = result?.ok ? result.value.scenarios.filter((s) => kinds.includes(s.kind)) : [];

  const doSave = async (title: string, id: string | undefined) => {
    setBusy(true);
    setProblem(null);
    try {
      const captured = await capture();
      const res = (await bridge()?.simulator?.save({ ...(id === undefined ? {} : { id }), scenario: { kind, title, ...captured } })) ?? noBridge<{ scenario: SimScenario }>();
      if (res.ok) {
        setCurrentId(res.value.scenario.id);
        void refresh();
      } else setProblem(failText(res));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const current = scenarios.find((s) => s.id === currentId);
    if (current !== undefined) return void doSave(current.title, current.id);
    const prompt = dialogs.prompt;
    if (prompt === undefined) return void doSave('Untitled scenario', undefined);
    prompt({
      title: 'Save scenario',
      label: 'Title',
      confirmLabel: 'Save',
      validate: (v) => (v.trim() === '' ? 'Enter a title' : v.length > 200 ? 'At most 200 characters' : null),
      onConfirm: (v) => void doSave(v.trim(), undefined),
    });
  };

  const open = async (s: SimScenarioSummary) => {
    setProblem(null);
    const res = (await bridge()?.simulator?.read({ id: s.id })) ?? noBridge<{ scenario: SimScenario }>();
    if (!res.ok) return setProblem(failText(res));
    const message = apply(res.value.scenario);
    setUnopenable((prev) => {
      const next = new Set(prev);
      if (message === null) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
    if (message === null) setCurrentId(s.id);
  };

  const rename = (s: SimScenarioSummary) =>
    dialogs.prompt?.({
      title: 'Rename scenario',
      label: 'Title',
      initialValue: s.title,
      confirmLabel: 'Rename',
      validate: (v) => (v.trim() === '' ? 'Enter a title' : v.length > 200 ? 'At most 200 characters' : null),
      onConfirm: (v) => {
        void (async () => {
          const res = (await bridge()?.simulator?.rename({ id: s.id, title: v.trim() })) ?? noBridge();
          if (res.ok) void refresh();
          else setProblem(failText(res));
        })();
      },
    });

  const remove = (s: SimScenarioSummary) =>
    dialogs.confirm({
      title: `Move '${s.title}' to the Trash?`,
      body: 'You can restore it from the Trash in Finder.',
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: 1, sample: [] },
      blastRadiusKind: 'trash',
      onConfirm: () => {
        void (async () => {
          const res = (await bridge()?.simulator?.remove({ id: s.id })) ?? noBridge();
          if (res.ok) {
            if (currentId === s.id) setCurrentId(null);
            void refresh();
          } else setProblem(failText(res));
        })();
      },
    });

  return (
    <section aria-label="Scenarios" className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground">Scenarios</h2>
        {slow && <span role="status" aria-label="Loading scenarios" className="size-3 animate-spin rounded-full border-2 border-muted border-t-foreground" />}
      </div>
      <button type="button" className="rounded bg-primary px-2 py-1 text-sm text-primary-foreground disabled:opacity-50" disabled={busy} onClick={save}>
        Save
      </button>
      {failure !== null && (
        <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
          <span>{failure}</span>
          <button type="button" className="rounded bg-muted px-2 py-0.5 text-foreground" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}
      {problem !== null && (
        <p role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      )}
      {failure === null && scenarios.length === 0 && result !== null && <p className="text-xs text-muted-foreground">No saved scenarios yet.</p>}
      <ul className="flex flex-col gap-1">
        {scenarios.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={currentId === s.id}
              onClick={() => void open(s)}
              onContextMenu={(e) => {
                e.preventDefault();
                dialogs.openMenu?.({ clientX: e.clientX, clientY: e.clientY }, [
                  { label: 'Rename', onSelect: () => rename(s) },
                  { label: 'Delete', danger: true, onSelect: () => remove(s) },
                ]);
              }}
              className={`flex w-full flex-col items-start rounded px-2 py-1 text-left text-sm hover:bg-muted ${currentId === s.id ? 'bg-muted' : ''}`}
            >
              <span className="w-full truncate font-medium">{s.title}</span>
              <span className="text-xs text-muted-foreground">{relativeTime(s.updatedAt)}</span>
            </button>
            {unopenable.has(s.id) && (
              <p role="alert" className="px-2 text-xs text-destructive">
                {CANNOT_OPEN}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
