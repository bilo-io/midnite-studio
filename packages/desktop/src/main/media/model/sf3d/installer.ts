import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  consentIsCurrent,
  failure,
  manifestBytes,
  ok,
  SF3D_LICENCE_SHA256,
  SF3D_PINNED_MANIFEST,
  SF3D_REVISION,
  sf3dFileUrl,
  Sf3dConsentSchema,
  Sf3dManifestSchema,
  type GitOpResult,
  type Sf3dConsent,
  type Sf3dInstallProgress,
  type Sf3dManifest,
  type Sf3dStatus,
} from '@midnite/studio-shared';

/**
 * The SF3D install, as a small state machine over `<userData>/sf3d/` (Phase 103 Theme J):
 *
 *   no consent ──consent──▶ consented ──install──▶ installing ──verified──▶ installed
 *                                 ▲                    │ cancel / error            │
 *                                 └────────────────────┘ (partials kept)           │
 *   any state ──────────────────────────uninstall (everything removed)─────────────┘
 *
 * - **Nothing is fetched before consent.** `install` refuses, before any request, unless
 *   `consent.json` names the licence text this build ships.
 * - **Resume-safe verification.** Each asset downloads to `<path>.part`; a resumed download first
 *   hashes the bytes already on disk, then asks for the rest with an HTTP `Range`, so the sha256 that
 *   is checked covers every byte of the file. A server that ignores the range (200) restarts the
 *   file. Only a file that matched `assets-manifest.json` is renamed into place, so a present final
 *   file is a verified one.
 * - **Pinned.** URLs resolve at `SF3D_REVISION`, and the upstream manifest must agree with the
 *   pinned copy before anything large is requested.
 * - The optional Hugging Face token comes from the secrets vault (`readToken`) and only ever travels
 *   in the `Authorization` header — the port is not gated today, so it is usually absent.
 */
export type Sf3dInstallerDeps = {
  /** `<userData>/sf3d`. */
  directory: string;
  fetch?: typeof fetch;
  readToken?: () => Promise<string | null>;
  now?: () => Date;
  manifest?: Sf3dManifest;
  url?: (path: string) => string;
  /** Minimum ms between two `download` progress events (default 200). */
  throttleMs?: number;
};

const CONSENT_FILE = 'consent.json';
const INSTALLED_FILE = 'installed.json';
const MANIFEST_PATH = 'assets-manifest.json';

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

export function createSf3dInstaller(deps: Sf3dInstallerDeps) {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  const manifest = deps.manifest ?? SF3D_PINNED_MANIFEST;
  const url = deps.url ?? ((path: string) => sf3dFileUrl(path));
  const throttleMs = deps.throttleMs ?? 200;
  const assetsDir = join(deps.directory, 'assets');
  const assetPath = (path: string) => join(assetsDir, ...path.split('/'));
  const totalBytes = manifestBytes(manifest);

  let running: { controller: AbortController; done: Promise<unknown> } | null = null;
  let lastProgress: Sf3dInstallProgress | undefined;
  let lastError: string | undefined;

  async function readConsent(): Promise<Sf3dConsent | null> {
    try {
      const parsed = Sf3dConsentSchema.safeParse(JSON.parse(await readFile(join(deps.directory, CONSENT_FILE), 'utf8')));
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

  async function status(): Promise<Sf3dStatus> {
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

  async function consent(req: { licenceSha256: string; revenueAcknowledged: true }): Promise<GitOpResult<Sf3dStatus>> {
    if (req.licenceSha256 !== SF3D_LICENCE_SHA256) return failure('That is not the licence this build ships; reopen the dialog and read it again.');
    const record: Sf3dConsent = { licenceSha256: SF3D_LICENCE_SHA256, acceptedAt: now().toISOString(), revenueAcknowledged: true };
    await mkdir(deps.directory, { recursive: true });
    await writeFile(join(deps.directory, CONSENT_FILE), JSON.stringify(record, null, 2) + '\n', 'utf8');
    return ok(await status());
  }

  async function revokeConsent(): Promise<GitOpResult<Sf3dStatus>> {
    if (running) return failure('Cancel the install first.');
    await rm(join(deps.directory, CONSENT_FILE), { force: true });
    return ok(await status());
  }

  async function fetchManifest(signal: AbortSignal, headers: Record<string, string>): Promise<void> {
    const res = await doFetch(url(MANIFEST_PATH), { signal, headers });
    if (!res.ok) throw new Error(`Could not read the SF3D manifest (HTTP ${res.status}).`);
    const parsed = Sf3dManifestSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error('The SF3D manifest is malformed.');
    for (const [path, pinned] of Object.entries(manifest.assets)) {
      const upstream = parsed.data.assets[path];
      if (!upstream || upstream.sha256 !== pinned.sha256 || upstream.bytes !== pinned.bytes) {
        throw new Error(`The upstream manifest does not match the pinned one for ${path}; refusing to install.`);
      }
    }
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

  function install(onProgress: (progress: Sf3dInstallProgress) => void): Promise<GitOpResult<Sf3dStatus>> {
    if (running) return Promise.resolve(failure('SF3D is already installing.'));
    const controller = new AbortController();
    const emit = (progress: Sf3dInstallProgress) => {
      lastProgress = progress;
      onProgress(progress);
    };

    const work = (async (): Promise<GitOpResult<Sf3dStatus>> => {
      // Consent is checked before a single request is made.
      if (!consentIsCurrent(await readConsent())) {
        running = null;
        return failure('Accept the Stability AI Community License before SF3D is downloaded.');
      }
      lastError = undefined;
      const { signal } = controller;
      try {
        const token = (await deps.readToken?.()) ?? null;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        let received = await bytesOnDisk();
        emit({ phase: 'manifest', receivedBytes: received, totalBytes, fraction: received / totalBytes });
        await fetchManifest(signal, headers);

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
          JSON.stringify({ revision: SF3D_REVISION, manifest, verifiedAt: now().toISOString() }, null, 2) + '\n',
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

  /** Stops any install and removes everything under `<userData>/sf3d` — weights, partials and consent. */
  async function uninstall(): Promise<GitOpResult<Sf3dStatus>> {
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

export type Sf3dInstaller = ReturnType<typeof createSf3dInstaller>;
