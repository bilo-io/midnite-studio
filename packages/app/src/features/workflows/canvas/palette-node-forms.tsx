import {
  WORKFLOW_AI_EXTRACT_MAX_FIELDS,
  WORKFLOW_AI_PROMPT_FORMATS,
  WORKFLOW_COALESCE_MAX_CANDIDATES,
  WORKFLOW_CONDITION_OPS,
  WORKFLOW_FILE_FORMATS,
  WORKFLOW_FORGE_TARGETS,
  WORKFLOW_WRITE_FILE_MODES,
  type WorkflowAiPromptFormat,
  type WorkflowConditionOp,
  type WorkflowFileFormat,
  type WorkflowForgeTarget,
  type WorkflowWriteFileMode,
} from '@midnite/studio-shared';
import type { FocusEvent } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import { Field, TextArea, TextField } from '../../../components/form/field';
import { SelectField } from '../../../components/form/select-field';
import { SwitchRow } from '../../../components/form/toggle-rows';
import { IconButton } from '../../../components/icon-button';
import { CONDITION_OP_LABEL, KeyValueRows, type NodeFormProps } from './node-forms';

/**
 * Inspector forms for the palette kinds added after Phase 97 — same contract
 * as `node-forms.tsx` (take the whole node, narrow with a `kind` guard, hand
 * back the whole next node), split into their own file only because that one
 * is already past a thousand lines. `NODE_FORMS` in `node-inspector.tsx`
 * dispatches to both, exhaustively.
 */

type Focus = NodeFormProps['onInterpolatableFocus'];

/** `onFocus` for a `{{...}}`-capable field — the one-liner every form below repeats. */
function interpolatable(focus: Focus, value: string, onChange: (next: string) => void) {
  return (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    focus({ value, onChange, el: event.currentTarget });
}

const REPO_HINT = "The app's own registered-repo id — the repository must be open in the app when the run reaches this step.";

function HeadlessAgentFields({
  agentId,
  model,
  ollamaModel,
  onChange,
}: {
  agentId: string;
  model: string | undefined;
  ollamaModel: string | undefined;
  onChange: (patch: { agentId?: string; model?: string | undefined; ollamaModel?: string | undefined }) => void;
}) {
  return (
    <>
      <Field label="Agent" hint="A roster CLI with a headless mode, e.g. claude. Empty uses the first one installed.">
        <TextField label="Agent" value={agentId} onChange={(next) => onChange({ agentId: next })} placeholder="claude" />
      </Field>
      <Field label="Model" hint="Optional — the CLI's own --model flag.">
        <TextField label="Model" value={model ?? ''} onChange={(next) => onChange({ model: next || undefined })} />
      </Field>
      <Field label="Ollama model" hint="Optional — run on this local Ollama model instead of a CLI.">
        <TextField
          label="Ollama model"
          value={ollamaModel ?? ''}
          onChange={(next) => onChange({ ollamaModel: next || undefined })}
          placeholder="llama3.2"
        />
      </Field>
    </>
  );
}

export function AiPromptForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'ai-prompt') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Prompt" hint="Sent once, headlessly — no terminal session. May reference an upstream node's output.">
        <TextArea
          label="Prompt"
          value={config.prompt}
          onChange={(prompt) => update({ prompt })}
          rows={6}
          onFocus={interpolatable(onInterpolatableFocus, config.prompt, (prompt) => update({ prompt }))}
        />
      </Field>
      <Field label="Reply as" hint="JSON parses the reply so downstream steps can read {{thisNode.json.field}}.">
        <SelectField
          label="Reply as"
          value={config.format}
          onChange={(format: WorkflowAiPromptFormat) => update({ format })}
          options={WORKFLOW_AI_PROMPT_FORMATS.map((format) => ({ value: format, label: format === 'json' ? 'JSON' : 'Text' }))}
        />
      </Field>
      <HeadlessAgentFields
        agentId={config.agentId}
        model={config.model}
        ollamaModel={config.ollamaModel}
        onChange={(patch) => update(patch)}
      />
    </>
  );
}

