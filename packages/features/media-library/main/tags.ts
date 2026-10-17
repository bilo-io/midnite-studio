import { open } from 'node:fs/promises';

/**
 * Embedded music tags — a small, bounded reader for the two formats a home library is mostly made of: an
 * MP3's ID3v2 tag (v2.2–v2.4) and a FLAC file's Vorbis comment and PICTURE blocks. The workspace has no
 * tag-reading dependency, and these two are simple, documented byte layouts; anything else (M4A atoms,
 * Ogg pages) falls back to the filename and folders in `classify.ts`.
 *
 * Bounded on purpose: a tag declares its own size, and a corrupt or hostile file can declare anything, so
 * nothing past {@link TAG_READ_CAP} is ever read, and a malformed tag answers `null` rather than throwing.
 */
export const TAG_READ_CAP = 16 * 1024 * 1024;

export type EmbeddedPicture = { mime: string; data: Uint8Array };

export type AudioTags = {
  title: string | null;
  artist: string | null;
  album: string | null;
  track: number | null;
  year: number | null;
  picture: EmbeddedPicture | null;
};

const empty = (): AudioTags => ({
  title: null,
  artist: null,
  album: null,
  track: null,
  year: null,
  picture: null,
});

async function readRange(path: string, position: number, length: number): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = new Uint8Array(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** The tags of one audio file, or null when it has none this reader understands (or cannot be read). */
export async function readAudioTags(path: string): Promise<AudioTags | null> {
  try {
    const head = await readRange(path, 0, 10);
    if (head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const size = syncsafe(head, 6);
      if (size <= 0 || size > TAG_READ_CAP) return null;
      return parseId3(head, await readRange(path, 10, size));
    }
    if (
      head.length >= 4 &&
      head[0] === 0x66 &&
      head[1] === 0x4c &&
      head[2] === 0x61 &&
      head[3] === 0x43
    ) {
      return await readFlac(path);
    }
    return null;
  } catch {
    return null;
  }
}

// --- ID3v2 -----------------------------------------------------------------------

const syncsafe = (b: Uint8Array, at: number): number =>
  ((b[at]! & 0x7f) << 21) |
  ((b[at + 1]! & 0x7f) << 14) |
  ((b[at + 2]! & 0x7f) << 7) |
  (b[at + 3]! & 0x7f);
const be32 = (b: Uint8Array, at: number): number =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const be24 = (b: Uint8Array, at: number): number => (b[at]! << 16) | (b[at + 1]! << 8) | b[at + 2]!;
const le32 = (b: Uint8Array, at: number): number =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

/** Undo ID3's unsynchronisation: every `FF 00` was written for a bare `FF`. */
function deunsync(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes[i]!);
    if (bytes[i] === 0xff && bytes[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

function decodeText(encoding: number, bytes: Uint8Array): string {
  let text: string;
  if (encoding === 1 || encoding === 2) {
    let le = encoding === 1;
    let body = bytes;
    if (encoding === 1 && bytes.length >= 2) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) body = bytes.subarray(2);
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        le = false;
        body = bytes.subarray(2);
      }
    }
    text = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body);
  } else if (encoding === 3) {
    text = new TextDecoder('utf-8').decode(bytes);
  } else {
    text = new TextDecoder('latin1').decode(bytes);
  }
  // A text frame may hold several NUL-separated values (v2.4); the first is the one shown.
  return (text.split('\0')[0] ?? '').trim();
}

/** Where a string terminated by NUL (one byte, or two for UTF-16) ends, from `at`. */
function terminator(bytes: Uint8Array, at: number, wide: boolean): number {
  if (!wide) {
    const end = bytes.indexOf(0, at);
    return end < 0 ? bytes.length : end;
  }
  for (let i = at; i + 1 < bytes.length; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
  return bytes.length;
}

const TEXT_FRAMES: Record<string, keyof Omit<AudioTags, 'picture'>> = {
  TIT2: 'title',
  TT2: 'title',
  TPE1: 'artist',
  TP1: 'artist',
  TALB: 'album',
  TAL: 'album',
  TRCK: 'track',
  TRK: 'track',
  TYER: 'year',
  TYE: 'year',
  TDRC: 'year',
};

function setTag(tags: AudioTags, field: keyof Omit<AudioTags, 'picture'>, value: string): void {
  if (value === '') return;
  if (field === 'track') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) tags.track = n;
  } else if (field === 'year') {
    const n = Number.parseInt(value.slice(0, 4), 10);
    if (Number.isFinite(n) && n > 1000) tags.year = n;
  } else {
    tags[field] = value;
  }
}

