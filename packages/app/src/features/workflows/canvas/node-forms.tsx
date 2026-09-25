import {
  WORKFLOW_CONDITION_OPS,
  WORKFLOW_DELAY_MAX_MS,
  WORKFLOW_HTTP_METHODS,
  WORKFLOW_JOIN_MAX_INPUTS,
  WORKFLOW_JOIN_MIN_INPUTS,
  WORKFLOW_JOIN_MODES,
  WORKFLOW_ROUTER_MAX_CASES,
  WORKFLOW_ROUTER_MODES,
  WORKFLOW_TEST_COUNT_PARSERS,
  WORKFLOW_VERIFY_CHECKS,
  type WorkflowConditionOp,
  type WorkflowHttpMethod,
  type WorkflowJoinMode,
  type WorkflowNode,
  type WorkflowRouterMode,
  type WorkflowTestCountParser,
  type WorkflowVerifyCheck,
  type WorkflowVerifyConfig,
} from '@midnite/studio-shared';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import { Field, TextArea, TextField } from '../../../components/form/field';
import { IconButton } from '../../../components/icon-button';
import { SelectField } from '../../../components/form/select-field';
import { SwitchRow } from '../../../components/form/toggle-rows';
import { DemoApiQuickFill } from './demo-api-quick-fill';

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
      <Field
        label="URL"
        hint="May reference an upstream node's output, e.g. {{nodeId.field}}, or {{demo.baseUrl}} for the demo API."
      >
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <TextField
              label="URL"
              value={config.url}
              onChange={(url) => update({ url })}
              placeholder="https://example.com/api"
              onFocus={(event) =>
                onInterpolatableFocus({
                  value: config.url,
                  onChange: (url) => update({ url }),
                  el: event.currentTarget,
                })
              }
            />
          </div>
          <DemoApiQuickFill onInsert={(url) => update({ url })} />
        </div>
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

const JOIN_MODE_LABEL: Record<WorkflowJoinMode, string> = {
  all: 'All — waits for every input, fails if any did not succeed',
  any: 'Any — settles the instant one input succeeds',
  allSettled: 'Every outcome — always waits, always succeeds, splits fulfilled/rejected',
};

/**
 * Phase 97 Theme B. `inputs` is a declared count, not a per-port list — the
 * canvas draws `in-1..in-N` from it (`portsForNode`) and the user wires
 * however many actually matter; this form only owns the count and the mode.
 */
export function JoinForm({ node, onChange }: NodeFormProps) {
  if (node.kind !== 'join') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });

  return (
    <>
      <Field label="Mode" hint="How the join decides it is done.">
        <SelectField
          label="Mode"
          value={config.mode}
          onChange={(mode: WorkflowJoinMode) => update({ mode })}
          options={WORKFLOW_JOIN_MODES.map((mode) => ({ value: mode, label: JOIN_MODE_LABEL[mode] }))}
        />
      </Field>
      <Field label="Inputs" hint={`Between ${WORKFLOW_JOIN_MIN_INPUTS} and ${WORKFLOW_JOIN_MAX_INPUTS} in-ports.`}>
        <TextField
          label="Inputs"
          value={String(config.inputs)}
          onChange={(raw) => {
            const parsed = Number.parseInt(raw, 10);
            const inputs = Number.isFinite(parsed)
              ? Math.max(WORKFLOW_JOIN_MIN_INPUTS, Math.min(WORKFLOW_JOIN_MAX_INPUTS, parsed))
              : WORKFLOW_JOIN_MIN_INPUTS;
            update({ inputs });
          }}
        />
      </Field>
    </>
  );
}

/**
 * Phase 95 Theme J. `agentId` is a plain text field rather than a roster
 * picker — the roster (`BUILTIN_AGENTS`/`agents.json`) is a runtime fact
 * about the host this form has no access to (it lives behind
 * `terminal-service.ts` in main), and validating it is `validateWorkflow`'s
 * job at run time, not this form's at edit time.
 */