export function AiExtractForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'ai-extract') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  const updateField = (index: number, patch: Partial<(typeof config.fields)[number]>) =>
    update({ fields: config.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)) });
  const addField = () => {
    let key = 'field';
    let n = 1;
    while (config.fields.some((field) => field.key === key)) {
      key = `field${n}`;
      n += 1;
    }
    update({ fields: [...config.fields, { key, description: '' }] });
  };

  return (
    <>
      <Field label="Source" hint="The text to read. Usually an upstream node's output, e.g. {{fetch.body}}.">
        <TextArea
          label="Source"
          value={config.source}
          onChange={(source) => update({ source })}
          rows={3}
          onFocus={interpolatable(onInterpolatableFocus, config.source, (source) => update({ source }))}
        />
      </Field>
      <Field label="Fields" hint="Each becomes a key of this step's output — null when the text has no such value.">
        <div className="flex flex-col gap-1.5">
          {config.fields.map((field, index) => (
            <div key={index} className="flex items-center gap-1">
              <TextField
                label={`Field ${index + 1} key`}
                value={field.key}
                onChange={(key) => updateField(index, { key })}
                placeholder="key"
                className="min-w-0 flex-1"
              />
              <TextField
                label={`Field ${index + 1} description`}
                value={field.description}
                onChange={(description) => updateField(index, { description })}
                placeholder="What it is"
                className="min-w-0 flex-[2]"
              />
              <IconButton
                icon={LuTrash2}
                label={`Remove field ${index + 1}`}
                size="sm"
                onClick={() => update({ fields: config.fields.filter((_, i) => i !== index) })}
              />
            </div>
          ))}
          <IconButton
            icon={LuPlus}
            label="Add field"
            size="sm"
            onClick={addField}
            disabled={config.fields.length >= WORKFLOW_AI_EXTRACT_MAX_FIELDS}
          />
        </div>
      </Field>
      <HeadlessAgentFields
        agentId={config.agentId}
        model={config.model}
        ollamaModel={config.ollamaModel}
        onChange={(patch) => update(patch)}
      />
    </>
  );
}

export function AssertForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'assert') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Value" hint="What to check. May reference an upstream node's output.">
        <TextField
          label="Value"
          value={config.left}
          onChange={(left) => update({ left })}
          placeholder="{{nodeId.field}}"
          onFocus={interpolatable(onInterpolatableFocus, config.left, (left) => update({ left }))}
        />
      </Field>
      <Field label="Must" hint="The step fails unless this holds.">
        <SelectField
          label="Must"
          value={config.op}
          onChange={(op: WorkflowConditionOp) => update({ op, right: op === 'empty' ? undefined : (config.right ?? '') })}
          options={WORKFLOW_CONDITION_OPS.map((op) => ({ value: op, label: CONDITION_OP_LABEL[op] }))}
        />
      </Field>
      {config.op === 'empty' ? null : (
        <Field label="Expected" hint="Compared against the value.">
          <TextField
            label="Expected"
            value={config.right ?? ''}
            onChange={(right) => update({ right })}
            onFocus={interpolatable(onInterpolatableFocus, config.right ?? '', (right) => update({ right }))}
          />
        </Field>
      )}
      <Field label="Failure message" hint="Optional — shown as the step's error. Empty generates one.">
        <TextField
          label="Failure message"
          value={config.message}
          onChange={(message) => update({ message })}
          onFocus={interpolatable(onInterpolatableFocus, config.message, (message) => update({ message }))}
        />
      </Field>
    </>
  );
}

export function FailForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'fail') return null;
  const config = node.config;
  return (
    <Field label="Message" hint="The error this branch ends with. May reference an upstream node's output.">
      <TextArea
        label="Message"
        value={config.message}
        onChange={(message) => onChange({ ...node, config: { message } })}
        rows={3}
        onFocus={interpolatable(onInterpolatableFocus, config.message, (message) => onChange({ ...node, config: { message } }))}
      />
    </Field>
  );
}

export function CommandForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'command') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Command" hint="Run headlessly in /bin/sh — no terminal. May reference an upstream node's output.">
        <TextArea
          label="Command"
          value={config.command}
          onChange={(command) => update({ command })}
          rows={4}
          onFocus={interpolatable(onInterpolatableFocus, config.command, (command) => update({ command }))}
        />
      </Field>
      <Field label="Working directory" hint="Optional — defaults to the OS home directory.">
        <TextField label="Working directory" value={config.cwd ?? ''} onChange={(cwd) => update({ cwd: cwd || undefined })} />
      </Field>
      <KeyValueRows
        label="Env"
        hint="Set for this command only. May reference an upstream node's output."
        value={config.env}
        onChange={(env) => update({ env })}
        onValueFocus={(key, value, el) =>
          onInterpolatableFocus({ value, onChange: (next) => update({ env: { ...config.env, [key]: next } }), el })
        }
      />
      <SwitchRow
        id={`${node.id}-allow-nonzero`}
        label="Continue on a non-zero exit"
        title="Off: a non-zero exit code fails this step. On: it succeeds and hands the exit code on."
        on={config.allowNonZeroExit}
        onToggle={(_id, allowNonZeroExit) => update({ allowNonZeroExit })}
      />
    </>
  );
}

