import { deflateRawSync } from 'node:zlib';

import { GAME_ZIP_MAX_BYTES } from '@midnite/studio-shared';

import { crc32 } from '../media/png/png-codec';

/**
 * A small zip writer (Phase 107 Theme P) — local headers, a central directory and nothing else:
 * no zip64, no encryption, no directory entries. Each file is deflated (`deflateRawSync`) unless
 * that is no smaller, in which case it is stored. `crc32` is Phase 105's, from the PNG codec.
 * Names are UTF-8 (general-purpose bit 11), `/`-separated and relative.
 */
export type ZipEntry = { path: string; bytes: Uint8Array };

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const VERSION_NEEDED = 20;
const MAX_ENTRIES = 0xffff;

export class ZipTooLargeError extends Error {}

/** MS-DOS date and time; the zip format cannot say anything before 1980. */
export function dosDateTime(when: Date): { date: number; time: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
  };
}

export function isSafeZipPath(path: string): boolean {
  if (path.length === 0 || path.includes('\0') || path.includes('\\') || path.startsWith('/')) return false;
  return path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function writeZip(entries: readonly ZipEntry[], now: Date = new Date()): Buffer {
  if (entries.length > MAX_ENTRIES) throw new ZipTooLargeError('A zip holds at most 65535 files.');
  const { date, time } = dosDateTime(now);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (!isSafeZipPath(entry.path)) throw new Error(`Unsafe path in zip: ${entry.path}`);
    const name = Buffer.from(entry.path, 'utf8');
    const raw = Buffer.from(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);
    const deflated = raw.length === 0 ? raw : deflateRawSync(raw);
    const stored = raw.length === 0 || deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(raw) >>> 0;
    if (raw.length >= GAME_ZIP_MAX_BYTES || offset + body.length >= GAME_ZIP_MAX_BYTES) {
      throw new ZipTooLargeError('This game is too large to zip (4 GB limit).');
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    head.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, spec 2.0
    head.writeUInt16LE(VERSION_NEEDED, 6);
    head.writeUInt16LE(UTF8_FLAG, 8);
    head.writeUInt16LE(method, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // external attrs: a regular 0644 file
    head.writeUInt32LE(offset, 42);
    central.push(head, name);

    offset += local.length + name.length + body.length;
  }

  const centralBytes = Buffer.concat(central);
  if (offset + centralBytes.length >= GAME_ZIP_MAX_BYTES) throw new ZipTooLargeError('This game is too large to zip (4 GB limit).');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBytes, end]);
}
