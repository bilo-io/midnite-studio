import { ClipParseError, type ClipMeta } from './clip-meta';

/**
 * BVH (Biovision hierarchy) metadata for Theme B — CMU mocap and most free motion-capture packs. Only the
 * header is read: the `HIERARCHY` joints, then `Frames:` and `Frame Time:` after `MOTION`. A joint's channels
 * and the frame data below them are not parsed.
 */
export function parseBvh(bytes: Uint8Array): ClipMeta {
  // The header sits at the top; a long capture's frame data is megabytes the metadata never needs.
  const motionAt = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).indexOf('MOTION');
  const text = Buffer.from(bytes.subarray(0, motionAt >= 0 ? Math.min(bytes.length, motionAt + 512) : Math.min(bytes.length, 64 * 1024))).toString('utf8');
  if (!/^\s*HIERARCHY\b/.test(text)) throw new ClipParseError('This is not a BVH file');
  if (motionAt < 0) throw new ClipParseError('This BVH file has no MOTION section');

  const header = text.slice(0, text.indexOf('MOTION'));
  const boneNames = [...header.matchAll(/^\s*(?:ROOT|JOINT)\s+(\S+)/gm)].map((m) => m[1] ?? '').filter(Boolean);
  const frames = Number(/Frames:\s*(\d+)/.exec(text)?.[1]);
  const frameTime = Number(/Frame\s+Time:\s*([0-9.eE+-]+)/.exec(text)?.[1]);
  if (boneNames.length === 0) throw new ClipParseError('This BVH file has no joints');
  if (!Number.isFinite(frames) || !Number.isFinite(frameTime) || frameTime <= 0) throw new ClipParseError('This BVH file has no readable frame count or frame time');

  const fps = Math.round((1 / frameTime) * 100) / 100;
  return {
    durationSec: frames * frameTime,
    frameCount: frames,
    fps: fps >= 1 && fps <= 480 ? fps : undefined,
    boneNames,
    hasSkin: false,
    warnings: [],
  };
}
