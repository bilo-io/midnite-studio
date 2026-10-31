import {
  CUSTOM_LOOP_ICONS,
  DEFAULT_LOOPS,
  LOOP_SPECTRUM_HUES,
  addCustomOption,
  addCustomSection,
  moveCustomSection,
  removeCustomChoice,
  removeCustomOption,
  removeCustomSection,
  renameCustomSection,
  updateCustomOption,
  type CustomLoop,
  type CustomLoopModifier,
  type CustomOptionPatch,
} from '@midnite/studio-shared';
import { Slider } from '@bilo-io/ui';
import { useId, useState, type ReactNode } from 'react';
import {
  LuArrowDown,
  LuArrowUp,
  LuCheck,
  LuChevronRight,
  LuPencil,
  LuPlus,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import { SwitchTrack } from '@midnite/studio-frame';

import { useLoopsHost } from './host';
import { IconButton, useDialogs } from './loops-chrome';
import { useLoopsState } from './use-loops-host-state';
import { loopIcon } from './loop-icons';
import { loopsPanelElement } from './loops-panel-element';
import { spectrumStops } from './loop-spectrum';
import { loopLabel } from './use-all-loops';

/**
 * A custom loop's Edit mode — everything a built-in fixes in `shared` that a
 * user-authored loop lets its author change: name, icon, colour, base prompt,
 * and the option sections above the shared Run/Model/Schedule ones.
 *
 * Every field writes straight through to the store (`updateCustomLoop`), the
 * way every other composer control does, so there is no Save to forget and
 * the tab above recolours and renames as you type. The structural edits are
 * the pure helpers in `shared/src/custom-loops.ts`; this file only wires them
 * to inputs.
 */
export function CustomLoopEditor({ loop }: { loop: CustomLoop }) {
  const update = useLoopsState((s) => s.updateCustomLoop);
  const fresh = useLoopsState((s) => s.customLoopFresh === loop.id);
  const edit = (next: (current: CustomLoop) => CustomLoop): void => update(loop.id, next);

  return (
    <div className="flex flex-col gap-2 px-2 pb-2" data-testid={`custom-loop-editor-${loop.id}`}>
      {fresh ? <StartFromField loopId={loop.id} /> : null}

      <Field label="Name">
        {(id) => (
          <input
            id={id}
            value={loop.label}
            placeholder="Untitled loop"
            onChange={(event) => edit((l) => ({ ...l, label: event.target.value }))}
            className="loop-spectrum-field min-w-0 rounded px-1.5 py-1 text-[11px] outline-none"
          />
        )}
      </Field>

      <IconField loop={loop} onIcon={(icon) => edit((l) => ({ ...l, icon }))} />
      <ColourField hue={loop.hue} onHue={(hue) => edit((l) => ({ ...l, hue }))} />

      <Field label="Base prompt" hint="Sent first, before the options that are on. `/loop` repeats it.">
        {(id) => (
          <textarea
            id={id}
            rows={2}
            value={loop.fallbackPrompt}
            placeholder="/loop /my-skill"
            onChange={(event) => edit((l) => ({ ...l, fallbackPrompt: event.target.value }))}
            className="loop-spectrum-field min-w-0 resize-y rounded px-1.5 py-1 font-mono text-[11px] outline-none"
          />
        )}
      </Field>

      <div className="flex flex-col gap-1.5" data-testid="custom-loop-sections">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sections
        </span>
        {loop.sections.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No sections — add one to give the loop options.</p>
        ) : null}
        {loop.sections.map((section, index) => (
          <SectionEditor
            key={section.id}
            loop={loop}
            sectionId={section.id}
            label={section.label}
            first={index === 0}
            last={index === loop.sections.length - 1}
            edit={edit}
          />
        ))}
        <button
          type="button"
          onClick={() => edit((l) => addCustomSection(l, 'New section'))}
          className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <LuPlus aria-hidden className="h-3.5 w-3.5" />
          Add section
        </button>
      </div>

      <DeleteLoopButton loop={loop} />
    </div>
  );
}