export function parseId3(header: Uint8Array, rawBody: Uint8Array): AudioTags | null {
  const major = header[3]!;
  if (major < 2 || major > 4) return null;
  const flags = header[5]!;
  const body = flags & 0x80 && major < 4 ? deunsync(rawBody) : rawBody;
  let at = 0;
  if (flags & 0x40 && major >= 3) {
    const extended = major === 4 ? syncsafe(body, 0) : be32(body, 0) + 4;
    if (extended > body.length) return null;
    at = extended;
  }
  const tags = empty();
  const idLength = major === 2 ? 3 : 4;
  const headerLength = major === 2 ? 6 : 10;
  while (at + headerLength <= body.length) {
    const id = new TextDecoder('latin1').decode(body.subarray(at, at + idLength));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const size =
      major === 2 ? be24(body, at + 3) : major === 4 ? syncsafe(body, at + 4) : be32(body, at + 4);
    const start = at + headerLength;
    const end = start + size;
    if (size <= 0 || end > body.length) break;
    const frame = body.subarray(start, end);
    const field = TEXT_FRAMES[id];
    if (field && frame.length > 1) setTag(tags, field, decodeText(frame[0]!, frame.subarray(1)));
    if ((id === 'APIC' || id === 'PIC') && tags.picture === null)
      tags.picture = parsePictureFrame(id, frame);
    at = end;
  }
  return tags;
}

function parsePictureFrame(id: string, frame: Uint8Array): EmbeddedPicture | null {
  if (frame.length < 4) return null;
  const encoding = frame[0]!;
  let at = 1;
  let mime: string;
  if (id === 'PIC') {
    // v2.2: a three-letter image format, not a MIME type.
    const format = new TextDecoder('latin1').decode(frame.subarray(1, 4)).toUpperCase();
    mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
    at = 4;
  } else {
    const mimeEnd = terminator(frame, at, false);
    mime =
      new TextDecoder('latin1').decode(frame.subarray(at, mimeEnd)).toLowerCase() || 'image/jpeg';
    at = mimeEnd + 1;
  }
  at += 1; // picture type
  const wide = encoding === 1 || encoding === 2;
  const descriptionEnd = terminator(frame, at, wide);
  at = descriptionEnd + (wide ? 2 : 1);
  if (at >= frame.length) return null;
  if (mime === 'jpg') mime = 'image/jpeg';
  if (!mime.startsWith('image/')) mime = `image/${mime}`;
  return { mime, data: frame.slice(at) };
}

// --- FLAC ------------------------------------------------------------------------

const VORBIS_FIELDS: Record<string, keyof Omit<AudioTags, 'picture'>> = {
  TITLE: 'title',
  ARTIST: 'artist',
  ALBUMARTIST: 'artist',
  ALBUM: 'album',
  TRACKNUMBER: 'track',
  DATE: 'year',
  YEAR: 'year',
};

async function readFlac(path: string): Promise<AudioTags | null> {
  const tags = empty();
  let position = 4;
  let total = 0;
  for (let guard = 0; guard < 128; guard++) {
    const blockHeader = await readRange(path, position, 4);
    if (blockHeader.length < 4) break;
    const last = (blockHeader[0]! & 0x80) !== 0;
    const type = blockHeader[0]! & 0x7f;
    const length = be24(blockHeader, 1);
    position += 4;
    total += length;
    if (total > TAG_READ_CAP) break;
    if (type === 4 || (type === 6 && tags.picture === null)) {
      const block = await readRange(path, position, length);
      if (type === 4) parseVorbisComment(block, tags);
      else tags.picture = parseFlacPicture(block);
    }
    position += length;
    if (last) break;
  }
  return tags;
}

export function parseVorbisComment(block: Uint8Array, tags: AudioTags): void {
  let at = 0;
  const vendor = le32(block, at);
  at += 4 + vendor;
  if (at + 4 > block.length) return;
  const count = le32(block, at);
  at += 4;
  const utf8 = new TextDecoder('utf-8');
  for (let i = 0; i < count && at + 4 <= block.length; i++) {
    const length = le32(block, at);
    at += 4;
    if (at + length > block.length) return;
    const entry = utf8.decode(block.subarray(at, at + length));
    at += length;
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    const field = VORBIS_FIELDS[entry.slice(0, eq).toUpperCase()];
    // ARTIST wins over ALBUMARTIST when both are present; the first of each field is the one kept.
    if (
      field &&
      (tags[field] === null ||
        (field === 'artist' && entry.slice(0, eq).toUpperCase() === 'ARTIST'))
    ) {
      setTag(tags, field, entry.slice(eq + 1).trim());
    }
  }
}

export function parseFlacPicture(block: Uint8Array): EmbeddedPicture | null {
  let at = 4; // picture type
  if (at + 4 > block.length) return null;
  const mimeLength = be32(block, at);
  at += 4;
  if (at + mimeLength + 4 > block.length) return null;
  const mime =
    new TextDecoder('latin1').decode(block.subarray(at, at + mimeLength)).toLowerCase() ||
    'image/jpeg';
  at += mimeLength;
  const descriptionLength = be32(block, at);
  at += 4 + descriptionLength + 16; // description, then width, height, depth, colours
  if (at + 4 > block.length) return null;
  const dataLength = be32(block, at);
  at += 4;
  if (at + dataLength > block.length || dataLength === 0) return null;
  return { mime, data: block.slice(at, at + dataLength) };
}