export function AgentForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'agent') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });

  return (
    <>
      <Field label="Agent" hint="A roster agent id, e.g. claude, codex, agy — whatever is installed and logged in.">
        <TextField label="Agent" value={config.agentId} onChange={(agentId) => update({ agentId })} placeholder="claude" />
      </Field>
      <Field label="Prompt" hint="What to ask the agent to do. The node completes once it prints a done marker and goes idle.">
        <TextArea
          label="Prompt"
          value={config.prompt}
          onChange={(prompt) => update({ prompt })}
          rows={6}
          onFocus={(event) =>
            onInterpolatableFocus({ value: config.prompt, onChange: (prompt) => update({ prompt }), el: event.currentTarget })
          }
        />
      </Field>
      <Field label="Model" hint="Optional — the agent's own --model flag, when it has one.">
        <TextField label="Model" value={config.model ?? ''} onChange={(model) => update({ model: model || undefined })} />
      </Field>
    </>
  );
}

export function ScriptForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'script') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });

  return (
    <>
      <Field label="Command" hint="Run in a real login shell — may reference an upstream node's output.">
        <TextArea
          label="Command"
          value={config.command}
          onChange={(command) => update({ command })}
          rows={4}
          onFocus={(event) =>
            onInterpolatableFocus({ value: config.command, onChange: (command) => update({ command }), el: event.currentTarget })
          }
        />
      </Field>
      <Field label="Working directory" hint="Optional — defaults to the OS home directory (workflows are not repo-scoped).">
        <TextField label="Working directory" value={config.cwd ?? ''} onChange={(cwd) => update({ cwd: cwd || undefined })} />
      </Field>
      <KeyValueRows
        label="Env"
        value={config.env}
        onChange={(env) => update({ env })}
        onValueFocus={(key, value, el) =>
          onInterpolatableFocus({ value, onChange: (next) => update({ env: { ...config.env, [key]: next } }), el })
        }
      />
    </>
  );
}

const VERIFY_CHECK_LABEL: Record<WorkflowVerifyCheck, string> = {
  agent: 'Agent verdict',
  'exit-code': 'Exit code',
  'test-counts': 'Test counts',
  'json-path': 'JSON path',
};

/** A fresh, minimal config for a check kind — switching kinds replaces the whole config, since the fields genuinely differ. */
function defaultVerifyCheckConfig(check: WorkflowVerifyCheck): WorkflowVerifyConfig {
  switch (check) {
    case 'agent':
      return { check, agentId: '', prompt: '' };
    case 'exit-code':
      return { check, command: '', env: {} };
    case 'test-counts':
      return { check, command: '', env: {}, parser: 'vitest', minPassed: 1 };
    case 'json-path':
      return { check, source: '', op: 'eq', right: '' };
  }
}

/**
 * Phase 97 Theme E. One `Check` selector over the four kinds, then exactly
 * that kind's own fields — switching kinds calls `onChange` with
 * {@link defaultVerifyCheckConfig} rather than patching, since an `agent`
 * check's `agentId`/`prompt` and a `json-path` check's `source`/`op`/`right`
 * share no fields worth carrying across.
 */
