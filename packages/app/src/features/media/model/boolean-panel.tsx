import { MODEL_BOOLEAN_OPS, type BuildIssue, type ModelPart, type ModelSpec } from '@midnite/studio-shared';
import type { Dispatch } from 'react';

import type { EditorAction } from './editor-state';
import { SECTION, SelectField } from './fields';

const OPS = [
  { value: 'none', label: 'None (solid part)' },
  ...MODEL_BOOLEAN_OPS.map((op) => ({ value: op, label: op[0]!.toUpperCase() + op.slice(1) })),
] as const;

/**
 * Boolean ops: a part with an op is consumed by its target (union adds, subtract carves, intersect
 * keeps the overlap) and drawn as a ghost in the viewport. Failures from the build show here.
 */
export function BooleanPanel({
  spec,
  index,
  selectionCount,
  issues,
  dispatch,
}: {
  spec: ModelSpec;
  index: number;
  selectionCount: number;
  issues: readonly BuildIssue[];
  dispatch: Dispatch<EditorAction>;
}) {
  const part = spec.parts[index]!;
  const targets = spec.parts.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== index && p.shape !== 'group' && p.shape !== 'instance' && !p.op);
  const mine = issues.filter((issue) => issue.path === `parts[${index}]` || issue.path.startsWith(`parts[${index}].`));
  const tools = spec.parts.filter((p) => p.op && (p.target === part.id || p.target === part.name));
  const canOp = part.shape !== 'group' && part.shape !== 'instance';
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Boolean">
      <p className="text-[11px] text-muted-foreground">
        A boolean part is merged into its target and not drawn on its own. Booleans run in part order.
      </p>
      <SelectField
        label="Operation"
        value={(part.op ?? 'none') as 'none' | NonNullable<ModelPart['op']>}
        options={OPS}
        onChange={(value) => dispatch({ type: 'patch', index, patch: { op: value === 'none' ? undefined : value, ...(value === 'none' ? { target: undefined } : {}) } })}
      />
      {!canOp ? <p className="text-[11px] text-amber-500">A {part.shape} cannot be a boolean operand.</p> : null}
      {part.op ? (
        <SelectField
          label="Target"
          value={part.target ?? ''}
          options={[
            { value: '', label: 'Nearest earlier solid' },
            ...targets.map(({ p, i }) => ({ value: p.id ?? p.name, label: `${p.name} (#${i + 1})` })),
          ]}
          onChange={(value) => dispatch({ type: 'patch', index, patch: { target: value === '' ? undefined : value } })}
        />
      ) : null}
      <button
        type="button"
        disabled={selectionCount < 2}
        onClick={() => dispatch({ type: 'subtract' })}
        className="h-6 self-start rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        Subtract selection from first
      </button>
      {tools.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          <span className={SECTION}>Operands</span> {tools.map((t) => `${t.op} ${t.name}`).join(', ')}
        </p>
      ) : null}
      {mine.map((issue, i) => (
        <p key={i} role="alert" className="text-[11px] text-amber-500">
          {issue.message}
        </p>
      ))}
    </div>
  );
}
