import type { LoopDefinition } from '@midnite/studio-shared';
import { LuCircleStop, LuPlay } from 'react-icons/lu';

/**
 * The controls above a loop's terminal: what the next run will be told, and
 * the one button that starts or stops it.
 *
 * Two shapes, not two components. Idle, it is the composer — a checkbox per
 * declared modifier plus a free-text extras field. Running, it collapses to a
 * slim strip: the checked modifiers as read-only chips, so the live run's
 * instructions stay legible without giving up the terminal's height, and the
 * glowing Stop.
 */
export function LoopComposer({
  loop,
  running,
  waiting,
  thinking,
  checked,
  extras,
  disabled,
  disabledReason,
  onToggle,
  onExtras,
  onStart,
  onStop,
}: {
  loop: LoopDefinition;
  running: boolean;
  waiting: boolean;
  /** The agent is working — what makes the glow breathe rather than sit still. */
  thinking: boolean;
  checked: Record<string, boolean>;
  extras: string;
  /** No repo selected — there is nowhere to run. */
  disabled: boolean;
  disabledReason: string | undefined;
  onToggle: (modifierId: string, on: boolean) => void;
  onExtras: (text: string) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const activeModifiers = loop.modifiers.filter((m) => checked[m.id]);

  return (
    <div className="shrink-0 border-b border-border px-2 py-2" data-testid={`loop-composer-${loop.id}`}>
      {running ? (
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {activeModifiers.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">Running with defaults</span>
            ) : (
              activeModifiers.map((modifier) => (
                <span
                  key={modifier.id}
                  title={modifier.promptFragment}
                  className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {modifier.label}
                </span>
              ))
            )}
          </div>
          <StartStopButton
            running
            waiting={waiting}
            thinking={thinking}
            disabled={false}
            onClick={onStop}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {loop.modifiers.length > 0 ? (
            <div className="flex flex-col gap-1">
              {loop.modifiers.map((modifier) => (
                <label
                  key={modifier.id}
                  title={modifier.promptFragment}
                  className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={checked[modifier.id] ?? false}
                    onChange={(event) => onToggle(modifier.id, event.target.checked)}
                    className="h-3 w-3 shrink-0 accent-primary"
                  />
                  <span className="truncate">{modifier.label}</span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={extras}
              spellCheck={false}
              placeholder="Extra instructions…"
              aria-label={`Extra instructions for ${loop.label}`}
              onChange={(event) => onExtras(event.target.value)}
              className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-[11px] outline-none focus-visible:border-primary"
            />
            <StartStopButton
              running={false}
              waiting={false}
              thinking={false}
              disabled={disabled}
              disabledReason={disabledReason}
              onClick={onStart}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One button in two states, rather than two buttons — the phase it reads is
 * derived from the session (`useLoopStatus`), so a loop that exits on its own
 * flips this back to Start with nothing else bookkeeping it.
 */
function StartStopButton({
  running,
  waiting,
  thinking,
  disabled,
  disabledReason,
  onClick,
}: {
  running: boolean;
  waiting: boolean;
  thinking: boolean;
  disabled: boolean;
  disabledReason?: string | undefined;
  onClick: () => void;
}) {
  /*
    Three states, not two. A waiting loop drops the rotation for one steady
    amber ring — the colour you can spot across four tabs. A thinking one
    breathes. A live-but-idle one keeps the rainbow ring without the pulse, so
    motion means "working" rather than merely "on".
  */
  const glow = !running
    ? ''
    : waiting
      ? 'loop-run-glow is-waiting'
      : thinking
        ? 'loop-run-glow is-thinking'
        : 'loop-run-glow';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      data-testid={running ? 'loop-stop' : 'loop-start'}
      data-running={running ? 'true' : undefined}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${glow} ${
        running
          ? 'text-foreground'
          : 'border border-border text-foreground hover:bg-accent'
      }`}
    >
      {running ? (
        <LuCircleStop aria-hidden className="h-3.5 w-3.5" />
      ) : (
        <LuPlay aria-hidden className="h-3.5 w-3.5" />
      )}
      {running ? 'Stop' : 'Start'}
    </button>
  );
}
