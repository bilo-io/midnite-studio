/**
 * Synthesised media for the library's tests — tags are built byte by byte, so no fixture file is
 * committed and nothing is read from the user's own folders.
 */

const latin1 = (text: string): number[] => [...text].map((c) => c.charCodeAt(0) & 0xff);
const utf8 = (text: string): number[] => [...new TextEncoder().encode(text)];

const syncsafe = (n: number): number[] => [
  (n >> 21) & 0x7f,
  (n >> 14) & 0x7f,
  (n >> 7) & 0x7f,
  n & 0x7f,
];
const be32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const be24 = (n: number): number[] => [(n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];

/** A tiny "image" — the bytes are never decoded, only stored and served. */
export const FAKE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

export type Id3Fields = {
  title?: string;
  artist?: string;
  album?: string;
  track?: string;
  year?: string;
  picture?: Uint8Array;
};

/** An ID3v2.3 tag (UTF-8 text frames, an APIC), followed by a few bytes standing in for MPEG frames. */
export function id3v23(fields: Id3Fields): Uint8Array {
  const frames: number[] = [];
  const frame = (id: string, body: number[]) =>
    frames.push(...latin1(id), ...be32(body.length), 0, 0, ...body);
  const text = (id: string, value: string | undefined) => {
    if (value !== undefined) frame(id, [3, ...utf8(value)]);
  };
  text('TIT2', fields.title);
  text('TPE1', fields.artist);
  text('TALB', fields.album);
  text('TRCK', fields.track);
  text('TYER', fields.year);
  if (fields.picture)
    frame('APIC', [0, ...latin1('image/jpeg'), 0, 3, ...latin1('cover'), 0, ...fields.picture]);
  const padding = new Array(16).fill(0);
  const body = [...frames, ...padding];
  return Uint8Array.from([
    ...latin1('ID3'),
    3,
    0,
    0,
    ...syncsafe(body.length),
    ...body,
    0xff,
    0xfb,
    0x90,
    0x00,
  ]);
}

/** An ID3v2.4 tag with syncsafe frame sizes. */
export function id3v24(fields: Pick<Id3Fields, 'title' | 'artist'>): Uint8Array {
  const frames: number[] = [];
  const text = (id: string, value: string | undefined) => {
    if (value === undefined) return;
    const body = [3, ...utf8(value)];
    frames.push(...latin1(id), ...syncsafe(body.length), 0, 0, ...body);
  };
  text('TIT2', fields.title);
  text('TPE1', fields.artist);
  return Uint8Array.from([...latin1('ID3'), 4, 0, 0, ...syncsafe(frames.length), ...frames]);
}

/** A FLAC stream header: STREAMINFO, a Vorbis comment, optionally a PICTURE block. */
export function flac(comments: Record<string, string>, picture?: Uint8Array): Uint8Array {
  const vendor = utf8('test');
  const entries = Object.entries(comments).map(([k, v]) => utf8(`${k}=${v}`));
  const vorbis = [
    ...le32(vendor.length),
    ...vendor,
    ...le32(entries.length),
    ...entries.flatMap((e) => [...le32(e.length), ...e]),
  ];
  const blocks: number[][] = [[0, ...be24(34), ...new Array(34).fill(0)]];
  const pictureBlock = picture
    ? (() => {
        const mime = latin1('image/jpeg');
        return [
          ...be32(3),
          ...be32(mime.length),
          ...mime,
          ...be32(0),
          ...be32(1),
          ...be32(1),
          ...be32(24),
          ...be32(0),
          ...be32(picture.length),
          ...picture,
        ];
      })()
    : null;
  const rest: Array<[number, number[]]> = [[4, vorbis]];
  if (pictureBlock) rest.push([6, pictureBlock]);
  rest.forEach(([type, body], i) => {
    const last = i === rest.length - 1 ? 0x80 : 0;
    blocks.push([last | type, ...be24(body.length), ...body]);
  });
  return Uint8Array.from([...latin1('fLaC'), ...blocks.flat()]);
}
