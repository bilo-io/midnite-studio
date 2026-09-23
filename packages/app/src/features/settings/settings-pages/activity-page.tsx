import { useMemo } from 'react';

import { Accordion } from '@bilo-io/ui';
import {
  LuBot,
  LuEye,
  LuPalette,
  LuSparkles,
  LuSquareKanban,
  LuSquareTerminal,
  LuWorkflow,
} from 'react-icons/lu';

import {
  ACTIVITY_PRESET_ORDER,
  ACTIVITY_PRESETS,
  ACTIVITY_STATUSES,
  type ActivityStatus,
  type ActivityStatusStyle,
} from '@midnite/studio-shared';

import {
  useActivityPaletteStore,
  type AgentStyleMode,
  type ShellStyleMode,
} from '../../activity/activity-palette-store';
import { resolveActivePalette } from '../../activity/resolve-active-palette';
import { Choice, Field } from './controls';

/** Scannable labels for the nine `ActivityStatus` values — nowhere else in
 * the app needed one until this page. */
const STATUS_LABELS: Record<ActivityStatus, string> = {
  agent: 'Agent',
  shell: 'Shell',
  thinking: 'Thinking',
  waiting: 'Waiting',
  running: 'Running',
  queued: 'Queued',
  done: 'Done',
  failed: 'Failed',
  idle: 'Idle',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A colour picker only accepts `#rrggbb` — any theme-derived `hsl(var(--…))`
 * literal or a preset's `#rrggbb` (already valid) falls back to a neutral
 * grey the user immediately overwrites by picking, rather than the input
 * silently rejecting the value and showing black. */
function toEditableHex(color: string): string {
  return HEX.test(color) ? color : '#888888';
}

/** One conic-gradient preview ring, reused by the preset cards and every
 * status row's swatch — `data-activity-status` on a `.activity-glow` node
 * always renders the CURRENT synced tokens, so no local styling duplicates
 * the resolution logic `useActivityPaletteSync` already owns. */
function GlowSwatch({
  status,
  className = 'h-6 w-6 rounded-full',
}: {
  status: ActivityStatus;
  className?: string;
}) {
  return <div aria-hidden className={`activity-glow ${className}`} data-activity-status={status} />;
}

/**
 * Settings ▸ Activity (Phase 95 Theme B) — the preset picker, per-status
 * colour overrides, the agent/shell style pair, and a live preview strip,
 * all reading/writing `useActivityPaletteStore` (persisted to
 * `appearance-store.ts`'s shared `'midnite.settings'` key). Every control
 * here writes the store directly — `useActivityPaletteSync` (mounted once
 * in `app.tsx`) is what turns a store change into `--activity-*` tokens, so
 * nothing on this page touches the DOM itself beyond the preview swatches.
 */
export function ActivityPage() {
  const activePaletteId = useActivityPaletteStore((s) => s.activePaletteId);
  const statusOverrides = useActivityPaletteStore((s) => s.statusOverrides);
  const agentStyle = useActivityPaletteStore((s) => s.agentStyle);
  const shellStyle = useActivityPaletteStore((s) => s.shellStyle);
  const setActivePaletteId = useActivityPaletteStore((s) => s.setActivePaletteId);
  const setStatusOverride = useActivityPaletteStore((s) => s.setStatusOverride);
  const resetStatusOverride = useActivityPaletteStore((s) => s.resetStatusOverride);
  const setAgentStyle = useActivityPaletteStore((s) => s.setAgentStyle);
  const setShellStyle = useActivityPaletteStore((s) => s.setShellStyle);
  const resetAll = useActivityPaletteStore((s) => s.resetAll);

  const resolved = useMemo(
    () => resolveActivePalette(activePaletteId, statusOverrides, agentStyle, shellStyle),
    [activePaletteId, statusOverrides, agentStyle, shellStyle],
  );

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Preset" icon={<LuSparkles className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-3 p-3">
          <Field
            label="Activity preset"
            hint="Retints the agent ring everywhere a session is actively working — cards, graph nodes, workflow nodes and terminal rows."
          >
            <div role="radiogroup" aria-label="Activity preset" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACTIVITY_PRESET_ORDER.map((id) => {
                const preset = ACTIVITY_PRESETS[id]!;
                const active = id === activePaletteId;
                const agentStops =
                  preset.statuses.agent?.color.kind === 'gradient'
                    ? preset.statuses.agent.color.stops.join(', ')
                    : (preset.statuses.agent?.color.color ?? 'transparent');
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setActivePaletteId(id)}
                    className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors ${
                      active ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                    }`}
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-full"
                      style={{ background: `conic-gradient(${agentStops})` }}
                    />
                    <span className="truncate text-xs font-medium">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Accordion>

      <Accordion title="Agent & shell style" icon={<LuBot className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Choice<AgentStyleMode>
            label="Agent style"
            hint="How a live agent session's own ring paints, independent of which preset is active."
            value={agentStyle}
            onChange={setAgentStyle}
            options={[
              ['gradient', 'Gradient', "The active preset's identity ring."],
              ['metallic', 'Metallic', 'The same brushed-silver ring a plain shell wears.'],
            ]}
          />
          <Choice<ShellStyleMode>
            label="Shell style"
            hint="How a plain terminal with no agent in it paints."
            value={shellStyle}
            onChange={setShellStyle}
            options={[
              ['metallic', 'Metallic', 'A fixed brushed-silver ring (the default).'],
              ['gradient', 'Gradient', "The active preset's own agent ring."],
              ['matchAgent', 'Match agent', "Whatever the Agent style above resolves to, live."],
            ]}
          />
        </div>
      </Accordion>

      <Accordion title="Status colours" icon={<LuPalette className="h-4 w-4" />}>
        <div className="flex flex-col gap-2 p-3">
          {ACTIVITY_STATUSES.map((status) => (
            <StatusOverrideRow
              key={status}
              status={status}
              resolvedStyle={resolved.statuses[status]!}
              hasOverride={Boolean(statusOverrides[status])}
              onChange={(style) => setStatusOverride(status, style)}
              onReset={() => resetStatusOverride(status)}
            />
          ))}
        </div>
      </Accordion>

      <Accordion title="Preview" icon={<LuEye className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-3 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            One sample of each surface the Activity glow paints, per status — updates live as you
            edit above.
          </p>
          <PreviewStrip />
        </div>
      </Accordion>

      <Accordion title="Reset" icon={<LuSparkles className="h-4 w-4" />}>
        <div className="flex flex-col gap-2 p-3">
          <Field
            label="Reset"
            hint="Restores the preset, every status colour override, and the agent/shell style choices to their shipped defaults."
          >
            <button
              type="button"
              onClick={resetAll}
              className="h-6 w-fit rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Reset to defaults
            </button>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}

/** `agent`/`shell` each also have a style-mode picker one accordion up —
 * this note is what tells a reader of THIS row where that control lives,
 * rather than a third copy of the segmented control here. */
const HAS_STYLE_MODE_ELSEWHERE: ReadonlySet<ActivityStatus> = new Set(['agent', 'shell']);

function StatusOverrideRow({
  status,
  resolvedStyle,
  hasOverride,
  onChange,
  onReset,
}: {
  status: ActivityStatus;
  resolvedStyle: ActivityStatusStyle;
  hasOverride: boolean;
  onChange: (style: ActivityStatusStyle) => void;
  onReset: () => void;
}) {
  const kind = resolvedStyle.color.kind;
  const stops = kind === 'gradient' ? resolvedStyle.color.stops : [];
  const solid = kind === 'solid' ? resolvedStyle.color.color : undefined;

  const setKind = (nextKind: 'solid' | 'gradient') => {
    if (nextKind === kind) return;
    if (nextKind === 'solid') {
      onChange({
        ...resolvedStyle,
        color: { kind: 'solid', color: toEditableHex(stops[0] ?? '#888888') },
      });
    } else {
      const base = toEditableHex(solid ?? '#888888');
      onChange({ ...resolvedStyle, color: { kind: 'gradient', stops: [base, base] } });
    }
  };

  const setStop = (index: number, hex: string) => {
    const next = [...stops];
    next[index] = hex;
    onChange({ ...resolvedStyle, color: { kind: 'gradient', stops: next } });
  };

  const addStop = () => {
    if (stops.length >= 6) return;
    onChange({ ...resolvedStyle, color: { kind: 'gradient', stops: [...stops, '#888888'] } });
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) return;
    onChange({
      ...resolvedStyle,
      color: { kind: 'gradient', stops: stops.filter((_, i) => i !== index) },
    });
  };

  const setSpeed = (speed: number) => onChange({ ...resolvedStyle, speed });
  const setIntensity = (intensity: number) => onChange({ ...resolvedStyle, intensity });

  return (
    <div
      data-testid={`activity-status-row-${status}`}
      className="flex flex-col gap-2 rounded-md border border-border p-2"
    >
      <div className="flex items-center gap-2">
        <GlowSwatch status={status} />
        <span className="flex-1 text-xs font-medium">{STATUS_LABELS[status]}</span>
        {HAS_STYLE_MODE_ELSEWHERE.has(status) ? (
          <span className="text-[10px] text-muted-foreground">Style set above</span>
        ) : null}
        <button
          type="button"
          data-testid={`activity-status-reset-${status}`}
          disabled={!hasOverride}
          onClick={onReset}
          className="h-6 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pl-8">
        <div role="radiogroup" aria-label={`${STATUS_LABELS[status]} colour kind`} className="flex gap-1">
          {(['solid', 'gradient'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => setKind(option)}
              className={`h-6 rounded-md border px-2 text-[11px] capitalize transition-colors ${
                kind === option
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {kind === 'solid' ? (
          <input
            type="color"
            aria-label={`${STATUS_LABELS[status]} colour`}
            value={toEditableHex(solid ?? '#888888')}
            onChange={(event) => onChange({ ...resolvedStyle, color: { kind: 'solid', color: event.target.value } })}
            className="h-6 w-10 cursor-pointer rounded border border-border bg-transparent p-0"
          />
        ) : (
          <div className="flex items-center gap-1">
            {stops.map((stopColor, index) => (
              <span key={index} className="flex items-center gap-0.5">
                <input
                  type="color"
                  aria-label={`${STATUS_LABELS[status]} stop ${index + 1}`}
                  value={toEditableHex(stopColor)}
                  onChange={(event) => setStop(index, event.target.value)}
                  className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                />
                {stops.length > 2 ? (
                  <button
                    type="button"
                    aria-label={`Remove ${STATUS_LABELS[status]} stop ${index + 1}`}
                    onClick={() => removeStop(index)}
                    className="h-5 w-5 rounded text-[11px] text-muted-foreground hover:bg-accent"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {stops.length < 6 ? (
              <button
                type="button"
                onClick={addStop}
                className="h-6 rounded-md border border-dashed border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent"
              >
                + Stop
              </button>
            ) : null}
          </div>
        )}

        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Speed
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={resolvedStyle.speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="w-16"
          />
        </label>

        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Intensity
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={resolvedStyle.intensity}
            onChange={(event) => setIntensity(Number(event.target.value))}
            className="w-16"
          />
        </label>
      </div>
    </div>
  );
}

/** One sample per surface the Activity glow reaches, per status — a card, a
 * graph node, a workflow node and a terminal row, laid out as a small grid
 * so every combination is visible at a glance rather than nine separate
 * mini-galleries. */
function PreviewStrip() {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[3.5rem_repeat(4,1fr)] items-center gap-2 text-[10px] text-muted-foreground">
        <span />
        <span className="flex items-center gap-1">
          <LuSquareKanban aria-hidden className="h-3 w-3" /> Card
        </span>
        <span className="flex items-center gap-1">
          <LuSparkles aria-hidden className="h-3 w-3" /> Graph node
        </span>
        <span className="flex items-center gap-1">
          <LuWorkflow aria-hidden className="h-3 w-3" /> Workflow node
        </span>
        <span className="flex items-center gap-1">
          <LuSquareTerminal aria-hidden className="h-3 w-3" /> Terminal row
        </span>
      </div>
      {ACTIVITY_STATUSES.map((status) => (
        <div key={status} className="grid grid-cols-[3.5rem_repeat(4,1fr)] items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{STATUS_LABELS[status]}</span>
          <div
            className="activity-glow h-8 rounded-md border border-border/60 bg-card"
            data-activity-status={status}
          />
          <div className="flex justify-start">
            <div
              className="activity-glow h-7 w-7 rounded-full border border-border/60 bg-card"
              data-activity-status={status}
            />
          </div>
          <div
            className="activity-glow h-8 rounded-md border border-border/60 bg-card"
            data-activity-status={status}
          />
          <div
            className="activity-glow h-6 rounded-md border border-border/60 bg-card"
            data-activity-status={status}
          />
        </div>
      ))}
    </div>
  );
}
