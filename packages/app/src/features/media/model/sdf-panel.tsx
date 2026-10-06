import {
  applySdfOps,
  DEFAULT_SDF_TREE,
  findSdfNode,
  isSdfContainer,
  isSdfModifier,
  SDF_MODIFIER_KINDS,
  SDF_OPERATOR_KINDS,
  SDF_PRIMITIVE_KINDS,
  SDF_RESOLUTION_DEFAULT,
  SDF_RESOLUTION_PREVIEW,
  walkSdf,
  type ModelSpec,
  type SdfKind,
  type SdfNode,
  type SdfOp,
  type SdfTree,
} from '@midnite/studio-shared';
import { useEffect, useRef, useState, type Dispatch } from 'react';
import { LuArrowDown, LuArrowUp, LuCornerUpLeft, LuPlus, LuShapes, LuTrash2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import type { EditorAction, EditorState, Vec3 } from './editor-state';
import { ColorField, FIELD, NumberField, SECTION, SelectField, TextField, VecRow } from './fields';
import type { SdfBakeOutcome, SdfBaker, SdfBakeRequest } from './sculpt/use-sdf';

/**
 * The SDF tab (Phase 104 Theme C): block out an organic form as a tree of named primitives, smooth
 * booleans and modifiers, baked into a `sculpt` part. Every edit is one undo step and re-bakes at the
 * part's resolution; dragging a blend slider shows a live low-resolution preview in the viewport and
 * bakes in full on release. The tree stays on the part, so it can be edited until the first brush
 * stroke (Theme D).
 */

const RESOLUTIONS = [
  { value: '64', label: '64 (draft)' },
  { value: '96', label: '96' },
  { value: '128', label: '128' },
  { value: '192', label: '192' },
  { value: '256', label: '256 (finest)' },
] as const;

const PRIMITIVE_DEFAULTS: Record<(typeof SDF_PRIMITIVE_KINDS)[number], Record<string, unknown>> = {
  sphere: { radius: 0.2 },
  ellipsoid: { radii: [0.25, 0.15, 0.15] },
  capsule: { radius: 0.1, height: 0.3 },
  box: { size: [0.3, 0.3, 0.3], radius: 0.02 },
  torus: { radius: 0.2, tube: 0.05 },
  cone: { radius: 0.15, height: 0.3 },
  cylinder: { radius: 0.1, height: 0.3 },
};
const WRAP_DEFAULTS: Record<(typeof SDF_OPERATOR_KINDS)[number] | (typeof SDF_MODIFIER_KINDS)[number], Record<string, unknown>> = {
  union: { k: 0.05 },
  subtract: { k: 0.02 },
  intersect: {},
  displace: { amplitude: 0.01, frequency: 8 },
  twist: { angle: 90 },
  bend: { angle: 45 },
  round: { radius: 0.02 },
  shell: { thickness: 0.03 },
  mirror: { axis: 'x' },
};

type Param = { key: string; label: string; kind: 'number' | 'vec3' | 'axis'; step: number; min?: number; integer?: boolean };
const PARAMS: Record<SdfKind, Param[]> = {
  sphere: [{ key: 'radius', label: 'Radius', kind: 'number', step: 0.01, min: 0.001 }],
  ellipsoid: [{ key: 'radii', label: 'Radii', kind: 'vec3', step: 0.01, min: 0.001 }],
  capsule: [
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.01, min: 0.001 },
    { key: 'height', label: 'Height', kind: 'number', step: 0.01, min: 0 },
  ],
  box: [
    { key: 'size', label: 'Size', kind: 'vec3', step: 0.01, min: 0.001 },
    { key: 'radius', label: 'Rounding', kind: 'number', step: 0.005, min: 0 },
  ],
  torus: [
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.01, min: 0.001 },
    { key: 'tube', label: 'Tube', kind: 'number', step: 0.005, min: 0.001 },
  ],
  cone: [
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.01, min: 0.001 },
    { key: 'height', label: 'Height', kind: 'number', step: 0.01, min: 0.001 },
  ],
  cylinder: [
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.01, min: 0.001 },
    { key: 'height', label: 'Height', kind: 'number', step: 0.01, min: 0.001 },
  ],
  union: [],
  subtract: [],
  intersect: [],
  displace: [
    { key: 'amplitude', label: 'Amplitude', kind: 'number', step: 0.005 },
    { key: 'frequency', label: 'Frequency', kind: 'number', step: 0.5, min: 0.01 },
    { key: 'octaves', label: 'Octaves', kind: 'number', step: 1, min: 1, integer: true },
    { key: 'seed', label: 'Seed', kind: 'number', step: 1, min: 0, integer: true },
  ],
  twist: [{ key: 'angle', label: 'Angle °/m', kind: 'number', step: 5 }],
  bend: [{ key: 'angle', label: 'Angle °/m', kind: 'number', step: 5 }],
  round: [{ key: 'radius', label: 'Radius', kind: 'number', step: 0.005, min: 0 }],
  shell: [{ key: 'thickness', label: 'Thickness', kind: 'number', step: 0.005, min: 0.001 }],
  mirror: [{ key: 'axis', label: 'Axis', kind: 'axis', step: 1 }],
};

