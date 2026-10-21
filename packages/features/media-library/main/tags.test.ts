// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readAudioTags } from './tags';
import { FAKE_JPEG, flac, id3v23, id3v24 } from './test-fixtures';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlib-tags-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const fixture = async (name: string, bytes: Uint8Array) => {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
};

describe('readAudioTags', () => {
  it('reads an ID3v2.3 tag and its cover', async () => {
    const path = await fixture(
      'a.mp3',
      id3v23({
        title: 'Joga',
        artist: 'Björk',
        album: 'Homogenic',
        track: '3/10',
        year: '1997',
        picture: FAKE_JPEG,
      }),
    );
    const tags = await readAudioTags(path);
    expect(tags).toMatchObject({
      title: 'Joga',
      artist: 'Björk',
      album: 'Homogenic',
      track: 3,
      year: 1997,
    });
    expect(tags?.picture?.mime).toBe('image/jpeg');
    expect([...(tags?.picture?.data ?? [])]).toEqual([...FAKE_JPEG]);
  });

  it('reads an ID3v2.4 tag (syncsafe frame sizes)', async () => {
    const path = await fixture('b.mp3', id3v24({ title: 'Teardrop', artist: 'Massive Attack' }));
    expect(await readAudioTags(path)).toMatchObject({
      title: 'Teardrop',
      artist: 'Massive Attack',
      picture: null,
    });
  });

  it('reads a FLAC Vorbis comment and PICTURE block', async () => {
    const path = await fixture(
      'c.flac',
      flac(
        {
          TITLE: 'Hyperballad',
          ARTIST: 'Björk',
          ALBUM: 'Post',
          TRACKNUMBER: '7',
          DATE: '1995-06-13',
        },
        FAKE_JPEG,
      ),
    );
    const tags = await readAudioTags(path);
    expect(tags).toMatchObject({
      title: 'Hyperballad',
      artist: 'Björk',
      album: 'Post',
      track: 7,
      year: 1995,
    });
    expect([...(tags?.picture?.data ?? [])]).toEqual([...FAKE_JPEG]);
  });

  it('answers null for untagged, unreadable or hostile files rather than throwing', async () => {
    expect(
      await readAudioTags(
        await fixture('d.mp3', Uint8Array.from([0xff, 0xfb, 0x90, 0, 1, 2, 3, 4, 5, 6, 7])),
      ),
    ).toBeNull();
    expect(await readAudioTags(join(dir, 'missing.mp3'))).toBeNull();
    // A tag that declares far more than the file holds: what is there is parsed, nothing past it.
    const lying = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f]);
    expect(await readAudioTags(await fixture('e.mp3', lying))).toBeNull();
    const truncated = id3v23({ title: 'Cut' }).subarray(0, 18);
    expect((await readAudioTags(await fixture('f.mp3', truncated)))?.title ?? null).toBeNull();
  });
});
