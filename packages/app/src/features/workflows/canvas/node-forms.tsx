import {
  WORKFLOW_CONDITION_OPS,
  WORKFLOW_DELAY_MAX_MS,
  WORKFLOW_HTTP_METHODS,
  type WorkflowConditionOp,
  type WorkflowHttpMethod,
  type WorkflowNode,
} from '@midnite/studio-shared';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import { Field, TextArea, TextField } from '../../../components/form/field';
import { IconButton } from '../../../components/icon-button';
import { SelectField } from '../../../components/form/select-field';
import { SwitchRow } from '../../../components/form/toggle-rows';

/**
 * One form per node kind (Phase 43 Theme F), dispatched by {@link NODE_FORMS}
 * in `node-inspector.tsx`. Each component takes the **whole** `WorkflowNode`
 * union and narrows with an `if (node.kind !== '…') return null` guard rather
 * than a generic parameter — `NODE_FORMS` is a `Record<WorkflowNodeKind, …>`
 * of one shared function type, which is what makes a sixth kind a compile
 * error there the moment `WORKFLOW_NODE_KINDS` grows; a per-kind generic
 * signature would defeat that.
 *
 * `onChange` always receives the **next whole node** — never a bare config —
 * so the inspector's single `onChangeNode` stays the one place a node is
 * ever written back to the graph.
 */
export type NodeFormProps = {
  node: WorkflowNode;
  onChange: (next: WorkflowNode) => void;
  /** `{{nodeId.field}}` insertion, wired to whichever text field last had focus. */
  onInterpolatableFocus: (target: { value: string; onChange: (next: string) => void; el: HTMLElement }) => void;
};

const CONDITION_OP_LABEL: Record<WorkflowConditionOp, string> = {
  eq: 'equals',
  ne: 'does not equal',
  lt: 'is less than',
  lte: 'is less than or equal to',
  gt: 'is greater than',
  gte: 'is greater than or equal to',
  contains: 'contains',
  empty: 'is empty',
};

export function HttpForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'http') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  const bodyDisabled = config.method === 'GET' || config.method === 'HEAD';

  return (
    <>
      <Field label="Method" hint="The HTTP verb this request sends.">
        <SelectField
          label="Method"
          value={config.method}
          onChange={(method: WorkflowHttpMethod) => update({ method })}
          options={WORKFLOW_HTTP_METHODS.map((method) => ({ value: method, label: method }))}
        />
      </Field>
      <Field label="URL" hint="May reference an upstream node's output, e.g. {{nodeId.field}}.">
        <TextField
          label="URL"
          value={config.url}
          onChange={(url) => update({ url })}
          placeholder="https://example.com/api"
          onFocus={(event) =>
            onInterpolatableFocus({ value: config.url, onChange: (url) => update({ url }), el: event.currentTarget })
          }
        />
      </Field>
      <SwitchRow
        id={`${node.id}-query-shaped`}
        label="Send as query params"
        title="Serialise this request's params into the URL's query string instead of a body."
        on={config.queryShaped}
        onToggle={(_id, queryShaped) => update({ queryShaped })}
      />
      <KeyValueRows
        label="Headers"
        value={config.headers}
        onChange={(headers) => update({ headers })}
        onValueFocus={(key, value, el) =>
          onInterpolatableFocus({
            value,
            onChange: (next) => update({ headers: { ...config.headers, [key]: next } }),
            el,
          })
        }
      />
      <KeyValueRows
        label="Params"
        value={config.params}
        onChange={(params) => update({ params })}
        onValueFocus={(key, value, el) =>
          onInterpolatableFocus({
            value,
            onChange: (next) => update({ params: { ...config.params, [key]: next } }),
            el,
          })
        }
      />
      <Field label="Body" hint={bodyDisabled ? 'Not sent on GET/HEAD.' : 'Raw request body, sent after interpolation.'}>
        <TextArea
          label="Body"
          value={config.body ?? ''}
          onChange={(body) => update({ body })}
          disabled={bodyDisabled}
          rows={4}
          onFocus={(event) =>
            onInterpolatableFocus({
              value: config.body ?? '',
              onChange: (body) => update({ body }),
              el: event.currentTarget,
            })
          }
        />
      </Field>
    </>
  );
}

export function TransformForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'transform') return null;
  const config = node.config;

  const updatePick = (index: number, patch: Partial<{ from: string; to: string }>) => {
    const picks = config.picks.map((pick, i) => (i === index ? { ...pick, ...patch } : pick));
    onChange({ ...node, config: { picks } });
  };
  const addPick = () => onChange({ ...node, config: { picks: [...config.picks, { from: '', to: '' }] } });
  const removePick = (index: number) =>
    onChange({ ...node, config: { picks: config.picks.filter((_, i) => i !== index) } });

  return (
    <Field label="Picks" hint="Rename or select a field from an upstream node's output.">
      <div className="flex flex-col gap-1.5">
        {config.picks.map((pick, index) => (
          <div key={index} className="flex items-center gap-1">
            <TextField
              label={`Pick ${index + 1} source`}
              value={pick.from}
              onChange={(from) => updatePick(index, { from })}
              placeholder="{{nodeId.field}}"
              className="min-w-0 flex-1"
              onFocus={(event) =>
                onInterpolatableFocus({
                  value: pick.from,
                  onChange: (from) => updatePick(index, { from }),
                  el: event.currentTarget,
                })
              }
            />
            <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
              →
            </span>
            <TextField
              label={`Pick ${index + 1} name`}
              value={pick.to}
              onChange={(to) => updatePick(index, { to })}
              placeholder="fieldName"
              className="min-w-0 flex-1"
            />
            <IconButton icon={LuTrash2} label={`Remove pick ${index + 1}`} size="sm" onClick={() => removePick(index)} />
          </div>
        ))}
        <IconButton icon={LuPlus} label="Add pick" size="sm" onClick={addPick} />
      </div>
    </Field>
  );
}