export function VerifyForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'verify') return null;
  const config = node.config;

  return (
    <>
      <Field label="Check" hint="What decides pass vs fail.">
        <SelectField
          label="Check"
          value={config.check}
          onChange={(check: WorkflowVerifyCheck) => onChange({ ...node, config: defaultVerifyCheckConfig(check) })}
          options={WORKFLOW_VERIFY_CHECKS.map((check) => ({ value: check, label: VERIFY_CHECK_LABEL[check] }))}
        />
      </Field>

      {config.check === 'agent' ? (
        <>
          <Field label="Agent" hint="A roster agent id — ideally different from the agent that produced the work it checks.">
            <TextField
              label="Agent"
              value={config.agentId}
              onChange={(agentId) => onChange({ ...node, config: { ...config, agentId } })}
              placeholder="claude"
            />
          </Field>
          <Field label="Prompt" hint="What to ask the checking agent to grade. Completes on its own done marker.">
            <TextArea
              label="Prompt"
              value={config.prompt}
              onChange={(prompt) => onChange({ ...node, config: { ...config, prompt } })}
              rows={4}
              onFocus={(event) =>
                onInterpolatableFocus({
                  value: config.prompt,
                  onChange: (prompt) => onChange({ ...node, config: { ...config, prompt } }),
                  el: event.currentTarget,
                })
              }
            />
          </Field>
          <Field label="Model" hint="Optional — the agent's own --model flag, when it has one.">
            <TextField
              label="Model"
              value={config.model ?? ''}
              onChange={(model) => onChange({ ...node, config: { ...config, model: model || undefined } })}
            />
          </Field>
        </>
      ) : null}

      {config.check === 'exit-code' || config.check === 'test-counts' ? (
        <>
          <Field label="Command" hint="Run headlessly (no terminal, no interactive shell) — only the exit code and stdout are read.">
            <TextArea label="Command" value={config.command} onChange={(command) => onChange({ ...node, config: { ...config, command } })} rows={3} />
          </Field>
          <Field label="Working directory" hint="Optional — defaults to the OS home directory.">
            <TextField
              label="Working directory"
              value={config.cwd ?? ''}
              onChange={(cwd) => onChange({ ...node, config: { ...config, cwd: cwd || undefined } })}
            />
          </Field>
          <KeyValueRows
            label="Env"
            value={config.env}
            onChange={(env) => onChange({ ...node, config: { ...config, env } })}
            onValueFocus={(key, value, el) =>
              onInterpolatableFocus({
                value,
                onChange: (next) => onChange({ ...node, config: { ...config, env: { ...config.env, [key]: next } } }),
                el,
              })
            }
          />
        </>
      ) : null}

      {config.check === 'test-counts' ? (
        <>
          <Field label="Parser" hint="Which reporter format the command's stdout is in.">
            <SelectField
              label="Parser"
              value={config.parser}
              onChange={(parser: WorkflowTestCountParser) => onChange({ ...node, config: { ...config, parser } })}
              options={WORKFLOW_TEST_COUNT_PARSERS.map((parser) => ({ value: parser, label: parser }))}
            />
          </Field>
          <Field label="Minimum passed" hint="Fails if fewer than this many tests passed, even with zero failures.">
            <TextField
              label="Minimum passed"
              value={String(config.minPassed)}
              onChange={(raw) => {
                const parsed = Number.parseInt(raw, 10);
                onChange({ ...node, config: { ...config, minPassed: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 } });
              }}
            />
          </Field>
        </>
      ) : null}

      {config.check === 'json-path' ? (
        <>
          <Field label="Source" hint="May reference an upstream node's output.">
            <TextField
              label="Source"
              value={config.source}
              onChange={(source) => onChange({ ...node, config: { ...config, source } })}
              placeholder="{{nodeId.field}}"
              onFocus={(event) =>
                onInterpolatableFocus({
                  value: config.source,
                  onChange: (source) => onChange({ ...node, config: { ...config, source } }),
                  el: event.currentTarget,
                })
              }
            />
          </Field>
          <Field label="Compares" hint="How the source value is tested — reuses `condition`'s own comparison.">
            <SelectField
              label="Compares"
              value={config.op}
              onChange={(op: WorkflowConditionOp) =>
                onChange({ ...node, config: { ...config, op, right: op === 'empty' ? undefined : config.right } })
              }
              options={WORKFLOW_CONDITION_OPS.map((op) => ({ value: op, label: CONDITION_OP_LABEL[op] }))}
            />
          </Field>
          {config.op === 'empty' ? null : (
            <Field label="Right" hint="Compared against the source value.">
              <TextField
                label="Right"
                value={config.right ?? ''}
                onChange={(right) => onChange({ ...node, config: { ...config, right } })}
                onFocus={(event) =>
                  onInterpolatableFocus({
                    value: config.right ?? '',
                    onChange: (right) => onChange({ ...node, config: { ...config, right } }),
                    el: event.currentTarget,
                  })
                }
              />
            </Field>
          )}
        </>
      ) : null}
    </>
  );
}

