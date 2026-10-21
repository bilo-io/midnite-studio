import { constants } from 'node:fs';
import { chmod, copyFile, cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  VAULT_NAMESPACES,
  decryptSecret,
  encryptSecret,
  type VaultCipher,
} from '@midnite/studio-runtime';

/**
 * Every name `app.setName` has used before the current one, newest first.
 *
 * On macOS `app.getPath('userData')` is `~/Library/Application Support/<app
 * name>`, so renaming the app silently moves the data directory: the user's
 * open-repository list is still on disk, just under a path nothing reads any
 * more. That reads as "the app forgot my repos" rather than as a rename.
 *
 * A list, not one name, because there have now been two renames — the
 * display-name change to "Midnite Git", then the product rename to "Midnite
 * Studio". Someone who skipped a version has their data under the oldest of
 * these, and newest-first ordering means the freshest list wins.
 */
export const LEGACY_APP_NAMES = ['Midnite Git', 'midnite-git'] as const;

/** The only file worth carrying over; everything else in userData is Chromium cache. */
const FILE_NAME = 'repos.json';

/**
 * Copy the persisted repository list out of a pre-rename userData directory.
 *
 * Copy, not move: leaving the legacy directory intact means a downgrade to an
 * older build still finds its data, and the cost is one small JSON file.
 *
 * Returns whether anything was migrated, so the caller can log it once.
 */
export async function migrateLegacyRepoStore(
  legacyDirectory: string,
  currentDirectory: string,
): Promise<boolean> {
  // Same directory — either the rename has not happened on this platform or the
  // legacy name is the current one. Nothing to do, and copying a file onto
  // itself would truncate it.
  if (legacyDirectory === currentDirectory) return false;

  try {
    await mkdir(currentDirectory, { recursive: true });
    // `COPYFILE_EXCL` makes "already migrated" and "user already has a list"
    // the same cheap check as the copy itself: the call fails rather than
    // overwriting a newer list with the stale pre-rename one.
    await copyFile(
      join(legacyDirectory, FILE_NAME),
      join(currentDirectory, FILE_NAME),
      constants.COPYFILE_EXCL,
    );
    return true;
  } catch {
    // No legacy file (clean install), a destination that already exists, or an
    // unreadable data dir. All three mean "boot normally with what's there".
    return false;
  }
}

/**
 * Try every legacy name in turn, stopping at the first that yields data.
 *
 * `COPYFILE_EXCL` inside `migrateLegacyRepoStore` already makes a second
 * successful copy impossible, so stopping early is about not doing pointless
 * filesystem work rather than about correctness.
 */
export async function migrateAnyLegacyRepoStore(
  legacyDirectoryFor: (name: string) => string,
  currentDirectory: string,
): Promise<string | null> {
  for (const name of LEGACY_APP_NAMES) {
    if (await migrateLegacyRepoStore(legacyDirectoryFor(name), currentDirectory)) return name;
  }
  return null;
}

/* ------------------------------------------------------------------------- *
 * Phase 113 Theme G — Studio's userData -> the runtime's data directory.
 * ------------------------------------------------------------------------- */

/** Written last, in the runtime directory, once the copy has been verified. */
export const STUDIO_MIGRATION_MARKER = '.studio-migration.json';

/** Plain JSON state that moves verbatim: repos, windows, sessions, settings. */
export const STUDIO_STATE_FILES = [
  'repos.json',
  'windows.json',
  'windows-reopen.json',
  'terminals.json',
  'session-history.json',
  'trust.json',
  'companion.json',
  'councils.json',
  'council-runs.json',
  'agents.json',
  'workflows.json',
  'workflow-templates.json',
  'workflow-runs.json',
  'loop-runs.json',
  'mcp.json',
  'db-connections.json',
  'forge-accounts.json',
  'gitlab-languages.json',
  'ollama-settings.json',
  'games-settings.json',
  'video-settings.json',
  'map-settings.json',
  'portfolio.json',
  'consent.json',
  'installed.json',
] as const;

/**
 * Directories that move verbatim. `Local Storage` is where the renderer's
 * persisted settings (the zustand `ui-store` blob) live, so without it a
 * migrated user opens to default settings.
 */
export const STUDIO_STATE_DIRECTORIES = ['Local Storage'] as const;

