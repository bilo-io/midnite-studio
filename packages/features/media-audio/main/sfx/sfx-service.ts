import {
  failure,
  ok,
  resolveSfxOptions,
  SFX_CHANNELS,
  SFX_MODEL_LABEL,
  SFX_REPO,
  SFX_REVISION,
  SFX_SEED_MAX,
  SFX_UPSTREAM_MODEL,
  sfxConsentIsCurrent,
  sfxSettingsSuffix,
  type GitOpResult,
  type SfxGenerateRequest,
  type SfxGenerateResult,
  type SfxGenerateStage,
  type SfxProgressEvent,
  type SfxRequest,
  type SfxSidecar,
  type SfxStatus,
} from '@midnite/studio-shared';

import { audioSlug, audioTimeStamp } from '../audio-service';
import type { SfxInstaller } from './installer';
import { encodeStereoWav } from './pipeline';
import type { SfxRunRequest, SfxRunResult } from './sfx-broker';

/**
 * Media ▸ SFX: the install ops over `installer.ts`, and a generation that writes each take into
 * `.midnite/media/sfx/<project>/` through the media store's jail —
 *
 *   `<project>/<stem>.wav`   44.1 kHz stereo, 16-bit
 *   `<project>/<stem>.json`  the sidecar: prompt, every setting (seed included), model and revision
 *
 * where `<stem>` = `<slug>-<settings>-<timestamp>` (`laser-zap-3s-s1234-20261101-173000`), so takes of one
 * prompt sort together and say how they differ. Variations run one after another with consecutive seeds.
 *
 * Electron stays out: the worker is reached through `run` (the broker) and files land through `writeBytes`.
 * Every op answers a `GitOpResult`; `handle` is the one dispatcher the IPC channel and the MCP tools share.
 */
type Scope = { repoId: string; tab: 'sfx'; project: string };

