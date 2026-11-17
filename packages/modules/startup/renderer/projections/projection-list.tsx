import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { LuCopy, LuPencil, LuTrash2 } from 'react-icons/lu';

import { FLEET_STARTERS, MAX_FLEET_PROJECTIONS, buildFleetStarter, type FleetProjection, type FleetStarterId } from '@midnite/studio-shared';

import { STARTUP_CHROME } from '../compose/startup-chrome';
import { useStartupWrite } from '../data/use-startup';
import { computeFleetProjection } from './fleet-model';
import { formatZar } from './format-zar';
import { ALERT, BUTTON, BUTTON_PRIMARY, LABEL, PANE } from './styles';

/** `base`, then `base 2`, `base 3`… until no projection already has the name. */
export function uniqueName(base: string, existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((p) => p.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** The three starter buttons, shared by the list header and the empty centre pane. */
export function StarterButtons({ onPick, disabled }: { onPick: (id: FleetStarterId) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FLEET_STARTERS.map((s) => (
        <button key={s.id} type="button" className={BUTTON} disabled={disabled} onClick={() => onPick(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** Creates a projection from a starter and reports its id; owns its own failure text. */
export function useCreateProjection(projections: readonly FleetProjection[], onCreated: (id: string) => void) {
  const upsert = useStartupWrite((bridge, projection: FleetProjection) => bridge.upsertFleetProjection({ projection }));
  const [problem, setProblem] = useState<string | null>(null);
  const create = (starter: FleetStarterId) => {
    const projection = buildFleetStarter(starter, { projectionId: crypto.randomUUID(), nodeId: () => crypto.randomUUID() }, new Date().toISOString(), uniqueName('Projection', projections));
    setProblem(null);
    upsert.mutate(projection, { onSuccess: () => onCreated(projection.id), onError: (e) => setProblem(e.message) });
  };
  return { create, problem };
}

function Row({ projection, selected, renaming, readOnly, onSelect, onStartRename, onRename, onCancelRename, onDuplicate, onDelete, atCap, renameProblem }: {
  projection: FleetProjection;
  selected: boolean;
  renaming: boolean;
  readOnly: boolean;
  atCap: boolean;
  renameProblem: string | null;
  onSelect: () => void;
  onStartRename: () => void;
  onRename: (name: string) => boolean;
  onCancelRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const net = useMemo(() => computeFleetProjection(projection).netMarginMonthlyCents, [projection]);
  const [value, setValue] = useState(projection.name);
  const settled = useRef(false);
  const IconButton = STARTUP_CHROME.IconButton;
  const finish = (commit: boolean) => {
    if (settled.current) return;
    if (!commit) {
      settled.current = true;
      onCancelRename();
      return;
    }
    if (onRename(value)) settled.current = true;
  };
  useEffect(() => {
    if (renaming) {
      settled.current = false;
      setValue(projection.name);
    }
    // Only entering rename seeds the input; a name change mid-edit must not wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);
  return (
    <li
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`relative flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 hover:bg-accent/50 ${selected ? 'bg-accent/60' : ''}`}
    >
      {selected ? <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded bg-gradient-to-b from-indigo-500 via-purple-500 to-pink-500" /> : null}
      {renaming ? (
        <>
          <input
            autoFocus
            aria-label="Projection name"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => finish(true)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') finish(true);
              if (e.key === 'Escape') finish(false);
            }}
          />
          {renameProblem !== null ? (
            <p role="alert" className={ALERT}>
              {renameProblem}
            </p>
          ) : null}
        </>
      ) : (
        <span className="truncate text-sm font-medium">{projection.name}</span>
      )}
      <span className="flex items-center justify-between gap-2">
        <span className={LABEL}>
          {projection.nodes.length} {projection.nodes.length === 1 ? 'node' : 'nodes'} ·{' '}
          <span className={net >= 0 ? 'text-success' : 'text-destructive'}>{formatZar(net)} /mo</span>
        </span>
        <span className="flex" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={LuPencil} label="Rename" disabled={readOnly} onClick={onStartRename} />
          <IconButton icon={LuCopy} label="Duplicate" disabled={readOnly} disabledReason={atCap ? `You can have at most ${MAX_FLEET_PROJECTIONS} projections.` : undefined} onClick={onDuplicate} />
          <IconButton icon={LuTrash2} label="Delete" disabled={readOnly} onClick={onDelete} />
        </span>
      </span>
    </li>
  );
}

type Props = {
  projections: readonly FleetProjection[];
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
};

/** The left pane: every saved projection with its monthly net margin, plus create / rename / duplicate / delete. */
export function ProjectionList({ projections, selectedId, readOnly, onSelect }: Props) {
  const dialogs = STARTUP_CHROME.useDialogs();
  const [picking, setPicking] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameProblem, setRenameProblem] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const creator = useCreateProjection(projections, (id) => {
    setPicking(false);
    onSelect(id);
  });
  const upsert = useStartupWrite((bridge, projection: FleetProjection) => bridge.upsertFleetProjection({ projection }));
  const duplicate = useStartupWrite((bridge, args: { id: string; name: string }) => bridge.duplicateFleetProjection(args));
  const remove = useStartupWrite((bridge, id: string) => bridge.removeFleetProjection({ id }));
  const atCap = projections.length >= MAX_FLEET_PROJECTIONS;
  const capReason = `You can have at most ${MAX_FLEET_PROJECTIONS} projections.`;

  function rename(p: FleetProjection, raw: string): boolean {
    const name = raw.trim();
    if (name.length < 1 || name.length > 80) {
      setRenameProblem('Name must be 1–80 characters');
      return false;
    }
    setRenameProblem(null);
    setRenamingId(null);
    if (name !== p.name) upsert.mutate({ ...p, name }, { onError: (e) => setProblem(e.message) });
    return true;
  }

  function askDelete(p: FleetProjection): void {
    dialogs.confirm({
      title: `Delete ${p.name}?`,
      body: `${p.nodes.length} ${p.nodes.length === 1 ? 'node' : 'nodes'} will be deleted. This can't be undone.`,
      confirmLabel: 'Delete projection',
      danger: true,
      onConfirm: () => {
        const index = projections.findIndex((x) => x.id === p.id);
        const next = projections[index + 1] ?? projections[index - 1] ?? null;
        remove.mutate(p.id, {
          onSuccess: () => {
            if (selectedId === p.id) onSelect(next?.id ?? null);
          },
          onError: (e) => setProblem(e.message),
        });
      },
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    const index = projections.findIndex((p) => p.id === selectedId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = projections[e.key === 'ArrowDown' ? Math.min(projections.length - 1, index + 1) : Math.max(0, index - 1)];
      if (next !== undefined) onSelect(next.id);
    } else if ((e.key === 'Enter' || e.key === 'F2') && !readOnly && index >= 0) {
      e.preventDefault();
      setRenameProblem(null);
      setRenamingId(selectedId);
    }
  }

  const shownProblem = problem ?? creator.problem;
  return (
    <aside aria-label="Projection list" className={`flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-3 ${PANE}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Projections</h2>
        <button type="button" className={BUTTON_PRIMARY} disabled={readOnly || atCap} title={atCap ? capReason : undefined} onClick={() => setPicking((v) => !v)}>
          New
        </button>
      </div>
      {picking ? <StarterButtons disabled={readOnly || atCap} onPick={creator.create} /> : null}
      {shownProblem !== null ? (
        <p role="alert" className={ALERT}>
          {shownProblem}
        </p>
      ) : null}
      <ul role="listbox" aria-label="Projections" tabIndex={0} onKeyDown={onKeyDown} className="flex flex-col gap-1 outline-none">
        {projections.map((p) => (
          <Row
            key={p.id}
            projection={p}
            selected={p.id === selectedId}
            renaming={renamingId === p.id}
            readOnly={readOnly}
            atCap={atCap}
            renameProblem={renamingId === p.id ? renameProblem : null}
            onSelect={() => onSelect(p.id)}
            onStartRename={() => {
              setRenameProblem(null);
              setRenamingId(p.id);
            }}
            onRename={(name) => rename(p, name)}
            onCancelRename={() => {
              setRenameProblem(null);
              setRenamingId(null);
            }}
            onDuplicate={() => {
              if (atCap) return;
              setProblem(null);
              duplicate.mutate({ id: p.id, name: uniqueName(`${p.name} copy`, projections) }, { onSuccess: () => undefined, onError: (e) => setProblem(e.message) });
            }}
            onDelete={() => askDelete(p)}
          />
        ))}
      </ul>
    </aside>
  );
}
