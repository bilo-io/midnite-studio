/**
 * The SF3D texture's PNG encoder. The codec itself moved to `main/media/png/png-codec.ts` (Phase 105,
 * which also decodes); this keeps SF3D's imports — `encodePng(rgba, width, height)` and `crc32` — as
 * they were.
 */
export { crc32, encodePngRgba8 as encodePng } from '../../png/png-codec';
