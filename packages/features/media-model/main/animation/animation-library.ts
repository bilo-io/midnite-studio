import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { confineToRoot, joinWithin } from '@midnite/studio-runtime';
import {
  ANIMATION_FILES_DIR,
  ANIMATION_MANIFEST_FILE,
  ANIMATION_MAX_TAGS,
  AnimationClipSchema,
  animationSlug,
  type AnimationClip,
  type AnimationFormat,
  type AnimationPatch,
} from '@midnite/studio-shared';

/**
 * The global animation library's store (Phase 125 Theme A): a manifest of clips and the files beside it,
 * under one root the host injects (`<userData>/animation-library`). Nothing here knows about a repo.
 *
 * - **Content-addressed.** A clip's id is the first 12 hex digits of its sha256, and its file is
 *   `clips/<id>-<slug>.<ext>`. The same bytes added twice are one clip: the second add merges its tags into
 *   the first and writes nothing.
 * - **One writer.** Every mutation runs through one queue, so two imports racing cannot lose a clip, and the
 *   manifest is written to a temp file then renamed, so a crash leaves the old one whole.
 * - **A bad manifest does not stop the app.** An unreadable one is moved aside to
 *   `animations.manifest.corrupt-<ts>.json` and the library starts empty; one malformed or path-escaping entry
 *   is dropped and the rest load.
 */

export type NewClip = {
  bytes: Uint8Array;
  format: AnimationFormat;
  name: string;
  tags: string[];
  durationSec: number | null;
  frameCount?: number;
  fps?: number;
  boneCount?: number;
  hasSkin: boolean;
  source: AnimationClip['source'];
  site?: string;
  licence: AnimationClip['licence'];
  author?: string;
  originalUrl?: string;
};

export type AddResult = { clip: AnimationClip; duplicate: boolean };

export type AnimationLibraryDeps = {
  /** The library folder; created on first write. */
  root: string;
  now?: () => number;
  log?: (line: string) => void;
};

export type AnimationLibrary = {
  list: () => Promise<AnimationClip[]>;
  get: (id: string) => Promise<AnimationClip | null>;
  add: (input: NewClip) => Promise<AddResult>;
  update: (id: string, patch: AnimationPatch) => Promise<AnimationClip | null>;
  remove: (id: string) => Promise<boolean>;
  /** The clip and its bytes; null when the id is unknown or its file is gone. */
  read: (id: string) => Promise<{ clip: AnimationClip; bytes: Uint8Array } | null>;
};

