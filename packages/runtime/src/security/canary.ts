import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  CANARY_RELATIVE_PATH,
  CANARY_VAULT_KEYS,
  canaryFileContent,
  generateCanaryValues,
  MIN_VAULT_VALUE_LENGTH,
  type OutboundSecret,
} from '@midnite/studio-shared';

import { VAULT_NAMESPACE_IDS, type VaultClient } from '../vault/vault-service';

/**
 * Canaries and the outbound secret source — Phase 121 Theme D.
 *
 * {@link ensureCanaries} keeps two generated values under the vault's reserved `canaries` namespace and a copy in
 * `~/.config/midnite/.env.canary` (0600), a file an agent's shell can reach and nothing legitimate reads. A read
 * of that path (the audit trail, a confined session's denial log) or the value in an outbound prompt is a
 * `critical` finding; the rules live in Vanguard's rogue-agent set, the prompt check in outbound redaction.
 *
 * {@link createOutboundSecretSource} is what outbound redaction matches literally: every value the vault holds,
 * canaries included and labelled as such. It is read in main only; a value never crosses to a renderer.
 */

export interface CanaryOptions {
  vault: VaultClient;
  /** The home directory the canary file sits under. */
  homeDir: string;
  /** Random bytes, for tests. */
  random?: (n: number) => Uint8Array;
}

export interface CanaryState {
  path: string;
  values: { githubPat: string; awsKey: string };
}

export const canaryPath = (homeDir: string): string => join(homeDir, CANARY_RELATIVE_PATH);

/**
 * Create the canaries if the vault has none, and (re)write the file when it is missing or differs. Idempotent: a
 * second call changes nothing. Returns `null` when the vault cannot hold them (locked or unavailable): a canary
 * that would not survive the session is not planted.
 */
export async function ensureCanaries(options: CanaryOptions): Promise<CanaryState | null> {
  const { vault, homeDir } = options;
  const random = options.random ?? ((n: number) => randomBytes(n));
  const [pat, aws] = await Promise.all([vault.read('canaries', CANARY_VAULT_KEYS.githubPat), vault.read('canaries', CANARY_VAULT_KEYS.awsKey)]);
  let values: CanaryState['values'];
  if (pat.ok && aws.ok) {
    values = { githubPat: pat.value, awsKey: aws.value };
  } else {
    if (!vault.isAvailable()) return null;
    if ((!pat.ok && pat.kind === 'locked') || (!aws.ok && aws.kind === 'locked')) return null;
    values = generateCanaryValues(random);
    await vault.set('canaries', CANARY_VAULT_KEYS.githubPat, values.githubPat);
    await vault.set('canaries', CANARY_VAULT_KEYS.awsKey, values.awsKey);
  }
  const path = canaryPath(homeDir);
  const content = canaryFileContent(values);
  const current = await readFile(path, 'utf8').catch(() => null);
  if (current !== content) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, content, { mode: 0o600 });
  }
  // `writeFile`'s mode only applies on create; a file that already existed is tightened too.
  await chmod(path, 0o600);
  return { path, values };
}

export interface OutboundSecretSourceOptions {
  vault: VaultClient;
  /** How long a read is reused. Each read decrypts every entry, and a prompt is built per turn. Default 5s. */
  ttlMs?: number;
  now?: () => number;
}

/**
 * Every readable value in the vault as {@link OutboundSecret}s, cached briefly. A locked or unavailable vault
 * answers with what it can (nothing); the shape patterns still run. A value too short to match literally without
 * eating ordinary words is left out (`MIN_VAULT_VALUE_LENGTH`).
 */
export function createOutboundSecretSource(options: OutboundSecretSourceOptions): () => Promise<readonly OutboundSecret[]> {
  const ttl = options.ttlMs ?? 5_000;
  const now = options.now ?? Date.now;
  let cached: { at: number; secrets: OutboundSecret[] } | null = null;
  let inflight: Promise<OutboundSecret[]> | null = null;

  const load = async (): Promise<OutboundSecret[]> => {
    const secrets: OutboundSecret[] = [];
    for (const namespace of VAULT_NAMESPACE_IDS) {
      const keys = await options.vault.keys(namespace).catch(() => [] as string[]);
      for (const key of keys) {
        const read = await options.vault.read(namespace, key).catch(() => null);
        if (read === null || !read.ok || read.value.length < MIN_VAULT_VALUE_LENGTH) continue;
        secrets.push({ name: `${namespace}:${key}`, value: read.value, kind: namespace === 'canaries' ? 'canary' : 'vault' });
      }
    }
    return secrets;
  };

  return async () => {
    if (cached && now() - cached.at < ttl) return cached.secrets;
    inflight ??= load().finally(() => {
      inflight = null;
    });
    const secrets = await inflight;
    cached = { at: now(), secrets };
    return secrets;
  };
}
