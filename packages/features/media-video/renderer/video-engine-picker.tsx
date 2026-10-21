import { VIDEO_ENGINES, VIDEO_ENGINE_INFO, type VideoEngine } from '@midnite/studio-shared';

/**
 * Remotion | HyperFrames (Phase 99 Theme H) — a two-option radio group, used
 * where the choice has room to explain itself: Setup Video and Settings ▸
 * Media. The toolbar's compact form is `VideoEngineSelect` below.
 *
 * Plain radios rather than a custom widget: the choice is two named things the
 * user should read the blurb of, and a native radiogroup gives arrow-key
 * navigation and a screen-reader name for free.
 */
export function VideoEnginePicker({
  value,
  onChange,
  disabled = false,
  name = 'video-engine',
}: {
  value: VideoEngine;
  onChange: (engine: VideoEngine) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Video engine"
      className="grid w-full max-w-md gap-2 text-left sm:grid-cols-2"
    >
      {VIDEO_ENGINES.map((engine) => {
        const info = VIDEO_ENGINE_INFO[engine];
        const selected = value === engine;
        return (
          <label
            key={engine}
            data-testid={`video-engine-${engine}`}
            data-selected={selected}
            className={`flex cursor-pointer flex-col gap-1 rounded-md border p-2.5 text-xs ${
              selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <span className="flex items-center gap-2 font-medium text-foreground">
              <input
                type="radio"
                name={name}
                value={engine}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(engine)}
              />
              {info.label}
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">{info.blurb}</span>
          </label>
        );
      })}
    </div>
  );
}

/** The toolbar's compact switch — the same two engines in a native select. */
export function VideoEngineSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: VideoEngine;
  onChange: (engine: VideoEngine) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Video engine"
      data-testid="video-engine-select"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as VideoEngine)}
      className="h-7 rounded-md border border-border bg-card px-2 text-[11px] text-foreground disabled:opacity-60"
    >
      {VIDEO_ENGINES.map((engine) => (
        <option key={engine} value={engine}>
          {VIDEO_ENGINE_INFO[engine].label}
        </option>
      ))}
    </select>
  );
}
