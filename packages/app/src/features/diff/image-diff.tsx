import { useState } from 'react';

import type { ImageDiffSources, ImageSide } from './image-sources';

/**
 * The image viewer that stands in for a diff git will not produce.
 *
 * `git diff` says "Binary files differ" for a PNG and stops, so the pane used
 * to print that sentence and nothing else — true, and useless for the one
 * question the reader has: what changed in the picture. This shows both
 * revisions instead, and gives them three ways to be compared, because no
 * single one answers everything: two-up for "what is it now", swipe for
 * geometry (a shifted element lines up or it doesn't), onion for tone and
 * colour, where a slow fade shows a shift that side-by-side hides.
 *
 * Bytes come from `mgit-file://` — see `image-sources.ts` for the revision
 * pairing and `fs-protocol.ts` for the jail. Nothing here fetches; the browser
 * does, which is what keeps a 20 MB PNG off the IPC channel and out of React
 * state.
 */

type Mode = 'two-up' | 'swipe' | 'onion';

const MODES: readonly { id: Mode; label: string; hint: string }[] = [
  { id: 'two-up', label: 'Two-up', hint: 'Both revisions side by side' },
  { id: 'swipe', label: 'Swipe', hint: 'Drag the divider across one frame' },
  { id: 'onion', label: 'Onion', hint: 'Fade the new revision over the old' },
];

/**
 * A checkerboard, so transparency reads as transparency.
 *
 * Without it a PNG with an alpha channel sits on the pane background and an
 * added transparent region looks like a solid dark shape — the exact detail an
 * image diff exists to show.
 */
const CHECKS =
  'repeating-conic-gradient(rgb(255 255 255 / 0.06) 0% 25%, transparent 0% 50%) 50% / 16px 16px';

export function ImageDiff({
  sources,
  inline = false,
}: {
  sources: ImageDiffSources;
  /** In the accordion the viewer sits in page flow, so it cannot claim `flex-1`. */
  inline?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('two-up');
  /** 0–100. Swipe reveal position, and onion opacity, share the slider. */
  const [position, setPosition] = useState(50);
  const [dims, setDims] = useState<{ before?: Dimensions; after?: Dimensions }>({});

  const { before, after } = sources;
  const both = before !== null && after !== null;
  // A one-sided change has nothing to compare, so the mode strip and the slider
  // would both be controls that do nothing.
  const effective: Mode = both ? mode : 'two-up';

  const frame = inline ? 'h-[420px]' : 'min-h-0 flex-1';

  return (
    <div
      className={`flex ${inline ? '' : 'h-full min-h-0'} flex-col`}
      data-testid="image-diff"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {describeChange(before, after, dims)}
        </span>

        {both ? (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              {MODES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  title={entry.hint}
                  aria-pressed={effective === entry.id}
                  onClick={() => setMode(entry.id)}
                  className={`px-2 py-0.5 text-[10px] transition-colors ${
                    effective === entry.id
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            {effective === 'two-up' ? null : (
              <input
                type="range"
                min={0}
                max={100}
                value={position}
                onChange={(event) => setPosition(Number(event.target.value))}
                aria-label={effective === 'swipe' ? 'Swipe position' : 'New revision opacity'}
                className="w-28 accent-primary"
              />
            )}
          </div>
        ) : null}
      </div>

      {effective === 'two-up' ? (
        <div className={`flex ${frame} min-w-0 gap-2 overflow-auto p-2`}>
          {before ? (
            <Pane side={before} kind="before" onMeasure={(d) => setDims((s) => ({ ...s, before: d }))} />
          ) : null}
          {after ? (
            <Pane side={after} kind="after" onMeasure={(d) => setDims((s) => ({ ...s, after: d }))} />
          ) : null}
        </div>
      ) : (
        /*
          One frame, both images stacked and centred, so a pixel in the old
          revision sits under the same pixel in the new one. `object-contain`
          keeps each whole; the two only align exactly when the dimensions
          match, and when they don't, that mismatch is itself the finding —
          which the header states in numbers.
        */
        <div className={`flex ${frame} items-center justify-center p-2`}>
          <div className="relative h-full w-full" style={{ background: CHECKS }}>
            <img
              src={before!.url}
              alt={`${before!.label} revision`}
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(event) =>
                setDims((s) => ({
                  ...s,
                  before: {
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  },
                }))
              }
            />
            <img
              src={after!.url}
              alt={`${after!.label} revision`}
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(event) =>
                setDims((s) => ({
                  ...s,
                  after: {
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  },
                }))
              }
              style={
                effective === 'swipe'
                  ? { clipPath: `inset(0 0 0 ${position}%)` }
                  : { opacity: position / 100 }
              }
            />
            {effective === 'swipe' ? (
              // The divider is decoration over the clip edge; the range input in
              // the header is the control, so this works from the keyboard too.
              <div
                aria-hidden
                className="absolute inset-y-0 w-px bg-primary/70"
                style={{ left: `${position}%` }}
              />
            ) : null}
            <Legend before={before!} after={after!} mode={effective} />
          </div>
        </div>
      )}
    </div>
  );
}

type Dimensions = { width: number; height: number };

function Pane({
  side,
  kind,
  onMeasure,
}: {
  side: ImageSide;
  kind: 'before' | 'after';
  onMeasure: (dims: Dimensions) => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className="flex min-h-0 min-w-0 flex-1 flex-col gap-1" data-testid={`image-${kind}`}>
      <figcaption className="flex shrink-0 items-baseline gap-1.5 text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wide">{kind}</span>
        <span className="font-mono">{side.label}</span>
      </figcaption>
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded border border-border/60"
        style={{ background: CHECKS }}
      >
        {failed ? (
          <Unavailable />
        ) : (
          <img
            src={side.url}
            alt={`${side.label} revision`}
            className="max-h-full max-w-full object-contain"
            onLoad={(event) =>
              onMeasure({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </figure>
  );
}

/**
 * Which image is which, in the overlay modes.
 *
 * Without it "swipe" is two pictures and no way to tell which side of the
 * divider is the old one.
 */
function Legend({
  before,
  after,
  mode,
}: {
  before: ImageSide;
  after: ImageSide;
  mode: Mode;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-2 py-1 font-mono text-[10px] text-muted-foreground">
      <span>{mode === 'swipe' ? before.label : `${before.label} (under)`}</span>
      <span>{mode === 'swipe' ? after.label : `${after.label} (over)`}</span>
    </div>
  );
}

function Unavailable() {
  return (
    <p className="p-4 text-center text-[11px] text-muted-foreground">
      This revision&apos;s image could not be read — the object may be missing from this
      checkout, or larger than the viewer will load.
    </p>
  );
}

/**
 * The one-line summary above the frame: what happened, and — once both sides
 * have loaded — the dimensions, which is the change a picture makes hardest to
 * see and a number makes obvious.
 */
function describeChange(
  before: ImageSide | null,
  after: ImageSide | null,
  dims: { before?: Dimensions; after?: Dimensions },
): string {
  if (before === null) return `Image added${size(dims.after)}`;
  if (after === null) return `Image deleted${size(dims.before)}`;
  const from = dims.before;
  const to = dims.after;
  if (!from || !to) return `Image changed · ${before.label} → ${after.label}`;
  const same = from.width === to.width && from.height === to.height;
  return same
    ? `Image changed · ${to.width}×${to.height}`
    : `Image changed · ${from.width}×${from.height} → ${to.width}×${to.height}`;
}

const size = (dims: Dimensions | undefined): string =>
  dims ? ` · ${dims.width}×${dims.height}` : '';