export function ConditionForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'condition') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });

  return (
    <>
      <Field label="Left" hint="May reference an upstream node's output.">
        <TextField
          label="Left"
          value={config.left}
          onChange={(left) => update({ left })}
          placeholder="{{nodeId.field}}"
          onFocus={(event) =>
            onInterpolatableFocus({ value: config.left, onChange: (left) => update({ left }), el: event.currentTarget })
          }
        />
      </Field>
      <Field label="Compares" hint="How the left value is tested.">
        <SelectField
          label="Compares"
          value={config.op}
          onChange={(op: WorkflowConditionOp) => update({ op, right: op === 'empty' ? undefined : config.right })}
          options={WORKFLOW_CONDITION_OPS.map((op) => ({ value: op, label: CONDITION_OP_LABEL[op] }))}
        />
      </Field>
      {config.op === 'empty' ? null : (
        <Field label="Right" hint="Compared against the left value.">
          <TextField
            label="Right"
            value={config.right ?? ''}
            onChange={(right) => update({ right })}
            onFocus={(event) =>
              onInterpolatableFocus({
                value: config.right ?? '',
                onChange: (right) => update({ right }),
                el: event.currentTarget,
              })
            }
          />
        </Field>
      )}
    </>
  );
}

export function DelayForm({ node, onChange }: NodeFormProps) {
  if (node.kind !== 'delay') return null;
  const config = node.config;

  return (
    <Field label="Wait" hint={`Milliseconds to pause before continuing, up to ${WORKFLOW_DELAY_MAX_MS}.`}>
      <TextField
        label="Milliseconds"
        value={String(config.ms)}
        onChange={(raw) => {
          const parsed = Number.parseInt(raw, 10);
          const ms = Number.isFinite(parsed) ? Math.max(0, Math.min(WORKFLOW_DELAY_MAX_MS, parsed)) : 0;
          onChange({ ...node, config: { ms } });
        }}
      />
    </Field>
  );
}

export function NoteForm({ node, onChange }: NodeFormProps) {
  if (node.kind !== 'note') return null;
  const config = node.config;

  return (
    <Field label="Text" hint="Canvas furniture — a note has no executor and cannot connect to other nodes.">
      <TextArea label="Text" value={config.text} onChange={(text) => onChange({ ...node, config: { text } })} rows={4} />
    </Field>
  );
}

/**
 * A minimal key/value row editor for `headers`/`params` — no drag-reorder,
 * since HTTP header/param order carries no meaning worth preserving.
 */
function KeyValueRows({
  label,
  value,
  onChange,
  onValueFocus,
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onValueFocus: (key: string, value: string, el: HTMLElement) => void;
}) {
  const entries = Object.entries(value);

  const updateEntry = (index: number, patch: { key?: string; value?: string }) => {
    const next = [...entries];
    const [oldKey, oldValue] = next[index]!;
    next[index] = [patch.key ?? oldKey, patch.value ?? oldValue];
    onChange(Object.fromEntries(next));
  };
  const removeEntry = (index: number) => {
    onChange(Object.fromEntries(entries.filter((_, i) => i !== index)));
  };
  const addEntry = () => {
    let key = 'key';
    let n = 1;
    while (Object.hasOwn(value, key)) {
      key = `key${n}`;
      n += 1;
    }
    onChange({ ...value, [key]: '' });
  };

  return (
    <Field label={label} hint={`Sent with every request. May reference an upstream node's output.`}>
      <div className="flex flex-col gap-1.5">
        {entries.map(([key, entryValue], index) => (
          <div key={index} className="flex items-center gap-1">
            <TextField
              label={`${label} key ${index + 1}`}
              value={key}
              onChange={(nextKey) => updateEntry(index, { key: nextKey })}
              className="min-w-0 flex-1"
            />
            <TextField
              label={`${label} value ${index + 1}`}
              value={entryValue}
              onChange={(nextValue) => updateEntry(index, { value: nextValue })}
              className="min-w-0 flex-1"
              onFocus={(event) => onValueFocus(key, entryValue, event.currentTarget)}
            />
            <IconButton icon={LuTrash2} label={`Remove ${label.toLowerCase()} row ${index + 1}`} size="sm" onClick={() => removeEntry(index)} />
          </div>
        ))}
        <IconButton icon={LuPlus} label={`Add ${label.toLowerCase()} row`} size="sm" onClick={addEntry} />
      </div>
    </Field>
  );
}
