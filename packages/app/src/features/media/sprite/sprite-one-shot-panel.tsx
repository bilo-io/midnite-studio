import {
  handDrawnProvider,
  imageModelSupportsReference,
  imageProviderInfo,
  imageReferenceUnsupportedReason,
  MEDIA_ROOT_DIR,
  mstudioFileUrl,
  oneShotVerdict,
  spriteFrameKey,
  type SpriteFramesFile,
  type SpriteSheetSpec,
} from '@midnite/studio-shared';
import { useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuPencil } from 'react-icons/lu';

import type { SpriteRef } from './use-sprite';

/** Where a one-shot job keeps the sheet it was given (`main/media/sprite/one-shot.ts`). */
export const ONE_SHOT_SHEET_PATH = 'reference/one-shot-sheet.png';

/** Why one-shot cannot hand a clip to Hand-drawn with this provider, or `null`. */
export function handOffBlocker(spec: Pick<SpriteSheetSpec, 'provider' | 'model'>): string | null {
  const { provider, model } = handDrawnProvider(spec);
  return imageModelSupportsReference(provider, model) ? null : imageReferenceUnsupportedReason(provider === 'gemini' ? 'Imagen' : imageProviderInfo(provider).label);
}

/**
 * Phase 106 Theme F: what a one-shot sheet came back as. The **grid preview** draws the sheet the
 * provider returned with the cells grid detection found over it, the **verdict** says per row whether
 * its frames passed ("row 3, attack: 2 of 6 frames clipped"), and a failing row can be handed to
 * Hand-drawn: frame 1 of that row becomes the approved reference and only that clip is redrawn.
 */
export function SpriteOneShotPanel({
  repoId,
  target,
  spec,
  frames,
  busy,
  onHandOff,
}: {
  repoId: string;
  target: SpriteRef;
  spec: SpriteSheetSpec;
  frames: SpriteFramesFile;
  busy: boolean;
  /** Frame `000` of the row becomes the approved reference, then a hand-drawn job redraws the clip. */
  onHandOff: (row: { clip: string; dir: string }) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const shot = spec.oneShot;
  const verdict = oneShotVerdict(spec, frames);
  if (!shot || !verdict) return null;
  const blocker = handOffBlocker(spec);
  const src = `${mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/sprite/${target.group}/${target.asset}/${ONE_SHOT_SHEET_PATH}`)}?v=${encodeURIComponent(spec.updatedAt ?? '')}`;
  const size = shot.image;
  const detected = shot.detected;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
    <section aria-label="One-shot sheet" className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="sprite-one-shot">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">One-shot sheet</h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          asked {shot.grid.columns} × {shot.grid.rows} at {shot.aspect}
          {detected ? `, found ${detected.columns.length} × ${detected.rows.length}` : ''} · prompt v{shot.promptVersion}
        </span>
      </div>
      {size ? (
        <div className="relative w-full overflow-hidden rounded border border-border/60 bg-[repeating-conic-gradient(hsl(var(--muted))_0_25%,transparent_0_50%)] bg-[length:16px_16px]" style={{ aspectRatio: `${size.width} / ${size.height}` }} data-testid="one-shot-grid">
          <img src={src} alt="The generated sheet" className="absolute inset-0 h-full w-full object-fill [image-rendering:pixelated]" />
          {detected?.rows.flatMap(([y0, y1], r) =>
            detected.columns.map(([x0, x1], c) => (
              <div
                key={`${r}:${c}`}
                aria-hidden
                className={`absolute border ${verdict.sheet ? 'border-destructive/80' : 'border-emerald-400/90'}`}
                style={{ left: pct(x0, size.width), top: pct(y0, size.height), width: pct(x1 - x0, size.width), height: pct(y1 - y0, size.height) }}
              />
            )),
          )}
        </div>
      ) : null}
      {verdict.sheet ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          {verdict.sheet}
        </p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Verdict">
          {verdict.rows.map((row) => {
            const hasFirst = frames.frames[spriteFrameKey(row.clip, row.dir, 0)] !== undefined;
            const reason = busy ? 'A job is running.' : (blocker ?? (hasFirst ? null : 'Frame 1 of this row is missing.'));
            return (
              <li key={`${row.clip}/${row.dir}`} className="flex items-center gap-2 text-[11px]">
                {row.ok ? <LuCircleCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <LuCircleAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                <span className={row.ok ? 'text-muted-foreground' : 'text-foreground'}>{row.summary}</span>
                {row.ok ? null : (
                  <button
                    type="button"
                    disabled={reason !== null}
                    title={reason ?? 'Frame 1 of this row becomes the locked reference; the clip is redrawn frame by frame.'}
                    onClick={() => {
                      setError(null);
                      void onHandOff(row).then(setError);
                    }}
                    className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium disabled:opacity-50"
                  >
                    <LuPencil aria-hidden className="h-3 w-3" />
                    Regenerate this clip with Hand-drawn
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
