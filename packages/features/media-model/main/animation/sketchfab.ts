import {
  ANIMATION_MAX_FILE_BYTES,
  SKETCHFAB_LICENCES,
  SKETCHFAB_LICENCE_SLUGS,
  type SketchfabLicence,
  type SketchfabResult,
  type SketchfabSearchResult,
} from '@midnite/studio-shared';
import { z } from 'zod';

/**
 * Sketchfab's official Data API v3 (Phase 125 Theme E), with the user's own token (BYOK — there is no default).
 *
 * - **The token stays here.** `readToken` is injected by the host (the vault); it is read per request, held in
 *   no field, and put in exactly one place: the `Authorization` header of a request whose URL is
 *   `https://api.sketchfab.com/…`. The signed file URL Sketchfab hands back is fetched with no credentials, and
 *   no error, log line or result carries the token.
 * - **No scraping.** Search, model detail and the download link are API calls; the file is the GLB Sketchfab's
 *   own `/download` endpoint offers.
 * - **Bounded.** Every request has a timeout and an abort signal; a file is capped at
 *   {@link ANIMATION_MAX_FILE_BYTES}, by its declared size first and by the bytes actually read after.
 */

export const SKETCHFAB_API_ORIGIN = 'https://api.sketchfab.com';
const REQUEST_TIMEOUT_MS = 20_000;
const FILE_TIMEOUT_MS = 120_000;
/** Hosts a signed download URL may sit on; anything else is refused rather than fetched. */
const FILE_HOST = /(^|\.)(amazonaws\.com|sketchfab\.com)$/i;

export type SketchfabErrorKind = 'no-token' | 'unauthorized' | 'forbidden' | 'not-found' | 'rate-limited' | 'oversize' | 'timeout' | 'cancelled' | 'network' | 'bad-response' | 'unsupported';

export class SketchfabError extends Error {
  constructor(
    readonly kind: SketchfabErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SketchfabError';
  }
}

export type SketchfabDeps = {
  /** The user's token from the vault, or null when unset. Never logged, never returned. */
  readToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  fileTimeoutMs?: number;
  maxBytes?: number;
};

export type SketchfabModel = {
  uid: string;
  name: string;
  author: string;
  licence: SketchfabLicence;
  viewUrl: string;
  bytes: Uint8Array;
};

export type SketchfabClient = {
  hasToken: () => Promise<boolean>;
  search: (req: { q: string; licences: readonly SketchfabLicence[]; cursor?: string }, signal?: AbortSignal) => Promise<SketchfabSearchResult>;
  download: (uid: string, signal?: AbortSignal) => Promise<SketchfabModel>;
};

const LicenceObject = z.object({ slug: z.string().optional(), label: z.string().optional() }).passthrough();
const Thumbnails = z.object({ images: z.array(z.object({ url: z.string(), width: z.number().optional() }).passthrough()).default([]) }).passthrough();
const ModelBase = z
  .object({
    uid: z.string(),
    name: z.string().default('Untitled'),
    license: LicenceObject.nullish(),
    user: z.object({ displayName: z.string().nullish(), username: z.string().nullish() }).passthrough().nullish(),
    viewerUrl: z.string().optional(),
    thumbnails: Thumbnails.optional(),
    animationCount: z.number().optional(),
    faceCount: z.number().optional(),
    isDownloadable: z.boolean().optional(),
  })
  .passthrough();
const SearchBody = z.object({ results: z.array(z.unknown()).default([]), cursors: z.object({ next: z.string().nullish() }).passthrough().optional() }).passthrough();
const FileLink = z.object({ url: z.string(), size: z.number().optional() }).passthrough();
const DownloadBody = z.object({ glb: FileLink.optional() }).passthrough();

/** Sketchfab's licence, as the library names it; null for terms the library does not take (NoDerivs, Standard…). */
export function licenceFromSketchfab(license: z.infer<typeof LicenceObject> | null | undefined): SketchfabLicence | null {
  if (!license) return null;
  const bySlug = SKETCHFAB_LICENCES.find((id) => SKETCHFAB_LICENCE_SLUGS[id] === license.slug);
  if (bySlug) return bySlug;
  switch ((license.label ?? '').trim().toLowerCase()) {
    case 'cc0 public domain':
      return 'cc0';
    case 'cc attribution':
      return 'cc-by';
    case 'cc attribution-sharealike':
      return 'cc-by-sa';
    case 'cc attribution-noncommercial':
      return 'cc-by-nc';
    default:
      return null;
  }
}