/**
 * Phase 97 Theme D. `linkedRef` (the PR/issue comment approval channel) has
 * no editor here yet — wiring a repo/PR picker into this form is real UI
 * surface of its own, and every other approval channel (run panel, bell,
 * MCP) works with `linkedRef` unset. Left as a follow-up rather than a half
 * -built picker: `WorkflowGateLinkedRefSchema` is stable and ready for one.
 */
export function GateForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'gate') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });

  return (
    <>
      <Field label="Title" hint="Shown wherever this gate is decided from — the run panel, the bell, MCP.">
        <TextField label="Title" value={config.title} onChange={(title) => update({ title })} placeholder="Ship it?" />
      </Field>
      <Field label="Instructions" hint="What the approver needs to know. May reference an upstream node's output.">
        <TextArea
          label="Instructions"
          value={config.instructions}
          onChange={(instructions) => update({ instructions })}
          rows={4}
          onFocus={(event) =>
            onInterpolatableFocus({
              value: config.instructions,
              onChange: (instructions) => update({ instructions }),
              el: event.currentTarget,
            })
          }
        />
      </Field>
      <Field label="Timeout" hint="Milliseconds until this gate auto-rejects. Empty waits forever.">
        <TextField
          label="Timeout"
          value={config.timeoutMs === undefined ? '' : String(config.timeoutMs)}
          onChange={(raw) => {
            const trimmed = raw.trim();
            if (trimmed === '') {
              update({ timeoutMs: undefined });
              return;
            }
            const parsed = Number.parseInt(trimmed, 10);
            if (Number.isFinite(parsed) && parsed > 0) update({ timeoutMs: Math.min(parsed, 21_600_000) });
          }}
        />
      </Field>
    </>
  );
}

const ROUTER_MODE_LABEL: Record<WorkflowRouterMode, string> = {
  expression: 'Expression — first matching condition wins',
  'agent-label': 'Agent label — an embedded agent classifies the input',
};

/**
 * Phase 97 Theme F. `cases` owns its own id/label/condition rows; the
 * always-present `default` out-port (unmatched, or an agent label naming no
 * case) has no row here — like `error`, it is implicit, never edited.
 */