/** Each node with its depth and its parent's name (`undefined` for a root), depth first. */
function flatten(tree: SdfTree): { node: SdfNode; depth: number; parent: string | undefined; index: number }[] {
  const rows: { node: SdfNode; depth: number; parent: string | undefined; index: number }[] = [];
  const visit = (nodes: readonly SdfNode[], depth: number, parent: string | undefined) =>
    nodes.forEach((node, index) => {
      rows.push({ node, depth, parent, index });
      if (isSdfContainer(node)) visit(node.children, depth + 1, node.name);
    });
  visit(tree.nodes, 0, undefined);
  return rows;
}

function freshName(tree: SdfTree, base: string): string {
  const names = new Set<string>();
  walkSdf(tree.nodes, (node) => void names.add(node.name));
  for (let n = 1; ; n += 1) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

export function SdfPanel({
  state,
  dispatch,
  baker,
  onPreview,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  baker: SdfBaker;
  /** Shows a design in the viewport without touching history (`null` to stop). */
  onPreview: (spec: ModelSpec | null) => void;
}) {
  const { spec, selected } = state;
  const part = selected !== null ? spec.parts[selected] : undefined;
  const sdfPart = part?.shape === 'sculpt' && part.sdf ? part : null;
  const tree = sdfPart?.sdf?.tree ?? null;
  const [nodeName, setNodeName] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string>(String(SDF_RESOLUTION_DEFAULT));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const previewSeq = useRef(0);

  const bakedAt = sdfPart?.sdf?.resolution;
  useEffect(() => {
    if (bakedAt !== undefined) setResolution(String(bakedAt));
  }, [sdfPart?.id, bakedAt]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const node = tree && nodeName ? findSdfNode(tree, nodeName) : null;
  const rows = tree ? flatten(tree) : [];

  const report = (outcome: SdfBakeOutcome): boolean => {
    if (!outcome.ok) {
      setMessage({ kind: 'error', text: outcome.error });
      return false;
    }
    setMessage({ kind: 'ok', text: `Baked ${outcome.vertices.toLocaleString()} vertices at ${outcome.resolution}³ — ${Math.round(outcome.evaluatedShare * 100)}% of the grid evaluated.` });
    return true;
  };

  const bake = async (request: Omit<SdfBakeRequest, 'spec'>) => {
    previewSeq.current += 1;
    setBusy(true);
    setMessage(null);
    const outcome = await baker.commit({ spec, ...request });
    setBusy(false);
    onPreview(null);
    if (report(outcome) && outcome.ok) dispatch({ type: 'sdf', spec: outcome.spec, index: outcome.index });
  };

  const commitTree = (next: SdfTree) => void bake({ tree: next, index: selected, resolution: Number(resolution) });

  const edit = (ops: SdfOp[], select?: string | null) => {
    if (!tree) return;
    const out = applySdfOps(tree, ops);
    if (!out.ok) return setMessage({ kind: 'error', text: out.errors.map((e) => e.message).join(' ') });
    if (select !== undefined) setNodeName(select);
    commitTree(out.tree);
  };

  const preview = async (next: SdfTree) => {
    previewSeq.current += 1;
    const seq = previewSeq.current;
    const outcome = await baker.preview({ spec, tree: next, index: selected, resolution: SDF_RESOLUTION_PREVIEW });
    if (seq === previewSeq.current && outcome.ok) onPreview(outcome.spec);
  };

  if (!tree || selected === null) {
    const sdfParts = spec.parts.flatMap((p, i) => (p.shape === 'sculpt' && p.sdf ? [{ name: p.name, index: i }] : []));
    return (
      <div className="flex flex-col gap-2" role="group" aria-label="SDF">
        <p className="text-[11px] text-muted-foreground">
          Block out organic forms — heads, creatures, folds — as signed-distance shapes: primitives joined by smooth booleans and bent by modifiers. The result is a sculpt mesh you can keep editing as a tree.
        </p>
        {sdfParts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            Edit
            {sdfParts.map((p) => (
              <button key={p.index} type="button" onClick={() => dispatch({ type: 'select', index: p.index })} className="h-6 rounded-md border border-border bg-card px-2 text-foreground hover:bg-accent">
                {p.name}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void bake({ tree: DEFAULT_SDF_TREE, index: null, resolution: SDF_RESOLUTION_DEFAULT, name: 'sdf shape' })}
          className="flex h-6 w-fit items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:opacity-50"
        >
          <LuShapes aria-hidden className="h-3.5 w-3.5" />
          {busy ? 'Baking…' : 'New SDF shape'}
        </button>
        <Status message={message} />
      </div>
    );
  }

  const row = rows.find((r) => r.node.name === nodeName);
  const siblings = row ? (row.parent ? (findSdfNode(tree, row.parent) as Extract<SdfNode, { children: SdfNode[] }>).children : tree.nodes) : [];
  const addNode = (kind: (typeof SDF_PRIMITIVE_KINDS)[number]) => {
    const name = freshName(tree, kind);
    const fresh = { kind, name, ...PRIMITIVE_DEFAULTS[kind] } as SdfNode;
    // Into the selected operator, or beside the selected node, or at the end of the roots.
    if (node && isSdfContainer(node) && !isSdfModifier(node)) return edit([{ op: 'add', node: fresh, parent: node.name }], name);
    if (row) return edit([{ op: 'add', node: fresh, ...(row.parent ? { parent: row.parent } : {}), index: row.index + 1 }], name);
    return edit([{ op: 'add', node: fresh }], name);
  };
  const wrap = (kind: keyof typeof WRAP_DEFAULTS) => {
    if (!nodeName) return;
    const name = freshName(tree, kind);
    edit([{ op: 'wrap', name: nodeName, node: { kind, name, ...WRAP_DEFAULTS[kind] } }], name);
  };
  const moveBy = (delta: number) => {
    if (!row) return;
    const index = row.index + delta;
    if (index < 0 || index >= siblings.length) return;
    edit([{ op: 'move', name: row.node.name, ...(row.parent ? { parent: row.parent } : {}), index }]);
  };
  const outdent = () => {
    if (!row?.parent) return;
    const parentRow = rows.find((r) => r.node.name === row.parent)!;
    edit([{ op: 'move', name: row.node.name, ...(parentRow.parent ? { parent: parentRow.parent } : {}), index: parentRow.index + 1 }]);
  };
  const update = (set: Record<string, unknown>) => nodeName && edit([{ op: 'update', name: nodeName, set }], typeof set.name === 'string' ? set.name : undefined);

  return (
    <div className="flex min-h-0 gap-3" role="group" aria-label="SDF">
      <div className="flex w-56 shrink-0 flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <p className={`${SECTION} mr-auto`}>SDF tree · {sdfPart!.name}</p>
          <IconButton icon={LuArrowUp} label="Move node up" size="sm" disabled={!row || row.index === 0 || busy} onClick={() => moveBy(-1)} />
          <IconButton icon={LuArrowDown} label="Move node down" size="sm" disabled={!row || row.index >= siblings.length - 1 || busy} onClick={() => moveBy(1)} />
          <IconButton icon={LuCornerUpLeft} label="Move node out of its parent" size="sm" disabled={!row?.parent || busy} onClick={outdent} />
          <IconButton icon={LuTrash2} label="Remove node" size="sm" tone="danger" disabled={!row || rows.length <= 1 || busy} onClick={() => edit([{ op: 'remove', name: row!.node.name }], null)} />
        </div>
        <ul role="tree" aria-label="SDF nodes" className="hide-scrollbar max-h-32 overflow-auto rounded-md border border-border/70 bg-background/40 py-0.5">
          {rows.map((r) => (
            <li key={r.node.name} role="treeitem" aria-selected={r.node.name === nodeName} aria-level={r.depth + 1}>
              <button
                type="button"
                onClick={() => setNodeName(r.node.name === nodeName ? null : r.node.name)}
                style={{ paddingLeft: 6 + r.depth * 12 }}
                className={`flex h-5 w-full items-center gap-1.5 pr-1.5 text-left text-[11px] ${r.node.name === nodeName ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'}`}
              >
                <span className="truncate text-foreground">{r.node.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{r.node.kind}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <LuPlus aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <select aria-label="Add primitive" value="" disabled={busy} onChange={(e) => e.target.value && addNode(e.target.value as (typeof SDF_PRIMITIVE_KINDS)[number])} className={`${FIELD} min-w-0 flex-1`}>
            <option value="">Add primitive…</option>
            {SDF_PRIMITIVE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <select aria-label="Wrap node" value="" disabled={!node || busy} onChange={(e) => e.target.value && wrap(e.target.value as keyof typeof WRAP_DEFAULTS)} className={`${FIELD} min-w-0 flex-1`}>
            <option value="">Wrap in…</option>
            {[...SDF_OPERATOR_KINDS, ...SDF_MODIFIER_KINDS].map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {node ? (
          <NodeFields key={node.name} node={node} update={update} preview={(set) => void preview(applyOrSame(tree, node.name, set))} />
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">Pick a node to edit it. The roots are joined by a union; blend softens the seams between them.</p>
            <BlendSlider label="Root blend" value={tree.blend ?? 0} onPreview={(k) => void preview(applyOps(tree, [{ op: 'blend', k }]))} onCommit={(k) => edit([{ op: 'blend', k }])} />
          </>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <SelectField label="Bake detail" value={resolution} options={RESOLUTIONS} onChange={setResolution} />
          <button
            type="button"
            disabled={busy}
            onClick={() => commitTree(tree)}
            className="flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:opacity-50"
          >
            {busy ? 'Baking…' : 'Bake'}
          </button>
          <span className="text-[11px] text-muted-foreground">
            {sdfPart!.vertices?.toLocaleString() ?? '?'} vertices at {sdfPart!.sdf!.resolution}³
          </span>
        </div>
        <Status message={message} />
      </div>
    </div>
  );
}

const applyOps = (tree: SdfTree, ops: SdfOp[]): SdfTree => {
  const out = applySdfOps(tree, ops);
  return out.ok ? out.tree : tree;
};
const applyOrSame = (tree: SdfTree, name: string, set: Record<string, unknown>): SdfTree => applyOps(tree, [{ op: 'update', name, set }]);

function Status({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-[11px] ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
      {message.text}
    </p>
  );
}

/** A blend radius: previews while dragged, bakes on release. */
function BlendSlider({ label, value, onPreview, onCommit }: { label: string; value: number; onPreview: (k: number) => void; onCommit: (k: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const release = () => draft !== value && onCommit(draft);
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={0}
        max={0.5}
        step={0.005}
        value={draft}
        onChange={(event) => {
          const k = Number(event.target.value);
          setDraft(k);
          onPreview(k);
        }}
        onPointerUp={release}
        onKeyUp={release}
        onBlur={release}
        className="h-1 min-w-0 flex-1 accent-primary"
      />
      <NumberField label={label} value={value} step={0.005} min={0} max={10} onCommit={(k) => k !== undefined && onCommit(k)} />
    </div>
  );
}

function NodeFields({ node, update, preview }: { node: SdfNode; update: (set: Record<string, unknown>) => void; preview: (set: Record<string, unknown>) => void }) {
  const record = node as Record<string, unknown>;
  return (
    <div className="flex flex-col gap-1.5" aria-label={`SDF node ${node.name}`} role="group">
      <div className="flex items-center gap-2">
        <TextField label="Name" value={node.name} onCommit={(name) => update({ name })} />
        <span className="text-[11px] text-muted-foreground">{node.kind}</span>
        <ColorField label="Colour" value={node.color ?? '#b0b0b0'} onCommit={(color) => update({ color })} />
      </div>
      {'k' in record || (SDF_OPERATOR_KINDS as readonly string[]).includes(node.kind) ? (
        <BlendSlider label="Blend k" value={(record.k as number | undefined) ?? 0} onPreview={(k) => preview({ k })} onCommit={(k) => update({ k })} />
      ) : null}
      {PARAMS[node.kind].map((param) =>
        param.kind === 'vec3' ? (
          <VecRow key={param.key} label={param.label} value={(record[param.key] as Vec3 | undefined) ?? [0, 0, 0]} step={param.step} {...(param.min !== undefined ? { min: param.min } : {})} onCommit={(v) => update({ [param.key]: v })} />
        ) : param.kind === 'axis' ? (
          <SelectField
            key={param.key}
            label={param.label}
            value={(record[param.key] as 'x' | 'y' | 'z') ?? 'x'}
            options={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]}
            onChange={(axis) => update({ [param.key]: axis })}
          />
        ) : (
          <label key={param.key} className="flex items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{param.label}</span>
            <NumberField
              label={param.label}
              value={record[param.key] as number | undefined}
              step={param.step}
              {...(param.min !== undefined ? { min: param.min } : {})}
              {...(param.integer ? { integer: true } : {})}
              onCommit={(v) => update({ [param.key]: v ?? null })}
            />
          </label>
        ),
      )}
      <VecRow label="Position" value={node.position ?? [0, 0, 0]} step={0.01} onCommit={(position) => update({ position })} />
      <VecRow label="Rotation" value={node.rotation ?? [0, 0, 0]} step={5} onCommit={(rotation) => update({ rotation })} />
      <label className="flex items-center gap-1.5">
        <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Scale</span>
        <NumberField label="Scale" value={node.scale ?? 1} step={0.05} min={0.001} onCommit={(scale) => update({ scale: scale ?? null })} />
      </label>
    </div>
  );
}