/**
 * Encrypted files. `safeStorage` keys are tied to the app's keychain identity
 * (Electron's "<app name> Safe Storage" item), so a byte copy is NOT valid for
 * a differently named runtime: its cipher cannot open Studio's ciphertext.
 * Each entry is therefore decrypted with the source cipher and re-encrypted
 * with the target one, then read back to verify.
 */
const STUDIO_VAULT_FILES: readonly VaultFileSpec[] = [
  { file: VAULT_NAMESPACES.secrets.fileName, shape: 'entries' },
  { file: VAULT_NAMESPACES['forge-accounts'].fileName, shape: 'entries' },
  { file: VAULT_NAMESPACES['db-credentials'].fileName, shape: 'entries' },
  // The recogniser key: a fourth store (`{ keys: { provider: base64 } }`).
  { file: 'companion-stt.vault.json', shape: 'keys' },
];

type VaultFileSpec = { file: string; shape: 'entries' | 'keys' };

export type UnportedVaultEntry = {
  file: string;
  key: string;
  reason: 'source-undecryptable' | 'target-unverifiable';
};

export type StudioMigrationResult =
  | { status: 'disabled' | 'same-directory' | 'already-migrated' | 'nothing-to-migrate' }
  | { status: 'failed'; reason: string }
  | {
      status: 'migrated';
      backupDirectory: string;
      files: string[];
      directories: string[];
      /** Destination already had one; the runtime's own copy wins, the source is untouched. */
      skippedExisting: string[];
      vaultEntries: number;
      /** Never dropped silently: still in the source and the backup, reported here and in the marker. */
      unportedVaultEntries: UnportedVaultEntry[];
    };

export type StudioMigrationOptions = {
  /** Off until the runtime build turns it on (Themes G3 / F1). Today's Studio build passes false. */
  enabled: boolean;
  /** Studio's `userData`. */
  sourceDirectory: string;
  /** The runtime's data directory (`runtimeDataDirectory(appData)`). */
  targetDirectory: string;
  /** Opens Studio's vault ciphertext (the Studio keychain identity). */
  sourceCipher: VaultCipher;
  /** Encrypts under the runtime's keychain identity. */
  targetCipher: VaultCipher;
  now?: () => Date;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Every file under `dir`, relative, with its size — the cheap tree check. */
async function listTree(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const rel = join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...(await listTree(dir, rel)));
    else out.push(`${rel}:${(await stat(join(dir, rel))).size}`);
  }
  return out.sort();
}

async function sameBytes(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([readFile(a), readFile(b)]);
  return x.equals(y);
}

/**
 * Move a current Studio user's state to the runtime's data directory.
 *
 * Order is the safety argument: (1) a timestamped backup of everything about
 * to be read, before anything is written; (2) copy, never overwriting a file
 * the runtime already has; (3) verify every copy (bytes, tree listing, vault
 * read-back); (4) only then write the marker. The source is never touched, so
 * a downgrade still boots and nothing is lost. A failure leaves no marker, so
 * the next launch retries; the idempotent copy makes that safe.
 */
