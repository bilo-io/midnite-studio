import { useRef, useState, type KeyboardEvent } from 'react';
import { LuCheck, LuExternalLink } from 'react-icons/lu';

import {
  AGENT_BLUEPRINT_STAGES,
  blueprintSummary,
  type AgentBlueprint,
  type AgentBlueprintStage,
  type AgentBlueprintStageId,
} from '@midnite/studio-shared';

import { optionIcon, STAGE_ICONS } from './blueprint-icons';
import { controlClass } from './field';
import { useAgentProfilesHost } from './host';
import { InfoTip } from './info-tip';
import { FOCUS_RING } from './ui';

/** Most options one stage keeps (the schema's cap). */
const STAGE_OPTION_MAX = 4;
const NOTE_MAX = 500;

/** The pipeline's compact label: the first word of the stage label. */
const shortLabel = (stage: AgentBlueprintStage): string => stage.label.split(/[\s&]+/)[0] ?? stage.label;

function Chip({ label, optionId }: { label: string; optionId?: string }) {
  const Icon = optionId ? optionIcon(optionId) : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]">
      {Icon ? <Icon aria-hidden className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

/**
 * The blueprint: a pipeline of the five stages on the left, the active stage's options and note on
 * the right, and a sticky stack bar summarising every choice. Everything is visible at once.
 * `compact` is the narrow layout: a horizontal pipeline above the configurator.
 */
export function BlueprintEditor({
  value,
  onChange,
  compact = false,
}: {
  value: AgentBlueprint;
  onChange: (next: AgentBlueprint) => void;
  compact?: boolean;
}) {
  const host = useAgentProfilesHost();
  const [active, setActive] = useState<AgentBlueprintStageId>(AGENT_BLUEPRINT_STAGES[0]!.id);
  const rows = useRef<Partial<Record<AgentBlueprintStageId, HTMLButtonElement | null>>>({});
  const stage = AGENT_BLUEPRINT_STAGES.find((s) => s.id === active) ?? AGENT_BLUEPRINT_STAGES[0]!;
  const choice = value[stage.id];
  const chosen = choice?.options ?? [];
  const note = choice?.note ?? '';
  const summary = blueprintSummary(value);

  const setChoice = (id: AgentBlueprintStageId, patch: { options?: string[]; note?: string }): void => {
    const current = value[id];
    onChange({ ...value, [id]: { options: current?.options ?? [], note: current?.note ?? '', ...patch } });
  };
  const toggle = (optionId: string): void => {
    if (chosen.includes(optionId)) setChoice(stage.id, { options: chosen.filter((o) => o !== optionId) });
    else if (chosen.length < STAGE_OPTION_MAX) setChoice(stage.id, { options: [...chosen, optionId] });
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = AGENT_BLUEPRINT_STAGES.length - 1;
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Math.min(last, index + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    const target = AGENT_BLUEPRINT_STAGES[next]!.id;
    setActive(target);
    rows.current[target]?.focus();
  };

  const StageIcon = STAGE_ICONS[stage.id];

  return (
    <div
      data-testid="blueprint-editor"
      className={`grid rounded-md border border-border ${compact ? 'grid-cols-1' : 'grid-cols-[minmax(200px,1fr)_2fr]'}`}
    >
      <div
        role="tablist"
        aria-label="Blueprint stages"
        aria-orientation={compact ? 'horizontal' : 'vertical'}
        className={compact ? 'flex overflow-x-auto border-b border-border' : 'flex flex-col border-r border-border py-1'}
      >
        {AGENT_BLUEPRINT_STAGES.map((s, index) => {
          const count = value[s.id]?.options.length ?? 0;
          const isActive = s.id === active;
          return (
            <div key={s.id} className="relative">
              {!compact && index > 0 ? <span aria-hidden className="absolute -top-2 left-[1.375rem] h-4 w-px bg-border" /> : null}
              <button
                ref={(el) => {
                  rows.current[s.id] = el;
                }}
                type="button"
                role="tab"
                id={`blueprint-tab-${s.id}`}
                data-testid={`blueprint-stage-${s.id}`}
                aria-selected={isActive}
                aria-controls="blueprint-panel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(s.id)}
                onKeyDown={(event) => onKey(event, index)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors duration-150 motion-reduce:transition-none ${FOCUS_RING} ${
                  compact ? 'shrink-0 items-center border-b-2' : 'border-l-2'
                } ${isActive ? 'border-primary bg-primary/10 text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent/40'}`}
              >
                <span
                  aria-label={`${index + 1}. ${s.label}`}
                  data-testid={`blueprint-badge-${s.id}`}
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] tabular-nums ${
                    count > 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                  }`}
                >
                  {index + 1}
                </span>
                {compact ? (
                  <span className="font-medium">{shortLabel(s)}</span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{s.subtitle}</span>
                  </span>
                )}
                {count > 0 && !compact ? (
                  <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{count}</span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <div role="tabpanel" id="blueprint-panel" aria-labelledby={`blueprint-tab-${stage.id}`} className="space-y-3 p-3">
        <div className="flex items-center gap-1.5">
          <StageIcon aria-hidden className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            {stage.label} · {stage.subtitle}
          </h3>
          <InfoTip label={stage.label} text={stage.summary} side="bottom" />
        </div>
        <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2">
          {stage.options.map((option) => {
            const pressed = chosen.includes(option.id);
            const Icon = optionIcon(option.id);
            return (
              <div
                key={option.id}
                className={`flex flex-col gap-1 rounded-md border p-2.5 text-xs transition-colors duration-150 motion-reduce:transition-none ${
                  pressed ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/40'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-pressed={pressed}
                    data-testid={`blueprint-option-${option.id}`}
                    onClick={() => toggle(option.id)}
                    className={`flex min-w-0 flex-1 items-start gap-2 rounded text-left ${FOCUS_RING}`}
                  >
                    <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${pressed ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="min-w-0 flex-1 font-medium">{option.label}</span>
                    {pressed ? <LuCheck aria-hidden data-testid="blueprint-check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                  </button>
                  <InfoTip label={option.label} text={option.summary} side="bottom" />
                </div>
                {option.docsUrl ? (
                  <button
                    type="button"
                    onClick={() => host.openExternal(option.docsUrl!)}
                    aria-label={`Docs for ${option.label}`}
                    className={`ml-6 inline-flex w-fit items-center gap-0.5 rounded text-[11px] underline-offset-2 hover:underline ${FOCUS_RING}`}
                  >
                    Docs
                    <LuExternalLink aria-hidden className="h-[11px] w-[11px]" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-1 items-start gap-1 min-[560px]:grid-cols-[auto_1fr]">
          <label htmlFor={`blueprint-note-${stage.id}`} className="pt-1 text-xs font-medium">
            Note
          </label>
          <div>
            <textarea
              id={`blueprint-note-${stage.id}`}
              data-testid="blueprint-note"
              rows={3}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(event) => setChoice(stage.id, { note: event.target.value })}
              className={`${controlClass(false)} resize-y`}
            />
            <p className="mt-0.5 text-right text-[11px] tabular-nums text-muted-foreground" data-testid="blueprint-note-count">
              {note.length} / {NOTE_MAX}
            </p>
          </div>
        </div>
      </div>

      <div
        data-testid="stack-bar"
        aria-live="polite"
        aria-atomic="false"
        className="sticky bottom-[var(--builder-footer-h,49px)] z-[1] col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-background/95 px-3 py-2 backdrop-blur-sm"
      >
        <span className="text-[11px] font-semibold uppercase text-muted-foreground">Stack</span>
        {summary.map((row) => {
          const s = AGENT_BLUEPRINT_STAGES.find((x) => x.id === row.stageId)!;
          const ids = value[row.stageId]?.options ?? [];
          return (
            <button
              key={row.stageId}
              type="button"
              data-testid={`stack-group-${row.stageId}`}
              onClick={() => setActive(row.stageId)}
              className={`inline-flex flex-wrap items-center gap-1 rounded px-1 text-[11px] hover:bg-accent/40 ${FOCUS_RING}`}
            >
              <span className="text-muted-foreground">{s.subtitle}</span>
              {row.optionLabels.length === 0 ? (
                <span className="italic text-muted-foreground">None chosen</span>
              ) : (
                ids
                  .filter((id) => s.options.some((o) => o.id === id))
                  .map((id) => <Chip key={id} optionId={id} label={s.options.find((o) => o.id === id)!.label} />)
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