export type SfxServiceDeps = {
  installer: SfxInstaller;
  run: (req: SfxRunRequest, opts: { signal: AbortSignal; onStage: (stage: SfxGenerateStage, fraction?: number) => void }) => Promise<SfxRunResult>;
  writeBytes: (req: Scope & { path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
  emit: (event: SfxProgressEvent) => void;
  /** Ends the worker — on uninstall, so no session holds a deleted file. */
  disposeEngine: () => void;
  now?: () => Date;
  randomSeed?: () => number;
  /** `onnxruntime-node` is loadable in this build (checked lazily by main). */
  runtimeAvailable?: () => boolean;
};

const NO_RUNTIME = 'This build has no ONNX runtime, so Stable Audio Open Small cannot run here.';

/** Stage weights inside one take, for an overall fraction: sampling dominates. */
const STAGE_SPAN: Record<SfxGenerateStage, [number, number]> = {
  loading: [0, 0.05],
  encoding: [0.05, 0.1],
  sampling: [0.1, 0.85],
  decoding: [0.85, 0.97],
  writing: [0.97, 1],
};

export function sfxStem(label: string, suffix: string, createdAt: Date): string {
  return [audioSlug(label), suffix, audioTimeStamp(createdAt)].filter(Boolean).join('-');
}

export function createSfxService(deps: SfxServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const randomSeed = deps.randomSeed ?? (() => Math.floor(Math.random() * SFX_SEED_MAX));
  const running = new Map<string, AbortController>();
  const emitInstall = (progress: Extract<SfxProgressEvent, { kind: 'install' }>['progress']) => deps.emit({ kind: 'install', progress });

  async function status(): Promise<SfxStatus> {
    const s = await deps.installer.status();
    if (deps.runtimeAvailable && !deps.runtimeAvailable()) return { ...s, state: 'unavailable', reason: NO_RUNTIME };
    return s;
  }

  async function generate(req: SfxGenerateRequest): Promise<GitOpResult<SfxGenerateResult>> {
    const current = await status();
    if (current.state === 'unavailable') return failure(current.reason ?? NO_RUNTIME);
    if (!sfxConsentIsCurrent(current.consent)) return failure('Accept the Stability AI Community License (Media ▸ SFX) before generating.');
    if (current.state !== 'installed') return failure('Stable Audio Open Small is not installed. Install it from Media ▸ SFX first.');
    if (running.has(req.generationId)) return failure('This generation is already running.');

    const controller = new AbortController();
    running.set(req.generationId, controller);
    const started = Date.now();
    const options = resolveSfxOptions(req.options, randomSeed);
    const variations = options.variations;
    const files: string[] = [];
    const takes: SfxGenerateResult['takes'] = [];
    const base = { kind: 'generate' as const, generationId: req.generationId, repoId: req.repoId, project: req.project, variations };
    const progress = (
      status: 'running' | 'succeeded' | 'failed' | 'cancelled',
      extra: { stage?: SfxGenerateStage; fraction?: number; variation?: number; error?: string } = {},
    ) => deps.emit({ ...base, status, ...extra, ...(files.length ? { files: [...files] } : {}) });
    const fail = (message: string): GitOpResult<SfxGenerateResult> => {
      if (controller.signal.aborted || message === 'cancelled') {
        progress('cancelled');
        return failure('cancelled');
      }
      progress('failed', { error: message });
      return failure(message);
    };

    try {
      const label = req.name ?? req.prompt;
      for (let v = 0; v < variations; v += 1) {
        const variation = v + 1;
        const takeStarted = Date.now();
        const overall = (stage: SfxGenerateStage, fraction = 0) => {
          const [a, b] = STAGE_SPAN[stage];
          return Math.min(1, (v + a + (b - a) * fraction) / variations);
        };
        const seed = (options.seed + v) % (SFX_SEED_MAX + 1);
        const take = { prompt: req.prompt, negativePrompt: options.negativePrompt, seconds: options.seconds, steps: options.steps, cfgScale: options.cfgScale, seed };
        progress('running', { stage: 'loading', fraction: overall('loading'), variation });
        const result = await deps.run(
          { assetsDir: deps.installer.assetPath(''), take },
          { signal: controller.signal, onStage: (stage, f) => progress('running', { stage, fraction: overall(stage, f), variation }) },
        );
        if (controller.signal.aborted) return fail('cancelled');

        progress('running', { stage: 'writing', fraction: overall('writing'), variation });
        const createdAt = now();
        const stem = sfxStem(label, sfxSettingsSuffix(take), createdAt);
        const wav = `${stem}.wav`;
        const sidecar: SfxSidecar = {
          version: 1,
          kind: 'sfx',
          file: wav,
          prompt: req.prompt,
          ...(take.cfgScale > 1 && take.negativePrompt ? { negativePrompt: take.negativePrompt } : {}),
          seconds: take.seconds,
          steps: take.steps,
          cfgScale: take.cfgScale,
          seed,
          sampleRate: result.sampleRate,
          channels: result.channels.length || SFX_CHANNELS,
          model: { name: SFX_MODEL_LABEL, repo: SFX_REPO, revision: SFX_REVISION, upstream: SFX_UPSTREAM_MODEL },
          createdAt: createdAt.toISOString(),
          elapsedMs: Date.now() - takeStarted,
        };
        const scope = { repoId: req.repoId, tab: 'sfx' as const, project: req.project };
        const wrote = await deps.writeBytes({ ...scope, path: wav, data: encodeStereoWav(result.channels, result.sampleRate) });
        if (!wrote.ok) return fail(wrote.kind === 'error' ? wrote.message : 'Could not write the sound.');
        const wroteSidecar = await deps.writeBytes({ ...scope, path: `${stem}.json`, data: Buffer.from(JSON.stringify(sidecar, null, 2) + '\n', 'utf8') });
        if (!wroteSidecar.ok) return fail(wroteSidecar.kind === 'error' ? wroteSidecar.message : 'Could not write the sidecar.');
        files.push(wav);
        takes.push({ file: wav, sidecar: `${stem}.json`, seed, seconds: take.seconds });
      }
      progress('succeeded', { fraction: 1 });
      return ok({ takes, elapsedMs: Date.now() - started });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    } finally {
      running.delete(req.generationId);
    }
  }

  function cancelGenerate(generationId: string): GitOpResult {
    const controller = running.get(generationId);
    if (!controller) return failure('Nothing to cancel.');
    controller.abort();
    return ok();
  }

  async function uninstall(): Promise<GitOpResult<SfxStatus>> {
    for (const controller of running.values()) controller.abort();
    deps.disposeEngine();
    return deps.installer.uninstall();
  }

  /** The one dispatcher behind `mediaSfx` (and the MCP tools). Never throws. */
  async function handle(req: SfxRequest): Promise<GitOpResult<unknown> | GitOpResult> {
    try {
      switch (req.op) {
        case 'status':
          return ok(await status());
        case 'consent':
          return await deps.installer.consent(req);
        case 'revokeConsent':
          return await deps.installer.revokeConsent();
        case 'install':
          if ((await status()).state === 'unavailable') return failure(NO_RUNTIME);
          return await deps.installer.install(emitInstall);
        case 'cancelInstall':
          return deps.installer.cancel();
        case 'uninstall':
          return await uninstall();
        case 'generate': {
          const { op: _op, ...rest } = req;
          return await generate(rest);
        }
        case 'cancelGenerate':
          return cancelGenerate(req.generationId);
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  return { status, generate, cancelGenerate, uninstall, handle };
}

export type SfxService = ReturnType<typeof createSfxService>;

/**
 * The dispatcher a host without the engine composes (Creator, Gamer, Media): the status says why, which the
 * tab shows in place of the install button; every other op is refused.
 */
export function unavailableSfx(appName: string) {
  const reason = `Sound-effect generation is not available in ${appName}. Open Midnite Studio to use it.`;
  return async (req: SfxRequest): Promise<GitOpResult<unknown>> =>
    req.op === 'status' ? ok({ state: 'unavailable' as const, consent: null, bytesOnDisk: 0, totalBytes: 0, reason }) : failure(reason);
}
