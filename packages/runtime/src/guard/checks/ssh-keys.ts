import type { SecurityFinding } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';

export const SSH_KEYS_CHECK_ID = 'ssh-keys';

export interface SshKeyFile {
  /** Absolute path. */
  path: string;
  /** Permission bits (`stat.mode & 0o777`). */
  mode: number;
  /** A private key by its PEM/OpenSSH header. */
  isPrivateKey: boolean;
  /** `false` when `ssh-keygen -y -P ''` read it on a copy (no passphrase); `null` when it could not be tried. */
  hasPassphrase: boolean | null;
}

export interface AuthorizedKeyEntry {
  path: string;
  line: number;
  /** The key's comment, never the key material. */
  comment: string;
  /** Options before the key type (`command="..."`, `from="..."`), if any. */
  options: string;
}

export interface SshInputs {
  files: SshKeyFile[];
  authorizedKeys: AuthorizedKeyEntry[];
  /** Files in `~/.gnupg` with their modes. */
  gnupg: { path: string; mode: number }[];
}

const octal = (mode: number): string => `0${(mode & 0o777).toString(8)}`;

/** Parses one `authorized_keys` file. The key material is dropped; options and the comment are kept. */
export function parseAuthorizedKeys(path: string, text: string): AuthorizedKeyEntry[] {
  const out: AuthorizedKeyEntry[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const m = /(?:^|\s)((?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-\S+|sk-\S+))\s+\S+(?:\s+(.*))?$/.exec(line);
    if (!m) return;
    out.push({ path, line: i + 1, comment: m[2]?.trim() ?? '', options: line.slice(0, m.index).trim() });
  });
  return out;
}

/**
 * Theme D, keys: a private key readable by group or others is `high` with `chmod-600`; one without a passphrase is
 * `medium`; `authorized_keys` entries carrying `command=`/`from=` options are listed as `info` so the user can say
 * whether they set them; `~/.gnupg`, its private-keys-v1.d and secring.gpg when open to group or others are `medium`. The age check on
 * `authorized_keys` entries needs the file's mtime, which a line does not carry, so it is not attempted.
 */
export const sshKeysCheck: GuardCheck = {
  id: SSH_KEYS_CHECK_ID,
  title: 'SSH and GPG key hygiene',
  category: 'config',
  needs: ['sshKeys'],
  run(raw): SecurityFinding[] {
    const input = (raw as { sshKeys?: Partial<SshInputs> }).sshKeys ?? {};
    const findings: SecurityFinding[] = [];
    for (const f of input.files ?? []) {
      if (!f.isPrivateKey) continue;
      if ((f.mode & 0o077) !== 0) {
        findings.push(
          createGuardFinding({
            check: sshKeysCheck,
            subject: `mode:${f.path}`,
            severity: 'high',
            title: `Private key ${f.path} is readable by others (${octal(f.mode)})`,
            detail: `ssh refuses keys like this, and any local account can read it. Set it to 0600.`,
            evidence: [{ kind: 'path', path: f.path, mode: f.mode & 0o777 }],
            remediation: [{ id: 'chmod-600', path: f.path }],
          }),
        );
      }
      if (f.hasPassphrase === false) {
        findings.push(
          createGuardFinding({
            check: sshKeysCheck,
            subject: `passphrase:${f.path}`,
            severity: 'medium',
            title: `Private key ${f.path} has no passphrase`,
            detail: `Anyone who copies the file can use it. Add one: ssh-keygen -p -f ${f.path}`,
            evidence: [{ kind: 'path', path: f.path }, { kind: 'command', command: 'ssh-keygen', args: ['-p', '-f', f.path] }],
          }),
        );
      }
    }
    for (const e of input.authorizedKeys ?? []) {
      if (!/\b(command|from)=/.test(e.options)) continue;
      findings.push(
        createGuardFinding({
          check: sshKeysCheck,
          subject: `authorized:${e.path}:${e.comment || e.line}`,
          severity: 'info',
          title: `authorized_keys entry with options${e.comment ? ` (${e.comment})` : ''}`,
          detail: `${e.path} line ${e.line} restricts or runs a command for this key. Check you set it: ${e.options.slice(0, 120)}`,
          evidence: [{ kind: 'path', path: e.path }],
        }),
      );
    }
    for (const g of input.gnupg ?? []) {
      if ((g.mode & 0o077) === 0) continue;
      findings.push(
        createGuardFinding({
          check: sshKeysCheck,
          subject: `gnupg:${g.path}`,
          severity: 'medium',
          title: `${g.path} is open to group or others (${octal(g.mode)})`,
          detail: 'GnuPG expects its home to be private. Run chmod go-rwx on it.',
          evidence: [{ kind: 'path', path: g.path, mode: g.mode & 0o777 }],
        }),
      );
    }
    return findings;
  },
};
