import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { NewSecurityFinding, OllamaModel } from '@midnite/studio-shared';

/**
 * Ollama model digests (Phase 121 Theme I) — a model the user installed is the same bytes tomorrow.
 *
 * Ollama names a model by a tag (`llama3:8b`), and a tag is a pointer the registry can move. Its daemon
 * reports a `digest` per installed model — the sha256 of that model's manifest file — and keeps the
 * manifest itself under `~/.ollama/models/manifests/<registry>/<namespace>/<model>/<tag>`. So the digest the
 * daemon *says* can be checked against the file on disk, and the one we saw at install can be checked
 * against the one we see later.
 *
 * Two checks, one record:
 *
 *  - **At install** (a pull finishes): the reported digest must equal the sha256 of the manifest on disk; it
 *    is then recorded as the model's pin. A mismatch is a `medium` finding. A manifest that cannot be read
 *    (a remote daemon, a cloud model, a custom `OLLAMA_MODELS` we cannot see) is *unverifiable*, never a
 *    finding — the reported digest is still recorded.
 *  - **Later** (the list is read): a pinned model whose reported digest differs from the pin is a `medium`
 *    finding. The pin is not moved by a listing — only a pull the user asked for re-pins — so the finding
 *    stays until the user deals with it.
 *
 * Nothing here talks to the network. Library search (ollama.com) stays where it was, behind Phase 115
 * Theme A's switch once that lands; no digest check needs it. The findings ledger is injected
 * (`raiseFinding`) so this feature never imports the runtime's ledger host.
 */

const FILE_NAME = 'ollama-digests.json';
const REGISTRY = 'registry.ollama.ai';

/** A model name → the digest recorded when it was installed (`sha256:<hex>`). */
export type OllamaDigestPins = Record<string, string>;

export type OllamaDigestStore = {
  load: () => Promise<OllamaDigestPins>;
  save: (pins: OllamaDigestPins) => Promise<void>;
};

export function createOllamaDigestStore(directory: string): OllamaDigestStore {
  const file = join(directory, FILE_NAME);
  return {
    load: async () => {
      try {
        return parsePins(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        return {};
      }
    },
    save: async (pins) => {
      try {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, `${JSON.stringify({ version: 1, pins }, null, 2)}\n`, { mode: 0o600 });
        await chmod(file, 0o600);
      } catch {
        // A read-only data dir must not break a pull; the pin is simply not remembered.
      }
    },
  };
}

