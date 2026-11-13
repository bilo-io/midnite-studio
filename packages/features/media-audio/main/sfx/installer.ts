import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  failure,
  ok,
  SFX_LICENCE_SHA256,
  SFX_PINNED_MANIFEST,
  SFX_REPO,
  SFX_REVISION,
  sfxConsentIsCurrent,
  sfxFileUrl,
  SfxConsentSchema,
  type GitOpResult,
  type SfxConsent,
  type SfxInstallProgress,
  type SfxManifest,
  type SfxStatus,
} from '@midnite/studio-shared';

/**
 * The Stable Audio Open Small install, as a small state machine over `<userData>/sfx/` — SF3D's installer
 * (`media-model/main/model/sf3d/installer.ts`, Phase 103 Theme J) adapted, since features cannot import each other:
 *
 *   no consent ──consent──▶ consented ──install──▶ installing ──verified──▶ installed
 *                                 ▲                    │ cancel / error            │
 *                                 └────────────────────┘ (partials kept)           │
 *   any state ──────────────────────────uninstall (everything removed)─────────────┘
 *
 * - **Nothing is fetched before consent.** `install` refuses, before any request, unless `consent.json` names
 *   the licence text this build ships.
 * - **Resume-safe verification.** Each asset downloads to `<path>.part`; a resumed download first hashes the
 *   bytes already on disk, then asks for the rest with an HTTP `Range`, so the sha256 that is checked covers
 *   every byte. A server that ignores the range (200) restarts the file. Only a file that matched
 *   `SFX_PINNED_MANIFEST` is renamed into place, so a present final file is a verified one.
 * - **Pinned.** URLs resolve at `SFX_REVISION`. The port publishes no manifest of its own (SF3D's does), so the
 *   pin in `shared` is the only one — there is no upstream copy to compare first.
 * - The optional Hugging Face token comes from the secrets vault (`readToken`, the same `media.huggingFaceToken`
 *   SF3D reads) and only ever travels in the `Authorization` header — the port is not gated, so it is usually absent.
 */
import { guardedFetchFor } from '@midnite/studio-runtime';
export type SfxInstallerDeps = {
  /** `<userData>/sfx`. */
  directory: string;
  fetch?: typeof fetch;
  readToken?: () => Promise<string | null>;
  now?: () => Date;
  manifest?: SfxManifest;
  url?: (path: string) => string;
  /** Minimum ms between two `download` progress events (default 200). */
  throttleMs?: number;
};

const CONSENT_FILE = 'consent.json';
const INSTALLED_FILE = 'installed.json';

class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function hashFile(path: string, hash: ReturnType<typeof createHash>, signal: AbortSignal): Promise<void> {
  for await (const chunk of createReadStream(path)) {
    if (signal.aborted) throw new Cancelled();
    hash.update(chunk as Buffer);
  }
}