/**
 * The row above a custom loop's form: says it is yours, and holds the Edit
 * toggle. Built-ins never render it — their structure is the app's.
 */
export function CustomLoopToolbar({ loop, editing }: { loop: CustomLoop; editing: boolean }) {
  const setEditing = useLoopsState((s) => s.setCustomLoopEditing);
  return (
    <div className="flex h-7 items-center gap-1.5 border-b border-border/50 px-2">
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
        {editing ? `Editing ${loopLabel(loop)}` : 'Custom loop'}
      </span>
      <button
        type="button"
        aria-pressed={editing}
        data-testid="custom-loop-edit-toggle"
        onClick={() => setEditing(editing ? null : loop.id)}
        className={`flex h-5 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium transition-colors ${
          editing ? 'loop-spectrum-pill text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        {editing ? <LuCheck aria-hidden className="h-3 w-3" /> : <LuPencil aria-hidden className="h-3 w-3" />}
        {editing ? 'Done' : 'Edit'}
      </button>
    </div>
  );
}

/** A labelled field — label above, control below, optional hint under it. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-[10px] text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}

/**
 * "Start from" — shown only on a loop "+" just made, until its first edit.
 * Blank, or an editable copy of a built-in; picking again replaces the last
 * pick, which is why it goes away once the author has changed anything.
 */
function StartFromField({ loopId }: { loopId: string }) {
  const startFrom = useLoopsState((s) => s.startCustomLoopFrom);
  const [picked, setPicked] = useState('blank');
  return (
    <Field label="Start from" hint="Blank, or an editable copy of a built-in's options.">
      {(id) => (
        <select
          id={id}
          value={picked}
          onChange={(event) => {
            setPicked(event.target.value);
            startFrom(loopId, event.target.value === 'blank' ? null : event.target.value);
          }}
          className="loop-spectrum-field min-w-0 rounded px-1 py-1 text-[11px] outline-none"
        >
          <option value="blank">Blank loop</option>
          {DEFAULT_LOOPS.map((loop) => (
            <option key={loop.id} value={loop.id}>
              Duplicate {loop.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** The icon picker — the built-ins' own glyph set, one toggle button each. */
function IconField({ loop, onIcon }: { loop: CustomLoop; onIcon: (icon: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground" id={`${loop.id}-icon-label`}>
        Icon
      </span>
      <div role="group" aria-labelledby={`${loop.id}-icon-label`} className="flex flex-wrap gap-1">
        {CUSTOM_LOOP_ICONS.map((token) => {
          const Icon = loopIcon(token);
          const selected = loop.icon === token;
          return (
            <button
              key={token}
              type="button"
              aria-label={`Icon ${token}`}
              aria-pressed={selected}
              onClick={() => onIcon(token)}
              className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                selected ? 'loop-spectrum-pill text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The colour picker: the six built-in spectra as swatches (each is its loop's
 * anchor hue), and a hue slider for any other arc. The tab and the Loop row
 * above repaint live — the swatch IS the value the panel reads.
 */
function ColourField({ hue, onHue }: { hue: number; onHue: (hue: number) => void }) {
  const sliderId = useId();
  const spectrum = spectrumStops(hue).map((stop) => `rgb(${stop})`);
  const ramp = spectrum.join(', ');
  return (
    <div className="flex flex-col gap-1" data-testid="custom-loop-colour">
      <span className="text-[11px] text-muted-foreground">Colour</span>
      <div className="flex flex-wrap items-center gap-1">
        {DEFAULT_LOOPS.map((loop) => {
          const preset = LOOP_SPECTRUM_HUES[loop.id] ?? 0;
          const stops = spectrumStops(preset);
          return (
            <button
              key={loop.id}
              type="button"
              aria-label={`${loop.label} colour`}
              aria-pressed={hue === preset}
              onClick={() => onHue(preset)}
              title={loop.label}
              className={`h-5 w-7 rounded border transition-transform hover:scale-105 ${
                hue === preset ? 'border-foreground' : 'border-border'
              }`}
              style={{ backgroundImage: `linear-gradient(100deg, ${stops.map((s) => `rgb(${s})`).join(', ')})` }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={sliderId} className="shrink-0 text-[10px] text-muted-foreground">
          Custom hue
        </label>
        <Slider
          id={sliderId}
          min={0}
          max={359}
          step={1}
          value={Math.round(hue)}
          onValueChange={onHue}
          gradient={spectrum}
          aria-valuetext={`${Math.round(hue)}°`}
          data-testid="custom-hue-slider"
          className="min-w-0 flex-1"
        />
        <span className="w-8 shrink-0 text-right font-mono text-[10px] text-foreground">{Math.round(hue)}°</span>
      </div>
      <div aria-hidden className="h-1.5 rounded-full" style={{ backgroundImage: `linear-gradient(90deg, ${ramp})` }} />
    </div>
  );
}

/** One option section: its name, its place in the order, and its options. */
function SectionEditor({
  loop,
  sectionId,
  label,
  first,
  last,
  edit,
}: {
  loop: CustomLoop;
  sectionId: string;
  label: string;
  first: boolean;
  last: boolean;
  edit: (next: (current: CustomLoop) => CustomLoop) => void;
}) {
  const options = loop.modifiers.filter((m) => m.section === sectionId);
  const choices = loop.choices.filter((c) => c.section === sectionId);
  const name = label || 'Untitled section';
  return (
    <section
      data-custom-section={sectionId}
      className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-popover/40 p-1.5"
    >
      <div className="flex items-center gap-1">
        <input
          aria-label="Section name"
          value={label}
          placeholder="Untitled section"
          onChange={(event) => edit((l) => renameCustomSection(l, sectionId, event.target.value))}
          className="loop-spectrum-field min-w-0 flex-1 rounded px-1.5 py-0.5 text-[11px] font-medium outline-none"
        />
        <IconButton
          icon={LuArrowUp}
          label={`Move ${name} up`}
          size="sm"
          disabled={first}
          onClick={() => edit((l) => moveCustomSection(l, sectionId, -1))}
        />
        <IconButton
          icon={LuArrowDown}
          label={`Move ${name} down`}
          size="sm"
          disabled={last}
          onClick={() => edit((l) => moveCustomSection(l, sectionId, 1))}
        />
        <IconButton
          icon={LuTrash2}
          label={`Remove ${name}`}
          size="sm"
          tone="danger"
          onClick={() => edit((l) => removeCustomSection(l, sectionId))}
        />
      </div>
      {options.map((option) => (
        <OptionEditor
          key={option.id}
          option={option}
          onPatch={(patch) => edit((l) => updateCustomOption(l, option.id, patch))}
          onRemove={() => edit((l) => removeCustomOption(l, option.id))}
        />
      ))}
      {choices.map((choice) => (
        <div
          key={choice.id}
          className="flex items-center gap-1 rounded border border-border/60 px-1.5 py-1 text-[11px] text-muted-foreground"
        >
          <span className="min-w-0 flex-1 truncate">
            {choice.label} <span className="text-muted-foreground/70">· one of {choice.options.length}</span>
          </span>
          <IconButton
            icon={LuX}
            label={`Remove ${choice.label}`}
            size="sm"
            tone="danger"
            onClick={() => edit((l) => removeCustomChoice(l, choice.id))}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => edit((l) => addCustomOption(l, sectionId))}
        className="flex h-6 items-center gap-1 self-start rounded px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <LuPlus aria-hidden className="h-3 w-3" />
        Add option to {name}
      </button>
    </section>
  );
}

/**
 * One switch option, collapsed to its label until opened. A just-added option
 * (no fragment yet) starts open, since the fragment is what it is for.
 */
function OptionEditor({
  option,
  onPatch,
  onRemove,
}: {
  option: CustomLoopModifier;
  onPatch: (patch: CustomOptionPatch) => void;
  onRemove: () => void;
}) {
  // Decided once, on mount — deriving it live would fold the body shut on the
  // author's first keystroke into the fragment.
  const [open, setOpen] = useState(() => option.promptFragment.length === 0);
  const bodyId = useId();
  const name = option.label || 'Untitled option';
  return (
    <div data-custom-option={option.id} className="flex flex-col gap-1 rounded border border-border/60 p-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
          onClick={() => setOpen(!open)}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <LuChevronRight aria-hidden className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <input
          aria-label="Option label"
          value={option.label}
          placeholder="Untitled option"
          onChange={(event) => onPatch({ label: event.target.value })}
          className="loop-spectrum-field min-w-0 flex-1 rounded px-1.5 py-0.5 text-[11px] outline-none"
        />
        <IconButton icon={LuX} label={`Remove ${name}`} size="sm" tone="danger" onClick={onRemove} />
      </div>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-1.5 pl-6">
          <OptionText
            label="Tooltip"
            value={option.description ?? ''}
            placeholder="What this option does, in plain words"
            onChange={(description) => onPatch({ description })}
          />
          <OptionText
            label="Prompt fragment"
            multiline
            value={option.promptFragment}
            placeholder="Appended to the prompt when the option is on"
            onChange={(promptFragment) => onPatch({ promptFragment })}
          />
          <OptionText
            label="Skill template"
            value={option.skillTemplate ?? ''}
            placeholder="Optional — the fragment with {skill} where a picked skill goes"
            onChange={(skillTemplate) => onPatch({ skillTemplate })}
          />
          <OptionText
            label="Default skill"
            value={option.defaultSkill ?? ''}
            placeholder="Optional — e.g. /midnite-pr-review"
            onChange={(defaultSkill) => onPatch({ defaultSkill })}
          />
          <label className="relative flex cursor-pointer items-center justify-between gap-2 text-[11px] text-muted-foreground hover:text-foreground">
            <span>On by default</span>
            <input
              type="checkbox"
              role="switch"
              checked={option.defaultOn}
              onChange={(event) => onPatch({ defaultOn: event.target.checked })}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <SwitchTrack />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A text field whose draft is kept locally while it would not survive the
 * store — a skill template still missing its `{skill}` slot is dropped by
 * `updateCustomOption`, and a controlled input fed back that dropped value
 * would erase the author's half-typed text on every keystroke.
 */
function OptionText({
  label,
  value,
  placeholder,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = (next: string): void => {
    setDraft(next);
    onChange(next);
  };
  const className = 'loop-spectrum-field min-w-0 rounded px-1.5 py-0.5 text-[11px] outline-none';
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={2}
          value={shown}
          placeholder={placeholder}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => setDraft(null)}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          id={id}
          value={shown}
          placeholder={placeholder}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => setDraft(null)}
          className={className}
        />
      )}
    </div>
  );
}

/**
 * Delete, behind a confirm — the loop's options, colour and history pairing
 * go with it, and a running session is closed first.
 *
 * Scrim and centring stop at the loops panel's edge via `container`,
 * so the confirmation overlays the panel rather than spanning the window.
 */
function DeleteLoopButton({ loop }: { loop: CustomLoop }) {
  const dialogs = useDialogs();
  const host = useLoopsHost();
  const remove = (): void => {
    const ui = host.loopsState();
    const terminals = host.terminalState();
    for (const sessionId of [ui.fabSessions[loop.id], ui.fabPrevSessions[loop.id]]) {
      if (sessionId !== undefined) terminals.closeSession(sessionId);
    }
    ui.deleteCustomLoop(loop.id);
  };
  return (
    <button
      type="button"
      data-testid="custom-loop-delete"
      onClick={(e) =>
        dialogs.confirm({
          title: `Delete ${loopLabel(loop)}?`,
          body: 'The loop, its sections and options are removed for good. Past runs stay in history.',
          confirmLabel: 'Delete loop',
          danger: true,
          blastRadius: null,
          container: (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-loops-panel]') ?? loopsPanelElement(),
          warnings: ['A run in progress on this tab is stopped and its terminal closed.'],
          onConfirm: remove,
        })
      }
      className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-destructive/40 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
    >
      <LuTrash2 aria-hidden className="h-3.5 w-3.5" />
      Delete loop
    </button>
  );
}
