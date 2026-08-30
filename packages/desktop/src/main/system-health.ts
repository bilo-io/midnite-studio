import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { preferredTargets } from './cli-path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

const execAsync = promisify(exec);

export type SystemHealth = {
  git: { path: string | null; version: string | null };
  shell: string | null;
  sshAgent: { running: boolean; keys: number };
  cli: { installed: boolean; path: string | null; target: string | null; managed: boolean };
};

export async function readSystemHealth(): Promise<SystemHealth> {
  let gitPath: string | null = '/usr/bin/git';
  let gitVersion: string | null = null;
  try {
    const { stdout } = await execAsync(`"${gitPath}" --version`);
    gitVersion = stdout.trim();
  } catch {
    gitPath = null;
    gitVersion = null;
  }

  const shell = process.env.SHELL || '/bin/zsh';

  let sshRunning = false;
  let sshKeys = 0;
  try {
    const { stdout } = await execAsync('ssh-add -l');
    sshRunning = true;
    if (!stdout.includes('The agent has no identities')) {
      sshKeys = stdout.trim().split('\n').length;
    }
  } catch (err: unknown) {
    const errorMsg = String(err);
    if (errorMsg.includes('The agent has no identities')) {
      sshRunning = true;
      sshKeys = 0;
    } else {
      sshRunning = false;
      sshKeys = 0;
    }
  }

  const targets = preferredTargets(homedir());
  let installed = false;
  let foundPath: string | null = null;
  let foundTarget: string | null = null;
  for (const t of targets) {
    if (existsSync(t)) {
      installed = true;
      foundPath = t;
      foundTarget = t;
      break;
    }
  }

  return {
    git: { path: gitPath, version: gitVersion },
    shell,
    sshAgent: { running: sshRunning, keys: sshKeys },
    cli: { installed, path: foundPath, target: foundTarget, managed: installed },
  };
}