export async function migrateStudioToRuntime(
  options: StudioMigrationOptions,
): Promise<StudioMigrationResult> {
  const { enabled, sourceDirectory, targetDirectory, sourceCipher, targetCipher } = options;
  if (!enabled) return { status: 'disabled' };
  if (sourceDirectory === targetDirectory) return { status: 'same-directory' };
  if (await exists(join(targetDirectory, STUDIO_MIGRATION_MARKER))) {
    return { status: 'already-migrated' };
  }

  const files: string[] = [];
  for (const name of STUDIO_STATE_FILES) if (await exists(join(sourceDirectory, name))) files.push(name);
  const directories: string[] = [];
  for (const name of STUDIO_STATE_DIRECTORIES) {
    if (await exists(join(sourceDirectory, name))) directories.push(name);
  }
  const vaultFiles: VaultFileSpec[] = [];
  for (const spec of STUDIO_VAULT_FILES) {
    if (await exists(join(sourceDirectory, spec.file))) vaultFiles.push(spec);
  }
  if (files.length + directories.length + vaultFiles.length === 0) {
    return { status: 'nothing-to-migrate' };
  }

  const now = (options.now ?? (() => new Date()))();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupDirectory = join(targetDirectory, 'backups', `studio-${stamp}`);

  try {
    // 1. Backup first. Only the state we read, not Chromium's caches.
    await mkdir(backupDirectory, { recursive: true });
    for (const name of [...files, ...vaultFiles.map((v) => v.file)]) {
      await copyFile(join(sourceDirectory, name), join(backupDirectory, name));
    }
    for (const name of directories) {
      await cp(join(sourceDirectory, name), join(backupDirectory, name), { recursive: true });
    }

    // 2 + 3. Plain files and directories: copy without overwrite, verify.
    const skippedExisting: string[] = [];
    for (const name of files) {
      const to = join(targetDirectory, name);
      if (await exists(to)) {
        skippedExisting.push(name);
        continue;
      }
      await copyFile(join(sourceDirectory, name), to, constants.COPYFILE_EXCL);
      if (!(await sameBytes(join(sourceDirectory, name), to))) {
        return { status: 'failed', reason: `verification failed for ${name}` };
      }
    }
    for (const name of directories) {
      const to = join(targetDirectory, name);
      if (await exists(to)) {
        skippedExisting.push(name);
        continue;
      }
      await cp(join(sourceDirectory, name), to, { recursive: true, errorOnExist: true, force: false });
      const [a, b] = await Promise.all([listTree(join(sourceDirectory, name)), listTree(to)]);
      if (a.join('\n') !== b.join('\n')) {
        return { status: 'failed', reason: `verification failed for ${name}/` };
      }
    }

    // Vaults: re-encrypt, never byte-copy.
    const unported: UnportedVaultEntry[] = [];
    let vaultEntries = 0;
    for (const spec of vaultFiles) {
      const result = await reencryptVault(spec, sourceDirectory, targetDirectory, sourceCipher, targetCipher);
      vaultEntries += result.carried;
      unported.push(...result.unported);
    }

    // 4. Marker last, carrying the report.
    await writeFile(
      join(targetDirectory, STUDIO_MIGRATION_MARKER),
      `${JSON.stringify(
        {
          version: 1,
          migratedAt: now.toISOString(),
          source: sourceDirectory,
          backupDirectory,
          files,
          directories,
          skippedExisting,
          vaultEntries,
          unportedVaultEntries: unported,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    return {
      status: 'migrated',
      backupDirectory,
      files,
      directories,
      skippedExisting,
      vaultEntries,
      unportedVaultEntries: unported,
    };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

async function reencryptVault(
  spec: VaultFileSpec,
  sourceDirectory: string,
  targetDirectory: string,
  sourceCipher: VaultCipher,
  targetCipher: VaultCipher,
): Promise<{ carried: number; unported: UnportedVaultEntry[] }> {
  const unported: UnportedVaultEntry[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(sourceDirectory, spec.file), 'utf8'));
  } catch {
    // An unreadable source file: the backup holds it; there is nothing to carry.
    return { carried: 0, unported };
  }
  const rows = isRecord(parsed) && isRecord(parsed[spec.shape]) ? parsed[spec.shape] : {};
  const bag = rows as Record<string, unknown>;

  // Merge over whatever the runtime already holds: its own entries win.
  const targetFile = join(targetDirectory, spec.file);
  let existing: Record<string, unknown> = {};
  try {
    const current: unknown = JSON.parse(await readFile(targetFile, 'utf8'));
    if (isRecord(current) && isRecord(current[spec.shape])) {
      existing = current[spec.shape] as Record<string, unknown>;
    }
  } catch {
    existing = {};
  }

  const out: Record<string, unknown> = { ...existing };
  let carried = 0;
  for (const [key, row] of Object.entries(bag)) {
    if (key in existing) continue;
    const blob = spec.shape === 'keys' ? row : isRecord(row) ? row['encrypted'] : undefined;
    if (typeof blob !== 'string') continue;
    const plaintext = decryptSecret(sourceCipher, blob);
    if (plaintext === null || !targetCipher.isEncryptionAvailable()) {
      unported.push({ file: spec.file, key, reason: 'source-undecryptable' });
      continue;
    }
    const reencrypted = encryptSecret(targetCipher, plaintext);
    if (decryptSecret(targetCipher, reencrypted) !== plaintext) {
      unported.push({ file: spec.file, key, reason: 'target-unverifiable' });
      continue;
    }
    out[key] = spec.shape === 'keys' ? reencrypted : { ...(row as object), encrypted: reencrypted };
    carried += 1;
  }

  if (carried > 0) {
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(targetFile, `${JSON.stringify({ version: 1, [spec.shape]: out }, null, 2)}\n`, 'utf8');
    await chmod(targetFile, 0o600);
  }
  return { carried, unported };
}