export function createAnimationLibrary(deps: AnimationLibraryDeps): AnimationLibrary {
  const { root } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => undefined);
  // One writer: every op waits for the one before it, whether that one succeeded or not.
  let tail: Promise<unknown> = Promise.resolve();
  const queue = {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const manifestPath = join(root, ANIMATION_MANIFEST_FILE);
  let loaded: AnimationClip[] | null = null;

  const fileOf = (clip: AnimationClip): string | null => joinWithin(root, clip.file);

  async function quarantine(reason: string): Promise<void> {
    const aside = join(root, `animations.manifest.corrupt-${now()}.json`);
    log(`animation library: ${reason}; the old manifest was moved to ${aside}`);
    await rename(manifestPath, aside).catch(() => undefined);
  }

  async function load(): Promise<AnimationClip[]> {
    if (loaded) return loaded;
    let text: string;
    try {
      text = await readFile(manifestPath, 'utf8');
    } catch {
      loaded = [];
      return loaded;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      await quarantine('the manifest is not valid JSON');
      loaded = [];
      return loaded;
    }
    const entries = (raw as { version?: unknown; clips?: unknown } | null) ?? {};
    if (typeof raw !== 'object' || raw === null || entries.version !== 1 || !Array.isArray(entries.clips)) {
      await quarantine('the manifest is not a version 1 library');
      loaded = [];
      return loaded;
    }
    const clips: AnimationClip[] = [];
    const seen = new Set<string>();
    for (const entry of entries.clips) {
      const parsed = AnimationClipSchema.safeParse(entry);
      if (!parsed.success) {
        log('animation library: dropped a malformed clip entry');
        continue;
      }
      const clip = parsed.data;
      if (seen.has(clip.id) || !clip.file.startsWith(`${ANIMATION_FILES_DIR}/`) || fileOf(clip) === null) {
        log(`animation library: dropped clip ${clip.id} (duplicate id or a file outside the library)`);
        continue;
      }
      seen.add(clip.id);
      clips.push(clip);
    }
    loaded = clips;
    return loaded;
  }

  async function save(clips: AnimationClip[]): Promise<void> {
    await mkdir(root, { recursive: true });
    const temp = `${manifestPath}.${process.pid}.${now()}.tmp`;
    await writeFile(temp, `${JSON.stringify({ version: 1, clips }, null, 2)}\n`, 'utf8');
    await rename(temp, manifestPath);
  }

  const mutate = <T>(task: (clips: AnimationClip[]) => Promise<T>): Promise<T> =>
    queue.run(async () => {
      const clips = await load();
      return task(clips);
    });

  return {
    list: () => queue.run(async () => [...(await load())]),
    get: (id) => queue.run(async () => (await load()).find((c) => c.id === id) ?? null),

    add: (input) =>
      mutate(async (clips) => {
        const sha256 = createHash('sha256').update(input.bytes).digest('hex');
        const id = sha256.slice(0, 12);
        const existing = clips.find((c) => c.id === id);
        if (existing) {
          const merged = [...new Set([...existing.tags, ...input.tags])].slice(0, ANIMATION_MAX_TAGS);
          if (merged.length === existing.tags.length) return { clip: existing, duplicate: true };
          const next = { ...existing, tags: merged };
          await save(clips.map((c) => (c.id === id ? next : c)));
          clips[clips.indexOf(existing)] = next;
          return { clip: next, duplicate: true };
        }
        const file = `${ANIMATION_FILES_DIR}/${id}-${animationSlug(input.name)}.${input.format}`;
        const abs = joinWithin(root, file);
        if (!abs) throw new Error('The clip file would sit outside the library');
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, input.bytes);
        const clip = AnimationClipSchema.parse({
          id,
          name: input.name,
          tags: input.tags.slice(0, ANIMATION_MAX_TAGS),
          durationSec: input.durationSec,
          frameCount: input.frameCount,
          fps: input.fps,
          boneCount: input.boneCount,
          hasSkin: input.hasSkin,
          format: input.format,
          source: input.source,
          site: input.site,
          licence: input.licence,
          author: input.author ?? '',
          originalUrl: input.originalUrl,
          sha256,
          file,
          sizeBytes: input.bytes.byteLength,
          addedAt: now(),
        });
        try {
          await save([...clips, clip]);
        } catch (error) {
          await rm(abs, { force: true }).catch(() => undefined);
          throw error;
        }
        clips.push(clip);
        return { clip, duplicate: false };
      }),

    update: (id, patch) =>
      mutate(async (clips) => {
        const at = clips.findIndex((c) => c.id === id);
        if (at < 0) return null;
        const current = clips[at]!;
        const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        const next = AnimationClipSchema.parse({ ...current, ...defined, tags: patch.tags ? [...new Set(patch.tags)] : current.tags });
        const copy = clips.map((c, i) => (i === at ? next : c));
        await save(copy);
        clips[at] = next;
        return next;
      }),

    remove: (id) =>
      mutate(async (clips) => {
        const at = clips.findIndex((c) => c.id === id);
        if (at < 0) return false;
        const clip = clips[at]!;
        const copy = clips.filter((c) => c.id !== id);
        await save(copy);
        clips.splice(at, 1);
        const abs = fileOf(clip);
        if (abs) await rm(abs, { force: true }).catch(() => undefined);
        return true;
      }),

    read: (id) =>
      queue.run(async () => {
        const clip = (await load()).find((c) => c.id === id);
        // The symlink half of the jail too: a link planted under `clips/` cannot read outside the library.
        const abs = clip ? await confineToRoot(root, clip.file) : null;
        if (!clip || !abs) return null;
        try {
          return { clip, bytes: await readFile(abs) };
        } catch {
          return null;
        }
      }),
  };
}