const isHttps = (value: string | undefined): value is string => {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/** The packed cursor: one Sketchfab page cursor per licence still having pages. */
const PackedCursor = z.record(z.string(), z.string().regex(/^[A-Za-z0-9_=-]{1,64}$/));
const packCursor = (map: Record<string, string>): string | null => (Object.keys(map).length === 0 ? null : Buffer.from(JSON.stringify(map)).toString('base64url'));
function unpackCursor(cursor: string | undefined): Record<string, string> | null {
  if (!cursor) return null;
  try {
    const parsed = PackedCursor.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createSketchfabClient(deps: SketchfabDeps): SketchfabClient {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fileTimeoutMs = deps.fileTimeoutMs ?? FILE_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? ANIMATION_MAX_FILE_BYTES;

  async function token(): Promise<string> {
    let value: string | null = null;
    try {
      value = await deps.readToken();
    } catch {
      value = null;
    }
    const trimmed = value?.trim();
    if (!trimmed) throw new SketchfabError('no-token', 'Add your Sketchfab API token to search Sketchfab.');
    return trimmed;
  }

  async function send(url: string, init: { headers: Record<string, string> }, signal: AbortSignal | undefined, limitMs: number): Promise<Response> {
    if (signal?.aborted) throw new SketchfabError('cancelled', 'Cancelled.');
    const timer = AbortSignal.timeout(limitMs);
    try {
      return await doFetch(url, { ...init, redirect: 'error', signal: signal ? AbortSignal.any([signal, timer]) : timer });
    } catch {
      if (signal?.aborted) throw new SketchfabError('cancelled', 'Cancelled.');
      if (timer.aborted) throw new SketchfabError('timeout', 'Sketchfab took too long to answer.');
      throw new SketchfabError('network', 'Sketchfab could not be reached.');
    }
  }

  /** An API call: the one place the token is attached, and only to the API origin over https. */
  async function api(path: string, signal: AbortSignal | undefined): Promise<unknown> {
    const url = new URL(path, SKETCHFAB_API_ORIGIN);
    if (url.origin !== SKETCHFAB_API_ORIGIN) throw new SketchfabError('bad-response', 'Refused to send the token off api.sketchfab.com.');
    const response = await send(url.toString(), { headers: { Authorization: `Token ${await token()}`, Accept: 'application/json' } }, signal, timeoutMs);
    switch (response.status) {
      case 401:
        throw new SketchfabError('unauthorized', 'Sketchfab did not accept your API token. Check it and paste it again.');
      case 403:
        throw new SketchfabError('forbidden', 'Sketchfab will not let this model be downloaded.');
      case 404:
        throw new SketchfabError('not-found', 'That model is no longer on Sketchfab.');
      case 429: {
        const wait = Number(response.headers.get('retry-after'));
        throw new SketchfabError('rate-limited', Number.isFinite(wait) && wait > 0 ? `Sketchfab is rate limiting requests. Try again in ${Math.ceil(wait)}s.` : 'Sketchfab is rate limiting requests. Try again shortly.');
      }
    }
    if (!response.ok) throw new SketchfabError('bad-response', `Sketchfab answered ${response.status}.`);
    try {
      return await response.json();
    } catch {
      throw new SketchfabError('bad-response', 'Sketchfab sent something unreadable.');
    }
  }

  async function readCapped(response: Response): Promise<Uint8Array> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw new SketchfabError('oversize', 'That model is larger than the library accepts.');
    const reader = response.body?.getReader();
    if (!reader) {
      const all = new Uint8Array(await response.arrayBuffer());
      if (all.byteLength > maxBytes) throw new SketchfabError('oversize', 'That model is larger than the library accepts.');
      return all;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SketchfabError('oversize', 'That model is larger than the library accepts.');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  const author = (user: z.infer<typeof ModelBase>['user']): string => (user?.displayName || user?.username || '').slice(0, 120);

  return {
    async hasToken() {
      try {
        return Boolean((await deps.readToken())?.trim());
      } catch {
        return false;
      }
    },

    async search({ q, licences, cursor }, signal) {
      const wanted = SKETCHFAB_LICENCES.filter((id) => licences.includes(id));
      if (wanted.length === 0) throw new SketchfabError('unsupported', 'Tick at least one licence.');
      const packed = unpackCursor(cursor);
      // A cursor names the licences that still have pages; the first page asks every ticked licence.
      const active = packed ? wanted.filter((id) => SKETCHFAB_LICENCE_SLUGS[id] in packed) : wanted;
      const next: Record<string, string> = {};
      const results: SketchfabResult[] = [];
      const count = wanted.length > 1 ? 12 : 24;
      // One request per licence: the API takes a single `license` filter, and filtering on the server keeps every page full.
      for (const id of active) {
        const slug = SKETCHFAB_LICENCE_SLUGS[id];
        const params = new URLSearchParams({ type: 'models', animated: 'true', downloadable: 'true', license: slug, count: String(count) });
        if (q.trim()) params.set('q', q.trim());
        if (packed?.[slug]) params.set('cursor', packed[slug]);
        const body = SearchBody.safeParse(await api(`/v3/search?${params}`, signal));
        if (!body.success) throw new SketchfabError('bad-response', 'Sketchfab sent something unreadable.');
        for (const raw of body.data.results) {
          const model = ModelBase.safeParse(raw);
          if (!model.success || !/^[a-f0-9]{32}$/.test(model.data.uid) || model.data.isDownloadable === false) continue;
          // The filter is Sketchfab's; the label is checked again so a stray result never reads as a licence it is not.
          if (licenceFromSketchfab(model.data.license) !== id) continue;
          const thumbs = model.data.thumbnails?.images.filter((image) => isHttps(image.url)) ?? [];
          // The smallest thumbnail at least 200px wide, else the largest there is.
          const sorted = [...thumbs].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
          const thumb = sorted.find((image) => (image.width ?? 0) >= 200) ?? sorted[sorted.length - 1];
          results.push({
            uid: model.data.uid,
            name: model.data.name.slice(0, 200),
            author: author(model.data.user),
            licence: id,
            ...(thumb ? { thumbnailUrl: thumb.url } : {}),
            viewUrl: isHttps(model.data.viewerUrl) ? model.data.viewerUrl : `https://sketchfab.com/3d-models/${model.data.uid}`,
            ...(model.data.animationCount === undefined ? {} : { animationCount: Math.max(0, Math.round(model.data.animationCount)) }),
            ...(model.data.faceCount === undefined ? {} : { faceCount: Math.max(0, Math.round(model.data.faceCount)) }),
          });
        }
        const nextCursor = body.data.cursors?.next;
        if (nextCursor && /^[A-Za-z0-9_=-]{1,64}$/.test(nextCursor)) next[slug] = nextCursor;
      }
      return { results, nextCursor: packCursor(next) };
    },

    async download(uid, signal) {
      if (!/^[a-f0-9]{32}$/.test(uid)) throw new SketchfabError('bad-response', 'Not a Sketchfab model id.');
      const model = ModelBase.safeParse(await api(`/v3/models/${uid}`, signal));
      if (!model.success) throw new SketchfabError('bad-response', 'Sketchfab sent something unreadable.');
      const licence = licenceFromSketchfab(model.data.license);
      if (!licence) throw new SketchfabError('unsupported', 'That model is under terms the library does not take (only CC0, CC BY, CC BY-SA and CC BY-NC).');
      const link = DownloadBody.safeParse(await api(`/v3/models/${uid}/download`, signal));
      const glb = link.success ? link.data.glb : undefined;
      if (!glb) throw new SketchfabError('unsupported', 'Sketchfab offers no GLB download for that model.');
      if (glb.size !== undefined && glb.size > maxBytes) throw new SketchfabError('oversize', 'That model is larger than the library accepts.');
      // The signed URL is fetched with no credentials, only over https and only from Sketchfab's own storage.
      const file = new URL(glb.url);
      if (file.protocol !== 'https:' || !FILE_HOST.test(file.hostname)) throw new SketchfabError('bad-response', 'Sketchfab sent a download link the app will not follow.');
      const response = await send(file.toString(), { headers: { Accept: 'model/gltf-binary,*/*' } }, signal, fileTimeoutMs);
      if (!response.ok) throw new SketchfabError('bad-response', `The download failed (${response.status}).`);
      const bytes = await readCapped(response);
      return {
        uid,
        name: model.data.name.slice(0, 120),
        author: author(model.data.user),
        licence,
        viewUrl: isHttps(model.data.viewerUrl) ? model.data.viewerUrl : `https://sketchfab.com/3d-models/${uid}`,
        bytes,
      };
    },
  };
}