export function ReadFileForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'read-file') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Path" hint="An absolute path, or ~/…. May reference an upstream node's output.">
        <TextField
          label="Path"
          value={config.path}
          onChange={(path) => update({ path })}
          placeholder="~/notes/today.md"
          onFocus={interpolatable(onInterpolatableFocus, config.path, (path) => update({ path }))}
        />
      </Field>
      <Field label="Read as" hint="JSON parses the file, so downstream steps can read {{thisNode.json.field}}.">
        <SelectField
          label="Read as"
          value={config.format}
          onChange={(format: WorkflowFileFormat) => update({ format })}
          options={WORKFLOW_FILE_FORMATS.map((format) => ({ value: format, label: format === 'json' ? 'JSON' : 'Text' }))}
        />
      </Field>
    </>
  );
}

export function GitStatusForm({ node, onChange }: NodeFormProps) {
  if (node.kind !== 'git-status') return null;
  return (
    <Field label="Repository" hint={REPO_HINT}>
      <TextField
        label="Repository"
        value={node.config.repoId}
        onChange={(repoId) => onChange({ ...node, config: { repoId } })}
      />
    </Field>
  );
}

export function ForgeCommentForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'forge-comment') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Repository" hint={REPO_HINT}>
        <TextField label="Repository" value={config.repoId} onChange={(repoId) => update({ repoId })} />
      </Field>
      <Field label="On" hint="Comment on a pull request or an issue.">
        <SelectField
          label="On"
          value={config.target}
          onChange={(target: WorkflowForgeTarget) => update({ target })}
          options={WORKFLOW_FORGE_TARGETS.map((target) => ({ value: target, label: target === 'pr' ? 'Pull request' : 'Issue' }))}
        />
      </Field>
      <Field label="Number" hint="e.g. 42, or {{trigger.number}} from a forge PR trigger.">
        <TextField
          label="Number"
          value={config.number}
          onChange={(number) => update({ number })}
          placeholder="{{trigger.number}}"
          onFocus={interpolatable(onInterpolatableFocus, config.number, (number) => update({ number }))}
        />
      </Field>
      <Field label="Body" hint="Markdown. May reference an upstream node's output.">
        <TextArea
          label="Body"
          value={config.body}
          onChange={(body) => update({ body })}
          rows={5}
          onFocus={interpolatable(onInterpolatableFocus, config.body, (body) => update({ body }))}
        />
      </Field>
    </>
  );
}

export function ForgeIssueForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'forge-issue') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Repository" hint={REPO_HINT}>
        <TextField label="Repository" value={config.repoId} onChange={(repoId) => update({ repoId })} />
      </Field>
      <Field label="Title" hint="May reference an upstream node's output.">
        <TextField
          label="Title"
          value={config.title}
          onChange={(title) => update({ title })}
          onFocus={interpolatable(onInterpolatableFocus, config.title, (title) => update({ title }))}
        />
      </Field>
      <Field label="Body" hint="Markdown. May reference an upstream node's output.">
        <TextArea
          label="Body"
          value={config.body}
          onChange={(body) => update({ body })}
          rows={5}
          onFocus={interpolatable(onInterpolatableFocus, config.body, (body) => update({ body }))}
        />
      </Field>
      <Field label="Labels" hint="Comma-separated; each must already exist on the repository.">
        <TextField
          label="Labels"
          value={config.labels.join(', ')}
          onChange={(raw) =>
            update({
              labels: raw
                .split(',')
                .map((label) => label.trim())
                .filter((label) => label !== ''),
            })
          }
        />
      </Field>
    </>
  );
}

export function SetFieldsForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'set-fields') return null;
  const config = node.config;
  return (
    <KeyValueRows
      label="Fields"
      hint="Each value may reference an upstream node's output, and is parsed as JSON when it parses (42, true, {&quot;a&quot;:1})."
      value={config.fields}
      onChange={(fields) => onChange({ ...node, config: { fields } })}
      onValueFocus={(key, value, el) =>
        onInterpolatableFocus({
          value,
          onChange: (next) => onChange({ ...node, config: { fields: { ...config.fields, [key]: next } } }),
          el,
        })
      }
    />
  );
}

