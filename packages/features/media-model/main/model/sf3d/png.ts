/**
 * The SF3D texture's PNG encoder. The codec itself lives in the runtime's media kernel (Phase 113 Theme S;
 * it also decodes); this keeps SF3D's imports — `encodePng(rgba, width, height)` and `crc32` — as they were.
 */
export { crc32, encodePngRgba8 as encodePng } from '@midnite/studio-runtime';
