import type { PrefabInstanceInfo } from '../level-edit-model';

/**
 * The inspector's prefab row (Phase 139 Theme G): which prefab and instance the object belongs to, the three
 * instance actions, and the fields edited by hand with a Revert for each (the dot marks them).
 */
export function PrefabInspectorRow({
  info,
  overrides,
  readOnly,
  onSelectInstances,
  onUpdate,
  onUnpack,
  onRevert,
}: {
  info: PrefabInstanceInfo;
  overrides: readonly string[];
  readOnly: boolean;
  onSelectInstances: () => void;
  onUpdate: () => void;
  onUnpack: () => void;
  onRevert: (field: string) => void;
}) {
  const btn = 'rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-accent disabled:opacity-40';
  return (
    <div data-testid="level-prefab-row" className="flex flex-col gap-1 rounded border border-border p-1.5">
      <span className="truncate" title={`${info.prefab} · instance ${info.instance}`}>
        Prefab: {info.prefab} · instance {info.instance}
      </span>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={onSelectInstances} className={btn}>Select instances</button>
        <button type="button" disabled={readOnly} onClick={onUpdate} className={btn}>Update from prefab</button>
        <button type="button" disabled={readOnly} onClick={onUnpack} className={btn}>Unpack</button>
      </div>
      {overrides.length > 0 ? (
        <ul aria-label="Overridden fields" className="flex flex-col gap-0.5">
          {overrides.map((f) => (
            <li key={f} className="flex items-center gap-1">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1 truncate">{f}</span>
              <button type="button" aria-label={`Revert ${f}`} disabled={readOnly} onClick={() => onRevert(f)} className={btn}>Revert</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