export function createSfxInstaller(deps: SfxInstallerDeps) {
  const doFetch = deps.fetch ?? guardedFetchFor('media-audio');
  const now = deps.now ?? (() => new Date());
  const manifest = deps.manifest ?? SFX_PINNED_MANIFEST;
  const url = deps.url ?? ((path: string) => sfxFileUrl(path));
  const throttleMs = deps.throttleMs ?? 200;
  const assetsDir = join(deps.directory, 'assets');
  const assetPath = (path: string) => join(assetsDir, ...path.split('/'));
  const totalBytes = Object.values(manifest.assets).reduce((sum, a) => sum + a.bytes, 0);

  let running: { controller: AbortController; done: Promise<unknown> } | null = null;
  let lastProgress: SfxInstallProgress | undefined;
  let lastError: string | undefined;

  async function readConsent(): Promise<SfxConsent | null> {
    try {
      const parsed = SfxConsentSchema.safeParse(JSON.parse(await readFile(join(deps.directory, CONSENT_FILE), 'utf8')));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** Every asset present at its manifest size — only verified files are ever renamed into place. */
  async function installedOnDisk(): Promise<boolean> {
    if ((await sizeOf(join(deps.directory, INSTALLED_FILE))) === null) return false;
    for (const [path, asset] of Object.entries(manifest.assets)) {
      if ((await sizeOf(assetPath(path))) !== asset.bytes) return false;
    }
    return true;
  }

  async function bytesOnDisk(): Promise<number> {
    let sum = 0;
    for (const [path, asset] of Object.entries(manifest.assets)) {
      const final = await sizeOf(assetPath(path));
      if (final === asset.bytes) sum += final;
      else sum += Math.min(asset.bytes, (await sizeOf(`${assetPath(path)}.part`)) ?? 0);
    }
    return sum;
  }

  async function status(): Promise<SfxStatus> {
    const consent = await readConsent();
    const state = running ? 'installing' : (await installedOnDisk()) ? 'installed' : 'not-installed';
    return {
      state,
      consent,
      bytesOnDisk: await bytesOnDisk(),
      totalBytes,
      ...(running && lastProgress ? { progress: lastProgress } : {}),
      ...(lastError && !running ? { error: lastError } : {}),
    };
  }

  async function consent(req: { licenceSha256: string; revenueAcknowledged: true }): Promise<GitOpResult<SfxStatus>> {
    if (req.licenceSha256 !== SFX_LICENCE_SHA256) return failure('That is not the licence this build ships; reopen the dialog and read it again.');
    const record: SfxConsent = { licenceSha256: SFX_LICENCE_SHA256, acceptedAt: now().toISOString(), revenueAcknowledged: true };
    await mkdir(deps.directory, { recursive: true });
    await writeFile(join(deps.directory, CONSENT_FILE), JSON.stringify(record, null, 2) + '\n', 'utf8');
    return ok(await status());
  }

  async function revokeConsent(): Promise<GitOpResult<SfxStatus>> {
    if (running) return failure('Cancel the install first.');
    await rm(join(deps.directory, CONSENT_FILE), { force: true });
    return ok(await status());
  }

  async function downloadAsset(
    path: string,
    asset: { bytes: number; sha256: string },
    ctx: { signal: AbortSignal; headers: Record<string, string>; progress: (file: string, delta: number) => void },
  ): Promise<void> {
    const final = assetPath(path);
    if ((await sizeOf(final)) === asset.bytes) return;
    const part = `${final}.part`;
    await mkdir(dirname(part), { recursive: true });
    let have = (await sizeOf(part)) ?? 0;
    if (have > asset.bytes) {
      await rm(part, { force: true });
      ctx.progress(path, -have);
      have = 0;
    }
    let hash = createHash('sha256');
    if (have > 0) await hashFile(part, hash, ctx.signal);

    if (have < asset.bytes) {
      const headers = { ...ctx.headers, ...(have > 0 ? { Range: `bytes=${have}-` } : {}) };
      const res = await doFetch(url(path), { signal: ctx.signal, headers });
      if (res.status === 200 && have > 0) {
        // The server ignored the range: start this file again.
        ctx.progress(path, -have);
        have = 0;
        hash = createHash('sha256');
        await rm(part, { force: true });
      } else if (res.status !== 200 && res.status !== 206) {
        throw new Error(`Downloading ${path} failed (HTTP ${res.status}).`);
      }
      if (!res.body) throw new Error(`Downloading ${path} returned no body.`);
      const handle = await open(part, 'a');
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          if (ctx.signal.aborted) throw new Cancelled();
          await handle.write(chunk);
          hash.update(chunk);
          have += chunk.byteLength;
          ctx.progress(path, chunk.byteLength);
          if (have > asset.bytes) break;
        }
      } finally {
        await handle.close();
      }
    }
    if (ctx.signal.aborted) throw new Cancelled();
    if (have !== asset.bytes) {
      if (have > asset.bytes) await rm(part, { force: true });
      throw new Error(`${path} is ${have} bytes, expected ${asset.bytes}. Try the install again to resume.`);
    }
    if (hash.digest('hex') !== asset.sha256) {
      await rm(part, { force: true });
      throw new Error(`${path} failed its sha256 check; the download was discarded. Try the install again.`);
    }
    await rename(part, final);
  }

  function install(onProgress: (progress: SfxInstallProgress) => void): Promise<GitOpResult<SfxStatus>> {
    if (running) return Promise.resolve(failure('Stable Audio Open Small is already installing.'));
    const controller = new AbortController();
    const emit = (progress: SfxInstallProgress) => {
      lastProgress = progress;
      onProgress(progress);
    };

    const work = (async (): Promise<GitOpResult<SfxStatus>> => {
      // Consent is checked before a single request is made.
      if (!sfxConsentIsCurrent(await readConsent())) {
        running = null;
        return failure('Accept the Stability AI Community License before Stable Audio Open Small is downloaded.');
      }
      lastError = undefined;
      const { signal } = controller;
      try {
        const token = (await deps.readToken?.()) ?? null;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        let received = await bytesOnDisk();
        emit({ phase: 'manifest', receivedBytes: received, totalBytes, fraction: received / totalBytes });

        let lastEmit = 0;
        const progress = (file: string, delta: number) => {
          received += delta;
          const t = Date.now();
          if (t - lastEmit < throttleMs) return;
          lastEmit = t;
          emit({ phase: 'download', file, receivedBytes: received, totalBytes, fraction: Math.min(1, received / totalBytes) });
        };
        for (const [path, asset] of Object.entries(manifest.assets)) {
          emit({ phase: 'download', file: path, receivedBytes: received, totalBytes, fraction: Math.min(1, received / totalBytes) });
          await downloadAsset(path, asset, { signal, headers, progress });
          emit({ phase: 'verify', file: path, receivedBytes: received, totalBytes, fraction: Math.min(1, received / totalBytes) });
        }
        await writeFile(
          join(deps.directory, INSTALLED_FILE),
          JSON.stringify({ repo: SFX_REPO, revision: SFX_REVISION, manifest, verifiedAt: now().toISOString() }, null, 2) + '\n',
          'utf8',
        );
        emit({ phase: 'ready', receivedBytes: totalBytes, totalBytes, fraction: 1 });
        running = null;
        return ok(await status());
      } catch (error) {
        const cancelled = error instanceof Cancelled || signal.aborted;
        const received = await bytesOnDisk();
        if (cancelled) {
          emit({ phase: 'cancelled', receivedBytes: received, totalBytes, fraction: received / totalBytes });
          return failure('cancelled');
        }
        lastError = message(error);
        emit({ phase: 'failed', receivedBytes: received, totalBytes, fraction: received / totalBytes, message: lastError });
        return failure(lastError);
      } finally {
        running = null;
      }
    })();
    running = { controller, done: work };
    return work;
  }

  function cancel(): GitOpResult {
    if (!running) return failure('Nothing is installing.');
    running.controller.abort();
    return ok();
  }

  /** Stops any install and removes everything under `<userData>/sfx` — weights, partials and consent. */
  async function uninstall(): Promise<GitOpResult<SfxStatus>> {
    if (running) {
      running.controller.abort();
      await running.done.catch(() => undefined);
    }
    try {
      await rm(deps.directory, { recursive: true, force: true });
    } catch (error) {
      return failure(`Could not remove ${deps.directory}: ${message(error)}`);
    }
    lastError = undefined;
    lastProgress = undefined;
    return ok(await status());
  }

  return { status, consent, revokeConsent, install, cancel, uninstall, assetPath, installedOnDisk };
}

export type SfxInstaller = ReturnType<typeof createSfxInstaller>;
