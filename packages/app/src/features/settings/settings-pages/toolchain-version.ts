export type ToolchainToolId = 'homebrew' | 'node' | 'pnpm' | 'moon' | 'ollama';

export type ToolchainToolMeta = {
  id: ToolchainToolId;
  name: string;
  docsUrl: string;
  repoUrl: string;
};

export const TOOLCHAIN_TOOLS: Record<ToolchainToolId, ToolchainToolMeta> = {
  homebrew: {
    id: 'homebrew',
    name: 'Homebrew',
    docsUrl: 'https://brew.sh',
    repoUrl: 'https://github.com/Homebrew/brew',
  },
  node: {
    id: 'node',
    name: 'Node.js',
    docsUrl: 'https://nodejs.org',
    repoUrl: 'https://github.com/nodejs/node',
  },
  pnpm: {
    id: 'pnpm',
    name: 'pnpm',
    docsUrl: 'https://pnpm.io',
    repoUrl: 'https://github.com/pnpm/pnpm',
  },
  moon: {
    id: 'moon',
    name: 'moon (moonrepo)',
    docsUrl: 'https://moonrepo.dev',
    repoUrl: 'https://github.com/moonrepo/moon',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    docsUrl: 'https://ollama.com',
    repoUrl: 'https://github.com/ollama/ollama',
  },
};

/** Match the numeric core of a version line, e.g. `22.12.0`, `v22.12.0`, or `4.4.18`. */
const VERSION_RE = /(?:^|[^0-9])v?(\d+\.\d+(?:\.\d+)*)/i;

export type ParsedToolchainVersion = {
  /** Bare numeric version string, e.g. `22.12.0`. */
  number: string;
  /** Formatted label for display, e.g. `v22.12.0`. */
  label: string;
  /** URL for this release or version changelog. */
  url: string;
};

/**
 * Build upstream release URL on GitHub / official repo for a given tool and version.
 */
export function toolchainReleaseUrl(tool: ToolchainToolId, version: string): string {
  switch (tool) {
    case 'homebrew':
      return `https://github.com/Homebrew/brew/releases/tag/${version}`;
    case 'node':
      return `https://github.com/nodejs/node/releases/tag/v${version}`;
    case 'pnpm':
      return `https://github.com/pnpm/pnpm/releases/tag/v${version}`;
    case 'moon':
      return `https://github.com/moonrepo/moon/releases/tag/v${version}`;
    case 'ollama':
      return `https://github.com/ollama/ollama/releases/tag/v${version}`;
  }
}

/**
 * Extract clean version information and release links from raw tool output.
 */
export function parseToolchainVersion(
  tool: ToolchainToolId,
  raw: string | null | undefined,
): ParsedToolchainVersion | null {
  if (!raw) return null;
  const match = VERSION_RE.exec(raw);
  const number = match?.[1];
  if (!number) return null;
  const label = `v${number}`;
  const url = toolchainReleaseUrl(tool, number);
  return { number, label, url };
}