/** Exported for the store's tests. Anything that is not a name → string map is treated as no pins. */
export function parsePins(value: unknown): OllamaDigestPins {
  const pins = (value as { pins?: unknown } | null)?.pins;
  if (typeof pins !== 'object' || pins === null) return {};
  return Object.fromEntries(Object.entries(pins).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** `sha256:<hex>` and bare `<hex>` compare equal; case does not matter. */
export function normalizeDigest(digest: string): string {
  return digest.trim().toLowerCase().replace(/^sha256:/, '');
}

/** The directory Ollama keeps models in: `OLLAMA_MODELS`, else `~/.ollama/models`. */
export function ollamaModelsDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const override = env['OLLAMA_MODELS'];
  return override && override.length > 0 ? override : join(home, '.ollama', 'models');
}

/**
 * Where Ollama keeps a model's manifest: `llama3:8b` is `manifests/registry.ollama.ai/library/llama3/8b`,
 * `user/model` is `.../user/model/latest`, and `host/ns/model:tag` names its own registry. Null for a name
 * that cannot be a path (an empty segment or a `..`), so a hostile tag never walks out of `manifests/`.
 */
export function manifestPathFor(modelName: string, modelsDir: string): string | null {
  const colon = modelName.lastIndexOf(':');
  const hasTag = colon > modelName.lastIndexOf('/');
  const tag = hasTag ? modelName.slice(colon + 1) : 'latest';
  const repo = (hasTag ? modelName.slice(0, colon) : modelName).split('/');
  const parts = repo.length === 1 ? [REGISTRY, 'library', ...repo] : repo.length === 2 ? [REGISTRY, ...repo] : repo;
  const segments = [...parts, tag];
  if (segments.length !== 4 || segments.some((s) => s.length === 0 || s === '.' || s === '..' || /[\\/\0]/.test(s))) return null;
  return join(modelsDir, 'manifests', ...segments);
}

export type DigestVerification =
  | { status: 'verified'; digest: string }
  | { status: 'mismatch'; reported: string; onDisk: string }
  | { status: 'unverifiable'; reason: string };

/** Compare the daemon's reported digest with the sha256 of the manifest file on disk. Never throws. */
export async function verifyManifestDigest(
  modelName: string,
  reported: string,
  options: { modelsDir: string; readFile?: (path: string) => Promise<Buffer> },
): Promise<DigestVerification> {
  const path = manifestPathFor(modelName, options.modelsDir);
  if (!path) return { status: 'unverifiable', reason: 'The model name does not map to a manifest path.' };
  let bytes: Buffer;
  try {
    bytes = await (options.readFile ?? readFile)(path);
  } catch {
    return { status: 'unverifiable', reason: 'The manifest is not on this machine (a remote daemon or a cloud model).' };
  }
  const onDisk = createHash('sha256').update(bytes).digest('hex');
  return normalizeDigest(reported) === onDisk ? { status: 'verified', digest: `sha256:${onDisk}` } : { status: 'mismatch', reported: `sha256:${normalizeDigest(reported)}`, onDisk: `sha256:${onDisk}` };
}

export type OllamaDigestDeps = {
  store: OllamaDigestStore;
  modelsDir?: string;
  readFile?: (path: string) => Promise<Buffer>;
  /** The findings ledger's `record`, supplied by the composer. Failures are swallowed. */
  raiseFinding?: ((finding: NewSecurityFinding) => unknown) | undefined;
};

const short = (digest: string): string => normalizeDigest(digest).slice(0, 12);

function finding(model: string, kind: 'changed' | 'manifest-mismatch', detail: string, title: string): NewSecurityFinding {
  return {
    source: 'agents',
    severity: 'medium',
    category: 'supply-chain',
    fingerprint: `agents:ollama-digest:${kind}:${model}`,
    title,
    detail,
    evidence: [{ kind: 'command', command: 'ollama', args: ['show', model] }],
    remediation: [],
  };
}

export type OllamaDigestLedger = {
  /** A pull of `model` finished and the daemon now lists it: verify against disk, then pin. */
  recordInstalled: (model: OllamaModel, options?: { checkDisk?: boolean }) => Promise<DigestVerification>;
  /** The daemon's list was read: raise a finding for every pinned model whose digest moved. Returns the names. */
  checkPinned: (models: readonly OllamaModel[]) => Promise<string[]>;
  pins: () => Promise<OllamaDigestPins>;
};

export function createOllamaDigestLedger(deps: OllamaDigestDeps): OllamaDigestLedger {
  const modelsDir = deps.modelsDir ?? ollamaModelsDir();
  let loaded: Promise<OllamaDigestPins> | null = null;
  // Saves go one after another, so two pulls finishing together cannot write over each other.
  let saving: Promise<unknown> = Promise.resolve();
  const load = (): Promise<OllamaDigestPins> => (loaded ??= deps.store.load());
  const raise = (f: NewSecurityFinding): void => {
    try {
      const result = deps.raiseFinding?.(f);
      if (result && typeof (result as Promise<unknown>).catch === 'function') void (result as Promise<unknown>).catch(() => undefined);
    } catch {
      // An unavailable ledger must not break a pull or a listing.
    }
  };

  return {
    pins: load,

    async recordInstalled(model, options = {}) {
      const pins = await load();
      const verification: DigestVerification =
        options.checkDisk === false
          ? { status: 'unverifiable', reason: 'The daemon is not on this machine.' }
          : await verifyManifestDigest(model.name, model.digest, {
              modelsDir,
              ...(deps.readFile ? { readFile: deps.readFile } : {}),
            });
      if (verification.status === 'mismatch') {
        raise(
          finding(
            model.name,
            'manifest-mismatch',
            `Ollama reports ${short(verification.reported)} for ${model.name}, but the manifest on disk hashes to ${short(verification.onDisk)}. The model was not pinned from the daemon's word alone.`,
            `Ollama model "${model.name}": reported digest does not match its manifest`,
          ),
        );
        return verification;
      }
      const digest = `sha256:${normalizeDigest(model.digest)}`;
      const previous = pins[model.name];
      if (previous !== undefined && normalizeDigest(previous) !== normalizeDigest(digest)) {
        raise(
          finding(
            model.name,
            'changed',
            `${model.name} was ${short(previous)} when it was installed and is now ${short(digest)} after a pull. The tag moved upstream; the new build is pinned.`,
            `Ollama model "${model.name}" now points at a different build`,
          ),
        );
      }
      pins[model.name] = digest;
      const snapshot = { ...pins };
      saving = saving.then(() => deps.store.save(snapshot)).catch(() => undefined);
      await saving;
      return verification;
    },

    async checkPinned(models) {
      const pins = await load();
      const moved: string[] = [];
      for (const model of models) {
        const pinned = pins[model.name];
        if (pinned === undefined || normalizeDigest(pinned) === normalizeDigest(model.digest)) continue;
        moved.push(model.name);
        raise(
          finding(
            model.name,
            'changed',
            `${model.name} was ${short(pinned)} when it was installed and the daemon now reports ${short(model.digest)}, with no pull from this app in between. Re-pull it to accept the new build.`,
            `Ollama model "${model.name}" changed since it was installed`,
          ),
        );
      }
      return moved;
    },
  };
}

let ledger: OllamaDigestLedger | null = null;

/** The composer's one call, once `userData` is known: where pins live and where findings go. */
export function configureOllamaDigests(deps: OllamaDigestDeps | null): void {
  ledger = deps ? createOllamaDigestLedger(deps) : null;
}

export function getOllamaDigestLedger(): OllamaDigestLedger | null {
  return ledger;
}