export function JsonExtractForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'json-extract') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Source" hint="JSON text — usually {{nodeId.stdout}} or a non-JSON http body.">
        <TextField
          label="Source"
          value={config.source}
          onChange={(source) => update({ source })}
          placeholder="{{nodeId.stdout}}"
          onFocus={interpolatable(onInterpolatableFocus, config.source, (source) => update({ source }))}
        />
      </Field>
      <Field label="Path" hint="Dotted, with numeric array indices — items.0.id. Empty is the whole document.">
        <TextField label="Path" value={config.path} onChange={(path) => update({ path })} placeholder="items.0.id" />
      </Field>
      <SwitchRow
        id={`${node.id}-required`}
        label="Fail when the path is missing"
        title="Off: a missing path yields null instead."
        on={config.required}
        onToggle={(_id, required) => update({ required })}
      />
    </>
  );
}

export function CoalesceForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'coalesce') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  const setCandidate = (index: number, next: string) =>
    update({ candidates: config.candidates.map((candidate, i) => (i === index ? next : candidate)) });

  return (
    <>
      <Field label="Candidates" hint="Tried in order — the first that resolves to a non-empty value wins.">
        <div className="flex flex-col gap-1.5">
          {config.candidates.map((candidate, index) => (
            <div key={index} className="flex items-center gap-1">
              <TextField
                label={`Candidate ${index + 1}`}
                value={candidate}
                onChange={(next) => setCandidate(index, next)}
                placeholder="{{nodeId.field}}"
                className="min-w-0 flex-1"
                onFocus={interpolatable(onInterpolatableFocus, candidate, (next) => setCandidate(index, next))}
              />
              <IconButton
                icon={LuTrash2}
                label={`Remove candidate ${index + 1}`}
                size="sm"
                onClick={() => update({ candidates: config.candidates.filter((_, i) => i !== index) })}
              />
            </div>
          ))}
          <IconButton
            icon={LuPlus}
            label="Add candidate"
            size="sm"
            onClick={() => update({ candidates: [...config.candidates, ''] })}
            disabled={config.candidates.length >= WORKFLOW_COALESCE_MAX_CANDIDATES}
          />
        </div>
      </Field>
      <Field label="Fallback" hint="Optional — used when no candidate has a value. Empty fails the step instead.">
        <TextField
          label="Fallback"
          value={config.fallback ?? ''}
          onChange={(fallback) => update({ fallback: fallback === '' ? undefined : fallback })}
        />
      </Field>
    </>
  );
}

export function NotifyForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'notify') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Title" hint="May reference an upstream node's output.">
        <TextField
          label="Title"
          value={config.title}
          onChange={(title) => update({ title })}
          placeholder="Workflow finished"
          onFocus={interpolatable(onInterpolatableFocus, config.title, (title) => update({ title }))}
        />
      </Field>
      <Field label="Body" hint="May reference an upstream node's output.">
        <TextArea
          label="Body"
          value={config.body}
          onChange={(body) => update({ body })}
          rows={3}
          onFocus={interpolatable(onInterpolatableFocus, config.body, (body) => update({ body }))}
        />
      </Field>
    </>
  );
}

export function WriteFileForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'write-file') return null;
  const config = node.config;
  const update = (patch: Partial<typeof config>) => onChange({ ...node, config: { ...config, ...patch } });
  return (
    <>
      <Field label="Path" hint="An absolute path, or ~/…. The folder must already exist. Counts as the write-files action for any policy upstream.">
        <TextField
          label="Path"
          value={config.path}
          onChange={(path) => update({ path })}
          placeholder="~/reports/latest.md"
          onFocus={interpolatable(onInterpolatableFocus, config.path, (path) => update({ path }))}
        />
      </Field>
      <Field label="Mode" hint="Replace the file, or add to its end.">
        <SelectField
          label="Mode"
          value={config.mode}
          onChange={(mode: WorkflowWriteFileMode) => update({ mode })}
          options={WORKFLOW_WRITE_FILE_MODES.map((mode) => ({ value: mode, label: mode === 'append' ? 'Append' : 'Overwrite' }))}
        />
      </Field>
      <Field label="Content" hint="May reference an upstream node's output.">
        <TextArea
          label="Content"
          value={config.content}
          onChange={(content) => update({ content })}
          rows={6}
          onFocus={interpolatable(onInterpolatableFocus, config.content, (content) => update({ content }))}
        />
      </Field>
    </>
  );
}

export function ClipboardForm({ node, onChange, onInterpolatableFocus }: NodeFormProps) {
  if (node.kind !== 'clipboard') return null;
  const config = node.config;
  return (
    <Field label="Text" hint="Copied when the run reaches this step. May reference an upstream node's output.">
      <TextArea
        label="Text"
        value={config.text}
        onChange={(text) => onChange({ ...node, config: { text } })}
        rows={3}
        onFocus={interpolatable(onInterpolatableFocus, config.text, (text) => onChange({ ...node, config: { text } }))}
      />
    </Field>
  );
}
