import { copyFile, mkdtemp, readFile, readdir, rmdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanText } from '@midnite/studio-shared';

import {
  parseAutoUpdates,
  parseFileVault,
  parseFirewall,
  parseGatekeeper,
  parseLoaded,
  parseSip,
  type MacConfig,
  type ProbeState,
} from './checks/mac-config';
import { parseLsofListeners, type ListeningPort } from './checks/mac-ports';
import { DOTFILES, type DotfileSecret } from './checks/secrets-outside-vault';
import { parseAuthorizedKeys, type SshInputs, type SshKeyFile } from './checks/ssh-keys';
import type { ExecFile } from './software';

/*
 * Phase 122 Theme D probes. Each runs read-only binaries through the injected `exec` (no shell, never sudo: a test
 * greps this directory for it) and returns real data or throws, so a probe that cannot run is a skipped input
 * rather than a clean Mac.
 */

const attempt = async (run: () => Promise<ProbeState>): Promise<ProbeState> => {
  try {
    return await run();
  } catch {
    return 'unavailable';
  }
};

/** Does `launchctl print system/<label>` succeed (the service is loaded)? `null` when launchctl itself is missing. */
async function serviceLoaded(exec: ExecFile, label: string): Promise<boolean | null> {
  try {
    await exec('launchctl', ['print', `system/${label}`]);
    return true;
  } catch (e) {
    return (e as { code?: unknown }).code === 'ENOENT' ? null : false;
  }
}

export async function resolveMacConfig(exec: ExecFile): Promise<MacConfig> {
  const config: MacConfig = {
    fileVault: await attempt(async () => parseFileVault(await exec('fdesetup', ['status']))),
    firewall: await attempt(async () =>
      parseFirewall(await exec('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate'])),
    ),
    gatekeeper: await attempt(async () => parseGatekeeper(await exec('spctl', ['--status']))),
    sip: await attempt(async () => parseSip(await exec('csrutil', ['status']))),
    remoteLogin: await attempt(async () => parseLoaded(await serviceLoaded(exec, 'com.openssh.sshd'))),
    screenSharing: await attempt(async () => parseLoaded(await serviceLoaded(exec, 'com.apple.screensharing'))),
    // `softwareupdate -l` asks Apple's servers, which is network egress the registry does not carry; the rule and
    // parser are ready, the probe waits for Theme H's switch.
    pendingSecurityUpdates: 'unavailable',
    autoUpdates: await attempt(async () =>
      parseAutoUpdates(await exec('defaults', ['read', '/Library/Preferences/com.apple.SoftwareUpdate', 'AutomaticCheckEnabled'])),
    ),
  };
  if (Object.values(config).every((s) => s === 'unavailable')) throw new Error('no macOS setting could be read');
  return config;
}

/** Listening TCP sockets with each owner's signer. */
export async function resolveListeningPorts(exec: ExecFile): Promise<ListeningPort[]> {
  const listeners = parseLsofListeners(await exec('lsof', ['-iTCP', '-sTCP:LISTEN', '-nP', '-F', 'pcn']));
  const signerOf = new Map<number, ListeningPort['signer']>();
  for (const { pid } of listeners) {
    if (signerOf.has(pid)) continue;
    try {
      const path = (await exec('ps', ['-p', String(pid), '-o', 'comm='])).trim();
      try {
        const requirement = await exec('codesign', ['-dr', '-', path]);
        signerOf.set(pid, /designated => anchor apple(?! generic)/.test(requirement) ? 'apple' : 'signed');
      } catch {
        signerOf.set(pid, 'unsigned');
      }
    } catch {
      signerOf.set(pid, 'unknown');
    }
  }
  return listeners.map((l) => ({ ...l, signer: signerOf.get(l.pid) ?? 'unknown' }));
}

const PRIVATE_KEY_HEADER = /-----BEGIN (?:OPENSSH|RSA|DSA|EC|ENCRYPTED)? ?PRIVATE KEY-----/;

/** `~/.ssh` modes and passphrases, `authorized_keys` and `~/.gnupg` modes. A key is never modified; its passphrase is tried on a private copy that is removed straight away. */
export async function resolveSshInputs(exec: ExecFile, home: string): Promise<SshInputs> {
  const out: SshInputs = { files: [], authorizedKeys: [], gnupg: [] };
  const sshDir = join(home, '.ssh');
  let names: string[] = [];
  try {
    names = await readdir(sshDir);
  } catch {
    // no ~/.ssh
  }
  for (const name of names) {
    const path = join(sshDir, name);
    try {
      const st = await stat(path);
      if (!st.isFile()) continue;
      if (name === 'authorized_keys') {
        out.authorizedKeys.push(...parseAuthorizedKeys(path, await readFile(path, 'utf8')));
        continue;
      }
      if (st.size > 64 * 1024 || name.endsWith('.pub') || name === 'known_hosts' || name === 'config') continue;
      const head = (await readFile(path, 'utf8')).slice(0, 200);
      const isPrivateKey = PRIVATE_KEY_HEADER.test(head);
      const file: SshKeyFile = { path, mode: st.mode & 0o777, isPrivateKey, hasPassphrase: null };
      if (isPrivateKey) file.hasPassphrase = await keyHasPassphrase(exec, path);
      out.files.push(file);
    } catch {
      // unreadable: not reported
    }
  }
  try {
    const gnupg = join(home, '.gnupg');
    out.gnupg.push({ path: gnupg, mode: (await stat(gnupg)).mode & 0o777 });
    for (const name of await readdir(gnupg)) {
      const path = join(gnupg, name);
      out.gnupg.push({ path, mode: (await stat(path)).mode & 0o777 });
    }
  } catch {
    // no ~/.gnupg
  }
  return out;
}

async function keyHasPassphrase(exec: ExecFile, path: string): Promise<boolean | null> {
  let dir: string | null = null;
  const copy = async (): Promise<string> => {
    dir = await mkdtemp(join(tmpdir(), 'guard-key-'));
    const target = join(dir, 'key');
    await copyFile(path, target);
    return target;
  };
  let target: string | null = null;
  try {
    target = await copy();
    // Succeeds only when the key opens with an empty passphrase; rejects when a passphrase is needed.
    await exec('ssh-keygen', ['-y', '-P', '', '-f', target]);
    return false;
  } catch (e) {
    return target === null || (e as { code?: unknown }).code === 'ENOENT' ? null : true;
  } finally {
    if (target) await unlink(target).catch(() => undefined);
    if (dir) await rmdir(dir).catch(() => undefined);
  }
}

/** Secret-shaped lines in shell profiles, tool credentials and each open repo's `.env*` files. Only the file, line and pattern kind are kept. */
export async function resolveDotfileSecrets(home: string, repos: readonly string[]): Promise<DotfileSecret[]> {
  const files = DOTFILES.map((f) => join(home, f));
  for (const repo of repos) {
    try {
      for (const name of await readdir(repo)) if (name === '.env' || name.startsWith('.env.')) files.push(join(repo, name));
    } catch {
      // repo gone
    }
  }
  const out: DotfileSecret[] = [];
  let read = 0;
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    read++;
    for (const f of scanText(text, { file })) out.push({ file, line: f.line, pattern: f.pattern });
  }
  if (read === 0) throw new Error('no dotfile could be read');
  return out;
}
