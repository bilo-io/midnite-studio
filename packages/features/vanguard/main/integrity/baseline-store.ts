import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { IntegrityBaselineSchema, type IntegrityBaseline } from '@midnite/studio-shared';

import { sha256Hex } from './enumerate';

/**
 * Where a scope's baseline lives: `<userData>/security/integrity/<scopeId>.json`, the directory at 0700
 * and the file at 0600 (the modes the findings ledger keeps beside it). Written to a temp name and
 * renamed, so a crash mid-write leaves the previous baseline, never half a file.
 */

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export function integrityDir(userData: string): string {
  return join(userData, 'security', 'integrity');
}

/** A repo id is used as the file name when it is a plain token; anything else is hashed. */
export function baselineFileName(scopeId: string): string {
  return /^[A-Za-z0-9._-]{1,100}$/.test(scopeId) && !scopeId.startsWith('.')
    ? `${scopeId}.json`
    : `${sha256Hex(scopeId).slice(0, 32)}.json`;
}

export function baselinePath(userData: string, scopeId: string): string {
  return join(integrityDir(userData), baselineFileName(scopeId));
}

/** The stored baseline, or `null` when there is none or it does not parse (the scope re-baselines). */
export async function loadBaseline(userData: string, scopeId: string): Promise<IntegrityBaseline | null> {
  let text: string;
  try {
    text = await readFile(baselinePath(userData, scopeId), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = IntegrityBaselineSchema.safeParse(JSON.parse(text));
    return parsed.success && parsed.data.scopeId === scopeId ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveBaseline(userData: string, baseline: IntegrityBaseline): Promise<void> {
  const dir = integrityDir(userData);
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  await chmod(dir, DIR_MODE);
  const target = baselinePath(userData, baseline.scopeId);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(baseline)}\n`, { mode: FILE_MODE });
  await chmod(temp, FILE_MODE);
  await rename(temp, target);
}
