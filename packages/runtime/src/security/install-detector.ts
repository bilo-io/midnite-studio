import type { InstallCandidate, PackageEcosystem } from '@midnite/studio-shared';

/**
 * Recognised package managers and their ecosystems (Phase 121 Theme H).
 */
type CommandPattern = {
  ecosystem: PackageEcosystem;
  /** Match the CLI binary and its install verb, e.g. "npm install" or "cargo add". */
  commandPrefix: RegExp;
  /** Regex identifying CLI flags to strip. */
  flagPattern: RegExp;
  /** Flag with arguments to skip (e.g. -w <workspace>, --features <feat>). */
  argFlags?: readonly string[];
  /** Parse a package token into name and version. */
  splitToken: (token: string) => { name: string; version?: string };
};

function splitNpmToken(token: string): { name: string; version?: string } {
  const clean = token.trim();
  if (clean.startsWith('@')) {
    const slash = clean.indexOf('/');
    if (slash === -1) return { name: clean };
    const at = clean.indexOf('@', slash + 1);
    if (at === -1) return { name: clean };
    return { name: clean.slice(0, at), version: clean.slice(at + 1) };
  }
  const at = clean.indexOf('@');
  if (at === -1) return { name: clean };
  return { name: clean.slice(0, at), version: clean.slice(at + 1) };
}

function splitPypiToken(token: string): { name: string; version?: string } {
  const clean = token.trim();
  const match = clean.match(/^([a-zA-Z0-9_.-]+)(?:([=><!~^]+)(.+))?$/);
  if (!match || !match[1]) return { name: clean };
  return { name: match[1], version: match[3] ? `${match[2] ?? ''}${match[3]}` : undefined };
}

function splitCargoToken(token: string): { name: string; version?: string } {
  return splitNpmToken(token);
}

function splitGenericToken(token: string): { name: string; version?: string } {
  const clean = token.trim();
  const at = clean.indexOf('@');
  if (at !== -1) {
    return { name: clean.slice(0, at), version: clean.slice(at + 1) };
  }
  return { name: clean };
}

const COMMAND_RULES: readonly CommandPattern[] = [
  {
    ecosystem: 'npm',
    commandPrefix: /^(?:npm\s+(?:i|install|add)|npx\s+(?:--yes\s+|-y\s+)?pnpm\s+(?:add|i|install))\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    argFlags: ['-w', '--workspace', '--prefix'],
    splitToken: splitNpmToken,
  },
  {
    ecosystem: 'npm',
    commandPrefix: /^pnpm\s+(?:add|install|i)\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    argFlags: ['--filter', '--prefix'],
    splitToken: splitNpmToken,
  },
  {
    ecosystem: 'npm',
    commandPrefix: /^yarn\s+add\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    argFlags: ['-W', '--cwd'],
    splitToken: splitNpmToken,
  },
  {
    ecosystem: 'pypi',
    commandPrefix: /^(?:pip\s+install|pip3\s+install|python\s+-m\s+pip\s+install)\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    argFlags: ['-r', '--requirement', '-t', '--target', '-i', '--index-url'],
    splitToken: splitPypiToken,
  },
  {
    ecosystem: 'pypi',
    commandPrefix: /^pipx\s+(?:install|run)\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    splitToken: splitPypiToken,
  },
  {
    ecosystem: 'pypi',
    commandPrefix: /^uv\s+(?:add|pip\s+install)\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    argFlags: ['-r', '--requirement'],
    splitToken: splitPypiToken,
  },
  {
    ecosystem: 'cargo',
    commandPrefix: /^cargo\s+add\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    argFlags: ['--features', '-F', '--path', '--git'],
    splitToken: splitCargoToken,
  },
  {
    ecosystem: 'homebrew',
    commandPrefix: /^brew\s+install\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    splitToken: splitGenericToken,
  },
  {
    ecosystem: 'rubygems',
    commandPrefix: /^gem\s+install\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    argFlags: ['-v', '--version'],
    splitToken: splitGenericToken,
  },
  {
    ecosystem: 'go',
    commandPrefix: /^go\s+get\b/i,
    flagPattern: /^-[a-zA-Z]|--[a-zA-Z0-9_-]+$/,
    splitToken: splitGenericToken,
  },
];

/**
 * Parse an install command from the terminal or an agent tool call into candidate packages.
 */
export function parseInstallCommand(commandLine: string): InstallCandidate[] {
  const trimmed = commandLine.trim();
  if (!trimmed) return [];

  for (const rule of COMMAND_RULES) {
    const match = trimmed.match(rule.commandPrefix);
    if (!match) continue;

    const remainder = trimmed.slice(match[0].length).trim();
    if (!remainder) continue;

    const rawTokens = remainder.split(/\s+/).filter(Boolean);
    const candidates: InstallCandidate[] = [];

    let skipNext = false;
    for (let i = 0; i < rawTokens.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      const token = rawTokens[i]!;

      // Handle flag arguments that consume the next token (e.g. -w <workspace>)
      if (rule.argFlags?.some((f) => token === f || token.startsWith(`${f}=`))) {
        if (!token.includes('=')) {
          skipNext = true;
        }
        continue;
      }

      // Skip flags and option arguments
      if (rule.flagPattern.test(token)) continue;

      // Skip file paths or URLs
      if (token.startsWith('.') || token.startsWith('/') || token.startsWith('http://') || token.startsWith('https://')) {
        continue;
      }

      const { name, version } = rule.splitToken(token);
      if (name && !name.startsWith('-')) {
        candidates.push({
          ecosystem: rule.ecosystem,
          name,
          version: version || undefined,
          source: 'command',
          command: trimmed,
        });
      }
    }

    if (candidates.length > 0) return candidates;
  }

  return [];
}