export function RouterForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'router') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });

  const updateCase = (index: number, patch: Partial<(typeof config.cases)[number]>) => {
    const cases = config.cases.map((routerCase, i) => (i === index ? { ...routerCase, ...patch } : routerCase));
    update({ cases });
  };
  const addCase = () => {
    if (config.cases.length >= WORKFLOW_ROUTER_MAX_CASES) return;
    let id = 'case';
    let n = 1;
    while (config.cases.some((routerCase) => routerCase.id === id)) {
      id = `case${n}`;
      n += 1;
    }
    update({ cases: [...config.cases, { id, label: 'New case' }] });
  };
  const removeCase = (index: number) => update({ cases: config.cases.filter((_, i) => i !== index) });

  return (
    <>
      <Field label="Mode" hint="How this router decides which case wins.">
        <SelectField
          label="Mode"
          value={config.mode}
          onChange={(mode: WorkflowRouterMode) => update({ mode })}
          options={WORKFLOW_ROUTER_MODES.map((mode) => ({ value: mode, label: ROUTER_MODE_LABEL[mode] }))}
        />
      </Field>
      <Field
        label="Cases"
        hint={
          config.mode === 'expression'
            ? 'Evaluated in order — the first whose condition holds wins. Falls through to Default.'
            : 'The closed set of ids the embedded agent may choose from. An unrecognised answer falls through to Default.'
        }
      >
        <div className="flex flex-col gap-2">
          {config.cases.map((routerCase, index) => (
            <div key={index} className="flex flex-col gap-1 rounded border border-border p-1.5">
              <div className="flex items-center gap-1">
                <TextField
                  label={`Case ${index + 1} id`}
                  value={routerCase.id}
                  onChange={(id) => updateCase(index, { id })}
                  placeholder="caseId"
                  className="min-w-0 flex-1"
                />
                <TextField
                  label={`Case ${index + 1} label`}
                  value={routerCase.label}
                  onChange={(label) => updateCase(index, { label })}
                  placeholder="Label"
                  className="min-w-0 flex-1"
                />
                <IconButton icon={LuTrash2} label={`Remove case ${index + 1}`} size="sm" onClick={() => removeCase(index)} />
              </div>
              {config.mode === 'expression' ? (
                <div className="flex items-center gap-1">
                  <TextField
                    label={`Case ${index + 1} left`}
                    value={routerCase.when?.left ?? ''}
                    onChange={(left) =>
                      updateCase(index, { when: { left, op: routerCase.when?.op ?? 'eq', right: routerCase.when?.right } })
                    }
                    placeholder="{{nodeId.field}}"
                    className="min-w-0 flex-1"
                    onFocus={(event) =>
                      onInterpolatableFocus({
                        value: routerCase.when?.left ?? '',
                        onChange: (left) =>
                          updateCase(index, {
                            when: { left, op: routerCase.when?.op ?? 'eq', right: routerCase.when?.right },
                          }),
                        el: event.currentTarget,
                      })
                    }
                  />
                  <SelectField
                    label={`Case ${index + 1} compares`}
                    value={routerCase.when?.op ?? 'eq'}
                    onChange={(op: WorkflowConditionOp) =>
                      updateCase(index, {
                        when: {
                          left: routerCase.when?.left ?? '',
                          op,
                          right: op === 'empty' ? undefined : routerCase.when?.right,
                        },
                      })
                    }
                    options={WORKFLOW_CONDITION_OPS.map((op) => ({ value: op, label: CONDITION_OP_LABEL[op] }))}
                  />
                  {routerCase.when?.op === 'empty' ? null : (
                    <TextField
                      label={`Case ${index + 1} right`}
                      value={routerCase.when?.right ?? ''}
                      onChange={(right) =>
                        updateCase(index, { when: { left: routerCase.when?.left ?? '', op: routerCase.when?.op ?? 'eq', right } })
                      }
                      className="min-w-0 flex-1"
                    />
                  )}
                </div>
              ) : null}
            </div>
          ))}
          <IconButton
            icon={LuPlus}
            label="Add case"
            size="sm"
            onClick={addCase}
            disabled={config.cases.length >= WORKFLOW_ROUTER_MAX_CASES}
          />
        </div>
      </Field>
      {config.mode === 'agent-label' ? (
        <>
          <Field label="Agent" hint="A roster agent id, e.g. claude, codex, agy — whatever is installed and logged in.">
            <TextField
              label="Agent"
              value={config.agent?.agentId ?? ''}
              onChange={(agentId) => update({ agent: { agentId, prompt: config.agent?.prompt ?? '', model: config.agent?.model } })}
              placeholder="claude"
            />
          </Field>
          <Field label="Prompt" hint="What to classify. The case ids above are appended automatically as the allowed answers.">
            <TextArea
              label="Prompt"
              value={config.agent?.prompt ?? ''}
              onChange={(prompt) => update({ agent: { agentId: config.agent?.agentId ?? '', prompt, model: config.agent?.model } })}
              rows={4}
              onFocus={(event) =>
                onInterpolatableFocus({
                  value: config.agent?.prompt ?? '',
                  onChange: (prompt) =>
                    update({ agent: { agentId: config.agent?.agentId ?? '', prompt, model: config.agent?.model } }),
                  el: event.currentTarget,
                })
              }
            />
          </Field>
        </>
      ) : null}
    </>
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
