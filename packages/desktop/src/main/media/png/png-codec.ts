// Moved to the runtime (Phase 113 Theme S) so a feature's main half can decode and encode PNGs;
// this re-export keeps the desktop's existing importers on their old path.
export {
  crc32,
  decodePng,
  encodePngGrey16,
  encodePngGrey8,
  encodePngRgba8,
  PNG_DAMAGED,
  PNG_INTERLACED,
  PNG_LOW_BIT_DEPTH,
  type DecodeResult,
} from '@midnite/studio-runtime';