/**
 * Parse newly added candidate packages from a lockfile diff.
 */
export function parseLockfileDiff(filename: string, diffText: string): InstallCandidate[] {
  const basename = filename.split('/').pop() ?? filename;
  const candidates: InstallCandidate[] = [];
  const lines = diffText.split('\n');

  if (basename === 'package-lock.json') {
    // Look for added lines in package-lock.json:
    // e.g. +    "node_modules/lodash": {
    // e.g. +      "version": "4.17.21",
    let currentPkg: string | null = null;
    for (const line of lines) {
      if (!line.startsWith('+')) continue;
      const nodeModulesMatch = line.match(/^\+\s*"node_modules\/((?:@[^"/]+\/)?[^"/]+)":\s*\{/);
      if (nodeModulesMatch?.[1]) {
        currentPkg = nodeModulesMatch[1];
        candidates.push({
          ecosystem: 'npm',
          name: currentPkg,
          source: 'lockfile',
          lockfile: filename,
        });
        continue;
      }
      if (currentPkg) {
        const verMatch = line.match(/^\+\s*"version":\s*"([^"]+)"/);
        if (verMatch?.[1]) {
          const last = candidates[candidates.length - 1];
          if (last && last.name === currentPkg) {
            last.version = verMatch[1];
          }
          currentPkg = null;
        }
      }
    }
    return dedupeCandidates(candidates);
  }

  if (basename === 'pnpm-lock.yaml') {
    // e.g. +  /@scope/pkg@1.0.0: or +  /lodash@4.17.21:
    for (const line of lines) {
      if (!line.startsWith('+')) continue;
      const match = line.match(/^\+\s+['"]?\/((?:@[^/@\s]+\/)?[^/@\s]+)@([^:'"\s]+)/);
      if (match?.[1]) {
        candidates.push({
          ecosystem: 'npm',
          name: match[1],
          version: match[2],
          source: 'lockfile',
          lockfile: filename,
        });
      }
    }
    return dedupeCandidates(candidates);
  }

  if (basename === 'yarn.lock') {
    // e.g. +  "lodash@^4.17.21":
    // e.g. +  version "4.17.21"
    let currentPkg: string | null = null;
    for (const line of lines) {
      if (!line.startsWith('+')) continue;
      const headerMatch = line.match(/^\+\s*"?((?:@[^/@\s]+\/)?[^/@\s]+)@[^":]+"?:/);
      if (headerMatch?.[1]) {
        currentPkg = headerMatch[1];
        candidates.push({
          ecosystem: 'npm',
          name: currentPkg,
          source: 'lockfile',
          lockfile: filename,
        });
        continue;
      }
      if (currentPkg) {
        const verMatch = line.match(/^\+\s*version\s+"([^"]+)"/);
        if (verMatch?.[1]) {
          const last = candidates[candidates.length - 1];
          if (last && last.name === currentPkg) {
            last.version = verMatch[1];
          }
          currentPkg = null;
        }
      }
    }
    return dedupeCandidates(candidates);
  }

  if (basename === 'Cargo.lock') {
    // e.g.
    // +[[package]]
    // +name = "serde"
    // +version = "1.0.197"
    let inPackage = false;
    let currentName: string | null = null;
    for (const line of lines) {
      if (line.includes('[[package]]')) {
        inPackage = true;
        currentName = null;
        continue;
      }
      if (inPackage) {
        const nameMatch = line.match(/^\+\s*name\s*=\s*"([^"]+)"/);
        if (nameMatch?.[1]) {
          currentName = nameMatch[1];
          continue;
        }
        const verMatch = line.match(/^\+\s*version\s*=\s*"([^"]+)"/);
        if (verMatch?.[1] && currentName) {
          candidates.push({
            ecosystem: 'cargo',
            name: currentName,
            version: verMatch[1],
            source: 'lockfile',
            lockfile: filename,
          });
          inPackage = false;
          currentName = null;
        }
      }
    }
    return dedupeCandidates(candidates);
  }

  if (basename === 'requirements.txt' || basename === 'uv.lock') {
    for (const line of lines) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      const content = line.slice(1).trim();
      if (!content || content.startsWith('#')) continue;
      const { name, version } = splitPypiToken(content);
      if (name) {
        candidates.push({
          ecosystem: 'pypi',
          name,
          version,
          source: 'lockfile',
          lockfile: filename,
        });
      }
    }
    return dedupeCandidates(candidates);
  }

  return [];
}

function dedupeCandidates(candidates: InstallCandidate[]): InstallCandidate[] {
  const map = new Map<string, InstallCandidate>();
  for (const c of candidates) {
    const key = `${c.ecosystem}:${c.name}:${c.version ?? '*'}`;
    if (!map.has(key)) map.set(key, c);
  }
  return [...map.values()];
}
