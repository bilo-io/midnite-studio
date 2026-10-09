import {
  clipFrames,
  invertSpritePatchOp,
  MEDIA_ROOT_DIR,
  mstudioFileUrl,
  SPRITE_BADGE_RULES,
  spriteFramePath,
  type SpriteFramesFile,
  type SpritePatchOp,
  type SpriteSheetSpec,
} from '@midnite/studio-shared';
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { LuFlipHorizontal2, LuRefreshCw, LuTrash2, LuUndo2, LuRedo2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { SPRITE_CHECKER } from './sprite-checker';
import type { SpriteRef } from './use-sprite';
import { useSpriteHistory, type ApplyOps } from './use-sprite-history';

/**
 * The frame strip under the previewer (Phase 106 Theme G): one 64 px thumbnail per frame of the
 * current clip and direction, with its Theme B badges. Every edit is one `patchFrames` call and,
 * except a re-roll, undoable.
 *
 * Keys on a focused frame: arrows nudge it 1 px (Shift: 4), `H` flips, Delete deletes, `R`
 * re-rolls, `Alt+←/→` moves it, and `,`/`.` move the focus (the arrows belong to the nudge, so the
 * roving focus takes the previewer's step keys). `Mod+Z` / `Mod+Shift+Z` undo and redo while the
 * strip has focus. Thumbnails can also be dragged to reorder.
 */
export type SpriteFrameStripProps = {
  repoId: string;
  target: SpriteRef;
  spec: SpriteSheetSpec;
  file: SpriteFramesFile;
  clip: string;
  dir: string;
  /** Cache-busts the thumbnails when the frames change on disk. */
  version: string;
  selected: number;
  onSelect: (index: number) => void;
  apply: ApplyOps;
  /** Edits are refused while a job runs. */
  busy?: boolean;
};

const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

export function SpriteFrameStrip({ repoId, target, spec, file, clip, dir, version, selected, onSelect, apply, busy = false }: SpriteFrameStripProps) {
  const clipSpec = spec.clips.find((c) => c.name === clip);
  const frames = clipSpec ? clipFrames(file, clipSpec, dir) : [];
  const history = useSpriteHistory(`${target.group}/${target.asset}`, apply);
  const [dragging, setDragging] = useState<number | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.min(selected, Math.max(0, frames.length - 1));

  const focus = (index: number) => {
    const next = Math.max(0, Math.min(frames.length - 1, index));
    onSelect(next);
    refs.current[next]?.focus();
  };

  /** One undoable edit: the inverse is worked out from the frames file as it is now. */
  const edit = (ops: SpritePatchOp[]) => {
    if (busy) return;
    const inverse = ops
      .map((op) => invertSpritePatchOp(op, file))
      .filter((op): op is SpritePatchOp => op !== null)
      .reverse();
    void history.run({ forward: ops, inverse });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const frame = frames[current];
    const key = e.key.toLowerCase();
    if (isMod(e) && key === 'z') {
      e.preventDefault();
      void (e.shiftKey ? history.redo() : history.undo());
      return;
    }
    if (e.key === ',' || e.key === '.') {
      e.preventDefault();
      focus(current + (e.key === ',' ? -1 : 1));
      return;
    }
    if (!frame || isMod(e)) return;
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = current + (e.key === 'ArrowLeft' ? -1 : 1);
      if (to < 0 || to >= frames.length) return;
      edit([{ op: 'move', key: frame.key, to }]);
      onSelect(to);
      return;
    }
    const step = e.shiftKey ? 4 : 1;
    const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = nudge[e.key];
    if (delta) {
      e.preventDefault();
      edit([{ op: 'nudge', key: frame.key, dx: delta[0], dy: delta[1] }]);
    } else if (key === 'h') {
      e.preventDefault();
      edit([{ op: 'flip', key: frame.key }]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      edit([{ op: 'delete', key: frame.key }]);
    } else if (key === 'r') {
      e.preventDefault();
      if (!busy) void apply([{ op: 'reroll', keys: [frame.key] }]);
    }
  };

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    const from = dragging;
    setDragging(null);
    const frame = from === null ? undefined : frames[from];
    if (!frame || from === to) return;
    edit([{ op: 'move', key: frame.key, to }]);
    onSelect(to);
  };

  if (frames.length === 0) {
    return <p className="px-1 text-[11px] text-muted-foreground">No frames in {clip} facing {dir}.</p>;
  }

  const thumbUrl = (n: number) =>
    `${mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/sprite/${target.group}/${target.asset}/${spriteFramePath(clip, dir, n)}`)}?v=${encodeURIComponent(version)}`;
  const frame = frames[current];

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">
          Frames · {clip} · {dir}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton icon={LuUndo2} label="Undo" size="sm" disabled={!history.canUndo || busy} onClick={() => void history.undo()} />
          <IconButton icon={LuRedo2} label="Redo" size="sm" disabled={!history.canRedo || busy} onClick={() => void history.redo()} />
          <IconButton icon={LuFlipHorizontal2} label="Flip frame" size="sm" disabled={!frame || busy} onClick={() => frame && edit([{ op: 'flip', key: frame.key }])} />
          <IconButton
            icon={LuRefreshCw}
            label="Re-roll frame"
            size="sm"
            disabled={!frame || busy}
            onClick={() => frame && void apply([{ op: 'reroll', keys: [frame.key] }])}
          />
          <IconButton icon={LuTrash2} label="Delete frame" size="sm" disabled={!frame || busy} onClick={() => frame && edit([{ op: 'delete', key: frame.key }])} />
        </div>
      </div>
      <div role="listbox" aria-label="Frames" aria-orientation="horizontal" className="flex gap-1.5 overflow-x-auto pb-1" onKeyDown={onKeyDown}>
        {frames.map((f, i) => {
          const active = i === current;
          return (
            <button
              key={f.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={`Frame ${f.n + 1}${f.meta.badges.length > 0 ? `, ${f.meta.badges.join(', ')}` : ''}`}
              tabIndex={active ? 0 : -1}
              draggable={!busy}
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, i)}
              onClick={() => onSelect(i)}
              data-frame={f.key}
              className={`flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-md border p-0.5 ${active ? 'border-primary bg-primary/10' : 'border-border'}`}
            >
              <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-sm" style={SPRITE_CHECKER}>
                <img
                  src={thumbUrl(f.n)}
                  alt=""
                  draggable={false}
                  className="max-h-16 max-w-16 [image-rendering:pixelated]"
                  style={f.meta.flipped ? { transform: 'scaleX(-1)' } : undefined}
                />
              </span>
              <span className="flex min-h-[14px] flex-wrap justify-center gap-0.5">
                <span className="text-[9px] tabular-nums text-muted-foreground">{String(f.n).padStart(3, '0')}</span>
                {f.meta.badges.map((b) => (
                  <span
                    key={b}
                    title={b === 'inconsistent' && f.meta.issues?.length ? `${SPRITE_BADGE_RULES[b]} ${f.meta.issues.join('; ')}` : SPRITE_BADGE_RULES[b]}
                    className="rounded-full bg-destructive/15 px-1 text-[9px] leading-[14px] text-destructive"
                  >
                    {b}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {frame && (frame.meta.anchorNudge[0] !== 0 || frame.meta.anchorNudge[1] !== 0) ? (
        <p className="text-[10px] tabular-nums text-muted-foreground">
          Nudged {frame.meta.anchorNudge[0]}, {frame.meta.anchorNudge[1]} px
        </p>
      ) : null}
    </div>
  );
}
