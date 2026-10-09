import { MEDIA_ROOT_DIR, mstudioFileUrl, SPRITE_REFERENCE_CHANGED, type SpriteFramesFile, type SpriteSheetSpec } from '@midnite/studio-shared';
import { useRef, useState } from 'react';
import { LuImagePlus, LuLock, LuRefreshCw } from 'react-icons/lu';

import type { SpriteRef } from './use-sprite';

const BUTTON = 'flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium disabled:opacity-50';
const PRIMARY = 'flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50';

export type ReferenceChange = { bytes: Uint8Array; name: string } | { approve: true; frames: 'keep' | 'mark' };

/**
 * Hand-drawn step 1 (Phase 106 Theme D): the character's reference. Generate a turnaround or attach
 * an image; it stays unlocked until **Approve**, and frames are refused until then. Approving a new
 * reference over frames drawn from the old one asks whether to keep them or mark them all for re-roll.
 */
export function SpriteReferenceCard({
  repoId,
  target,
  spec,
  frameCount,
  busy,
  onTurnaround,
  onChange,
}: {
  repoId: string;
  target: SpriteRef;
  spec: SpriteSheetSpec;
  frameCount: number;
  /** A job is running for this asset. */
  busy: boolean;
  onTurnaround: () => void;
  onChange: (change: ReferenceChange) => Promise<string | null>;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const reference = spec.reference?.kind === 'image' ? spec.reference : null;
  const src = reference
    ? `${mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/sprite/${target.group}/${target.asset}/${reference.file}`)}?v=${encodeURIComponent(spec.updatedAt ?? '')}`
    : null;
  const change = (c: ReferenceChange) => {
    setError(null);
    void onChange(c).then(setError);
  };

  return (
    <section aria-label="Reference" className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="sprite-reference">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">Reference</h3>
        {reference?.approved ? (
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <LuLock aria-hidden className="h-3 w-3" />
            Locked
          </span>
        ) : reference ? (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Awaiting approval</span>
        ) : null}
      </div>
      {src ? (
        <img src={src} alt="Reference turnaround" className="max-h-56 w-full rounded border border-border/60 bg-[repeating-conic-gradient(hsl(var(--muted))_0_25%,transparent_0_50%)] bg-[length:16px_16px] object-contain" />
      ) : (
        <p className="text-[11px] text-muted-foreground">No reference yet. Generate a turnaround (front, side and back) or attach an image of the character.</p>
      )}
      {reference && !reference.approved && frameCount > 0 ? (
        <div className="flex flex-col gap-1.5 rounded border border-border/60 bg-muted/40 p-2">
          <p className="text-[11px]">{SPRITE_REFERENCE_CHANGED}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} className={PRIMARY} onClick={() => change({ approve: true, frames: 'keep' })}>
              Keep
            </button>
            <button type="button" disabled={busy} className={BUTTON} onClick={() => change({ approve: true, frames: 'mark' })}>
              Mark all for re-roll
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {reference && !reference.approved && frameCount === 0 ? (
          <button type="button" disabled={busy} className={PRIMARY} onClick={() => change({ approve: true, frames: 'keep' })}>
            <LuLock aria-hidden className="h-3.5 w-3.5" />
            Approve
          </button>
        ) : null}
        <button type="button" disabled={busy} className={BUTTON} onClick={onTurnaround}>
          <LuRefreshCw aria-hidden className="h-3.5 w-3.5" />
          {reference ? 'Regenerate' : 'Generate turnaround'}
        </button>
        <button type="button" disabled={busy} className={BUTTON} onClick={() => file.current?.click()}>
          <LuImagePlus aria-hidden className="h-3.5 w-3.5" />
          Attach…
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Attach a reference image"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            if (!picked) return;
            void picked.arrayBuffer().then((buffer) => change({ bytes: new Uint8Array(buffer), name: picked.name }));
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Frames the consistency check flagged or could not check, with the vision model's issues as the tooltip. */
export function SpriteFlaggedFrames({ frames }: { frames: SpriteFramesFile }) {
  const flagged = Object.entries(frames.frames)
    .filter(([, meta]) => meta.badges.includes('inconsistent') || meta.badges.includes('unchecked'))
    .sort(([a], [b]) => a.localeCompare(b));
  if (flagged.length === 0) return null;
  return (
    <section aria-label="Flagged frames" className="flex flex-col gap-1" data-testid="sprite-flagged">
      <h3 className="text-xs font-semibold">Flagged frames</h3>
      <ul className="flex flex-wrap gap-1">
        {flagged.map(([key, meta]) => {
          const inconsistent = meta.badges.includes('inconsistent');
          const title = inconsistent ? (meta.issues?.length ? meta.issues.join('; ') : 'Does not match the reference.') : 'Not checked against the reference.';
          return (
            <li
              key={key}
              title={title}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${inconsistent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}
            >
              {key} · {inconsistent ? `inconsistent${meta.score !== undefined ? ` ${meta.score.toFixed(2)}` : ''}` : 'unchecked'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
