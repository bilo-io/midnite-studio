/**
 * What a parser learns about a clip file without decoding the motion: enough for the library's list, not
 * for playback (Theme D decodes in the renderer with three's own loaders).
 */
export type ClipMeta = {
  /** Seconds, or `null` when the file does not say (an exporter that omits the stack's range). */
  durationSec: number | null;
  /** Keys on the longest track, when the file says. */
  frameCount?: number;
  fps?: number;
  /** Bone/joint names as the file spells them (`mixamorig:Hips`). */
  boneNames: string[];
  /** A mesh and skin ride along with the motion. */
  hasSkin: boolean;
  /** The take, animation or sequence name the file calls its clip, when it has one. */
  takeName?: string;
  /** Things the importer understood only partly; shown beside the import result. */
  warnings: string[];
};

/** A file the parser cannot read at all; the import reports it as failed, not as a clip. */
export class ClipParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipParseError';
  }
}

/** A plausible frame rate from a key count over a duration, or undefined when it is not credible. */
export function fpsFrom(frameCount: number | undefined, durationSec: number | null): number | undefined {
  if (!frameCount || frameCount < 2 || !durationSec || durationSec <= 0) return undefined;
  const fps = (frameCount - 1) / durationSec;
  if (!Number.isFinite(fps) || fps < 1 || fps > 480) return undefined;
  return Math.round(fps * 100) / 100;
}
