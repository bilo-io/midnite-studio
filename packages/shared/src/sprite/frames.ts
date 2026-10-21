import {
  spriteDirections,
  spriteFrameKey,
  type SpriteClip,
  type SpriteFrameMeta,
  type SpriteFramesFile,
  type SpritePatchOp,
  type SpriteSheetSpec,
} from '../media-sprite';

/**
 * The frame set as the previewer, the frame strip and the packer see it (Phase 106 Theme G). One
 * rule set serves all three, so what plays is what ships:
 *
 * - **Directions** are the sheet's own plus `w` for a 1-direction side sheet — Theme D writes the
 *   west facing as a mirror (or draws it, for an asymmetric character).
 * - **Stale frames are left out.** A clip re-rendered shorter keeps its old higher-numbered PNGs
 *   until the next job prunes them ({@link staleFrameKeys}); nothing past `clip.frames` plays or packs.
 * - **Holes are allowed.** A deleted frame leaves its number unused; the sequence skips it.
 */
export type SheetFrame = { key: string; clip: string; dir: string; n: number; meta: SpriteFrameMeta };

/** Directions a sheet holds frames for, in sheet order: a 1-direction side sheet is `e` + `w`. */
export function spriteSheetDirections(spec: Pick<SpriteSheetSpec, 'directions' | 'targetPerspective'>): string[] {
  if (spec.directions === 1 && spec.targetPerspective === 'side') return ['e', 'w'];
  return [...spriteDirections(spec)];
}

const KEY = /^(.+)\/([a-z]{1,2})\/(\d{3})$/;

/** `idle/e/003` → `{clip: 'idle', dir: 'e', n: 3}`; `null` for anything else. */
export function parseSpriteFrameKey(key: string): { clip: string; dir: string; n: number } | null {
  const m = KEY.exec(key);
  return m ? { clip: m[1]!, dir: m[2]!, n: Number(m[3]) } : null;
}

/** The frames of one clip and direction, in play order (ascending `n`, past-the-clip frames dropped). */
export function clipFrames(file: SpriteFramesFile, clip: Pick<SpriteClip, 'name' | 'frames'>, dir: string): SheetFrame[] {
  const out: SheetFrame[] = [];
  for (const [key, meta] of Object.entries(file.frames)) {
    const parsed = parseSpriteFrameKey(key);
    if (!parsed || parsed.clip !== clip.name || parsed.dir !== dir || parsed.n >= clip.frames) continue;
    out.push({ key, ...parsed, meta });
  }
  return out.sort((a, b) => a.n - b.n);
}

/** Every frame the atlas packs, clip → direction → n, so each clip/direction tag is one contiguous run. */
export function sheetFrames(spec: Pick<SpriteSheetSpec, 'clips' | 'directions' | 'targetPerspective'>, file: SpriteFramesFile): SheetFrame[] {
  const dirs = spriteSheetDirections(spec);
  return spec.clips.flatMap((clip) => dirs.flatMap((dir) => clipFrames(file, clip, dir)));
}

/**
 * Frames on disk that no clip plays: numbered at or past their clip's `frames` (a shorter re-render),
 * or of a clip the sheet no longer has. With `clips`, only those clips are considered (a job prunes
 * what it regenerated).
 */
export function staleFrameKeys(spec: Pick<SpriteSheetSpec, 'clips'>, file: SpriteFramesFile, clips?: readonly string[]): string[] {
  const byName = new Map(spec.clips.map((c) => [c.name, c]));
  return Object.keys(file.frames).filter((key) => {
    const parsed = parseSpriteFrameKey(key);
    if (!parsed) return false;
    if (clips && !clips.includes(parsed.clip)) return false;
    const clip = byName.get(parsed.clip);
    return !clip || parsed.n >= clip.frames;
  });
}

/** The frame numbers present for `clip/dir`, ascending — the slots `move` reorders across. */
export function frameSlots(file: SpriteFramesFile, clip: string, dir: string): number[] {
  const out: number[] = [];
  for (const key of Object.keys(file.frames)) {
    const parsed = parseSpriteFrameKey(key);
    if (parsed && parsed.clip === clip && parsed.dir === dir) out.push(parsed.n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * A `move`'s renames: the frame at `key` goes to slot `to` and the frames between shift by one.
 * Slot `i` keeps its number (`slots[i]`), so holes stay where they were. Returns `[from, to]` frame
 * numbers for every frame whose number changes.
 */
export function moveRenames(slots: readonly number[], fromN: number, to: number): Array<[number, number]> {
  const from = slots.indexOf(fromN);
  if (from < 0) return [];
  const target = Math.max(0, Math.min(slots.length - 1, to));
  const order = [...slots];
  const [moved] = order.splice(from, 1);
  order.splice(target, 0, moved!);
  const renames: Array<[number, number]> = [];
  order.forEach((n, i) => {
    if (n !== slots[i]) renames.push([n, slots[i]!]);
  });
  return renames;
}

/**
 * The op that undoes `op`, given the frames file **before** it ran; `null` for a re-roll (a new
 * generation is not undoable).
 */
export function invertSpritePatchOp(op: SpritePatchOp, before: SpriteFramesFile): SpritePatchOp | null {
  switch (op.op) {
    case 'nudge':
      return { op: 'nudge', key: op.key, dx: -op.dx || 0, dy: -op.dy || 0 };
    case 'flip':
      return { op: 'flip', key: op.key };
    case 'delete':
      return { op: 'restore', key: op.key };
    case 'restore':
      return { op: 'delete', key: op.key };
    case 'move': {
      const parsed = parseSpriteFrameKey(op.key);
      if (!parsed) return null;
      const slots = frameSlots(before, parsed.clip, parsed.dir);
      const from = slots.indexOf(parsed.n);
      if (from < 0) return null;
      const target = Math.max(0, Math.min(slots.length - 1, op.to));
      return { op: 'move', key: spriteFrameKey(parsed.clip, parsed.dir, slots[target]!), to: from };
    }
    case 'reroll':
      return null;
  }
}
