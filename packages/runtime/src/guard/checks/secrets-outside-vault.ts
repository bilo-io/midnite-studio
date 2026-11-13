import type { SecurityFinding } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';

export const SECRETS_OUTSIDE_VAULT_CHECK_ID = 'secrets-outside-vault';

/** One secret-shaped line in a file outside the vault. Carries the pattern kind and position, never the value. */
export interface DotfileSecret {
  file: string;
  line: number;
  pattern: string;
}

/** Home-relative files the sweep reads, besides every open repo's `.env*` files. */
export const DOTFILES: readonly string[] = [
  '.zshrc',
  '.zprofile',
  '.bashrc',
  '.profile',
  '.npmrc',
  '.netrc',
  '.pypirc',
  '.docker/config.json',
  '.aws/credentials',
  '.config/gh/hosts.yml',
];

/**
 * Theme D, secrets outside the vault: each hit is `high`, one finding per (file, pattern kind). The evidence is the
 * file and the pattern kind; the value is never copied. Moving it to the vault or redacting the line is the user's
 * edit (the `move-to-vault` and `redact-line` actions arrive with Theme G).
 */
export const secretsOutsideVaultCheck: GuardCheck = {
  id: SECRETS_OUTSIDE_VAULT_CHECK_ID,
  title: 'Secrets stored outside the vault',
  category: 'secret',
  needs: ['dotfileSecrets'],
  run(raw): SecurityFinding[] {
    const hits = (raw as { dotfileSecrets?: DotfileSecret[] }).dotfileSecrets ?? [];
    const byKey = new Map<string, DotfileSecret[]>();
    for (const h of hits) {
      const key = `${h.file}:${h.pattern}`;
      byKey.set(key, [...(byKey.get(key) ?? []), h]);
    }
    return [...byKey.entries()].map(([key, group]) => {
      const first = group[0]!;
      const lines = group.map((g) => g.line).join(', ');
      return createGuardFinding({
        check: secretsOutsideVaultCheck,
        subject: key,
        severity: 'high',
        title: `${first.pattern} in ${first.file}`,
        detail: `${first.file} holds a ${first.pattern} (line ${lines}) in plain text. Move it to the vault or an OS keychain, remove the line, and rotate it if the file has been shared or committed.`,
        evidence: [{ kind: 'path', path: first.file }],
      });
    });
  },
};
