/**
 * The setup catalogue (Phase 98 Theme D) — every tool the setup overlay can
 * detect and offer to install, as data.
 *
 * One row per tool: how main finds it (`probe`), how the renderer installs it
 * (`install`, always a Homebrew line typed into a visible terminal — never a
 * headless install from main), and how a row draws it (`icon`, `brandColor`).
 * Themes E–I append rows here; the probe, the install runner and the status
 * row read them without changing.
 *
 * The renderer never sends main a binary name. `setupProbe` takes catalogue
 * **ids**, and main looks the probe up here, so the channel cannot be turned
 * into "run any binary with any argument". The `bin`/`versionArg`/`paths`
 * patterns below are the second fence: nothing shell-shaped can be declared.
 *
 * Icons are a `react-icons` set plus an export name (`si`/`SiGit`), resolved
 * in `app` (`features/setup/setup-icons.ts`) — this package imports zod and
 * nothing else, and a string pair is what lets a static catalogue name a glyph
 * without shared ever importing React.
 */
import { z } from 'zod';

export const SETUP_ITEM_GROUPS = ['core', 'forge-cli', 'agent-cli', 'js', 'containers', 'media'] as const;
export const SetupItemGroupSchema = z.enum(SETUP_ITEM_GROUPS);
export type SetupItemGroup = z.infer<typeof SetupItemGroupSchema>;

/** A `react-icons` glyph: its set's import suffix (`react-icons/<set>`) and export name. */
export const SetupIconRefSchema = z.object({
  set: z.enum(['lu', 'si']),
  name: z.string().regex(/^[A-Z][A-Za-z0-9]+$/),
});
export type SetupIconRef = z.infer<typeof SetupIconRefSchema>;

/** Exactly one of a formula or a cask — `.strict()` so an object carrying both is rejected, not read as the first. */
export const SetupBrewInstallSchema = z.union([
  z.object({ formula: z.string().regex(/^[a-z0-9@+._/-]+$/) }).strict(),
  z.object({ cask: z.string().regex(/^[a-z0-9@+._/-]+$/) }).strict(),
]);
export type SetupBrewInstall = z.infer<typeof SetupBrewInstallSchema>;

export const SetupItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  group: SetupItemGroupSchema,
  probe: z.object({
    /** A bare binary name, looked up in `paths` first and then with `which`. */
    bin: z.string().regex(/^[A-Za-z0-9._-]+$/),
    /** The one argument that prints a version, e.g. `--version` or `version`. */
    versionArg: z.string().regex(/^-{0,2}[A-Za-z0-9._=-]+$/),
    /** Known install locations, checked before `which`; `~/` expands to the home directory in main. */
    paths: z.array(z.string().regex(/^(~\/|\/)[^\0]*$/)),
  }),
  /**
   * How to install it, or `null` for a tool Homebrew does not install (brew
   * itself, which bootstraps from its own script). `xcodeClt` marks a tool
   * Apple's Command Line Tools also provide — git — so a Mac without brew can
   * still be offered `xcode-select --install`.
   */
  install: z
    .object({
      brew: SetupBrewInstallSchema,
      xcodeClt: z.boolean().optional(),
    })
    .nullable(),
  icon: SetupIconRefSchema,
  /** The tool's brand colour, `#rrggbb`, painted on its icon. */
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type SetupItem = z.infer<typeof SetupItemSchema>;

export const SETUP_CATALOGUE: readonly SetupItem[] = [
  {
    id: 'homebrew',
    label: 'Homebrew',
    group: 'core',
    probe: { bin: 'brew', versionArg: '--version', paths: ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'] },
    install: null,
    icon: { set: 'si', name: 'SiHomebrew' },
    brandColor: '#FBB040',
  },
  {
    id: 'git',
    label: 'git',
    group: 'core',
    probe: {
      bin: 'git',
      versionArg: '--version',
      paths: ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'],
    },
    install: { brew: { formula: 'git' }, xcodeClt: true },
    icon: { set: 'si', name: 'SiGit' },
    brandColor: '#F05032',
  },
  // --- Theme E: forge CLIs ---
  {
    id: 'gh',
    label: 'GitHub CLI',
    group: 'forge-cli',
    probe: { bin: 'gh', versionArg: '--version', paths: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'] },
    install: { brew: { formula: 'gh' } },
    icon: { set: 'si', name: 'SiGithub' },
    brandColor: '#8B949E',
  },
  {
    id: 'glab',
    label: 'GitLab CLI',
    group: 'forge-cli',
    probe: { bin: 'glab', versionArg: '--version', paths: ['/opt/homebrew/bin/glab', '/usr/local/bin/glab'] },
    install: { brew: { formula: 'glab' } },
    icon: { set: 'si', name: 'SiGitlab' },
    brandColor: '#FC6D26',
  },
  {
    id: 'az',
    label: 'Azure CLI',
    group: 'forge-cli',
    probe: { bin: 'az', versionArg: '--version', paths: ['/opt/homebrew/bin/az', '/usr/local/bin/az'] },
    install: { brew: { formula: 'azure-cli' } },
    icon: { set: 'lu', name: 'LuCloud' },
    brandColor: '#0078D4',
  },
  // --- Theme H: toolchain ---
  {
    id: 'claude',
    label: 'Claude Code',
    group: 'agent-cli',
    probe: { bin: 'claude', versionArg: '--version', paths: ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', '~/.claude/local/claude', '~/.local/bin/claude'] },
    install: { brew: { cask: 'claude-code' } },
    icon: { set: 'si', name: 'SiClaude' },
    brandColor: '#D97757',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    group: 'agent-cli',
    probe: { bin: 'codex', versionArg: '--version', paths: ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'] },
    install: { brew: { formula: 'codex' } },
    icon: { set: 'lu', name: 'LuBot' },
    brandColor: '#10A37F',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    group: 'agent-cli',
    probe: { bin: 'gemini', versionArg: '--version', paths: ['/opt/homebrew/bin/gemini', '/usr/local/bin/gemini'] },
    install: { brew: { formula: 'gemini-cli' } },
    icon: { set: 'si', name: 'SiGooglegemini' },
    brandColor: '#4285F4',
  },
  {
    id: 'node',
    label: 'Node.js',
    group: 'js',
    probe: { bin: 'node', versionArg: '--version', paths: ['/opt/homebrew/bin/node', '/usr/local/bin/node'] },
    install: { brew: { formula: 'node' } },
    icon: { set: 'si', name: 'SiNodedotjs' },
    brandColor: '#5FA04E',
  },
  {
    id: 'pnpm',
    label: 'pnpm',
    group: 'js',
    probe: { bin: 'pnpm', versionArg: '--version', paths: ['/opt/homebrew/bin/pnpm', '/usr/local/bin/pnpm'] },
    install: { brew: { formula: 'pnpm' } },
    icon: { set: 'si', name: 'SiPnpm' },
    brandColor: '#F69220',
  },
  {
    id: 'bun',
    label: 'Bun',
    group: 'js',
    probe: { bin: 'bun', versionArg: '--version', paths: ['/opt/homebrew/bin/bun', '/usr/local/bin/bun', '~/.bun/bin/bun'] },
    install: { brew: { formula: 'bun' } },
    icon: { set: 'si', name: 'SiBun' },
    brandColor: '#D9A679',
  },
  {
    id: 'proto',
    label: 'proto',
    group: 'js',
    probe: { bin: 'proto', versionArg: '--version', paths: ['/opt/homebrew/bin/proto', '/usr/local/bin/proto', '~/.proto/bin/proto'] },
    install: { brew: { formula: 'proto' } },
    icon: { set: 'si', name: 'SiMoonrepo' },
    brandColor: '#6F53F3',
  },
  {
    id: 'docker',
    label: 'Docker Desktop',
    group: 'containers',
    probe: { bin: 'docker', versionArg: '--version', paths: ['/opt/homebrew/bin/docker', '/usr/local/bin/docker', '/Applications/Docker.app/Contents/Resources/bin/docker'] },
    install: { brew: { cask: 'docker-desktop' } },
    icon: { set: 'si', name: 'SiDocker' },
    brandColor: '#2496ED',
  },
  {
    id: 'orbstack',
    label: 'OrbStack',
    group: 'containers',
    probe: { bin: 'orbctl', versionArg: 'version', paths: ['/opt/homebrew/bin/orbctl', '/usr/local/bin/orbctl', '~/.orbstack/bin/orbctl'] },
    install: { brew: { cask: 'orbstack' } },
    icon: { set: 'lu', name: 'LuBox' },
    brandColor: '#0F9BF1',
  },
  {
    id: 'ffmpeg',
    label: 'ffmpeg',
    group: 'media',
    probe: { bin: 'ffmpeg', versionArg: '-version', paths: ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'] },
    install: { brew: { formula: 'ffmpeg' } },
    icon: { set: 'si', name: 'SiFfmpeg' },
    brandColor: '#3DA638',
  },
  {
    id: 'ripgrep',
    label: 'ripgrep',
    group: 'media',
    probe: { bin: 'rg', versionArg: '--version', paths: ['/opt/homebrew/bin/rg', '/usr/local/bin/rg'] },
    install: { brew: { formula: 'ripgrep' } },
    icon: { set: 'lu', name: 'LuSearch' },
    brandColor: '#E5533D',
  },
  {
    id: 'jq',
    label: 'jq',
    group: 'media',
    probe: { bin: 'jq', versionArg: '--version', paths: ['/opt/homebrew/bin/jq', '/usr/local/bin/jq'] },
    install: { brew: { formula: 'jq' } },
    icon: { set: 'lu', name: 'LuBraces' },
    brandColor: '#9A9A9A',
  },
];

/** The container runtimes either of which satisfies the toolchain page's one "containers" item. */
export const CONTAINER_RUNTIME_IDS = ['docker', 'orbstack'] as const;

/** Forge → the catalogue CLI it uses; Bitbucket has no official CLI (`null`). Azure also needs the `azure-devops` extension. */
export const FORGE_CLI_ITEM: Readonly<Record<'github' | 'gitlab' | 'bitbucket' | 'azure', string | null>> = {
  github: 'gh',
  gitlab: 'glab',
  bitbucket: null,
  azure: 'az',
};

/** The oldest git the app's graph and worktree features are tested against. */
export const RECOMMENDED_GIT_VERSION = '2.30.0';

/** Whether dotted version `a` is at least `b` — numeric per segment, missing segments read as 0. */
export function versionAtLeast(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export function setupItem(id: string): SetupItem | undefined {
  return SETUP_CATALOGUE.find((item) => item.id === id);
}

// --- probe channel -------------------------------------------------------------

export const SetupProbeResultSchema = z.object({
  id: z.string().min(1),
  installed: z.boolean(),
  /** The first line the version argument printed, e.g. `git version 2.45.0`. */
  version: z.string().nullable(),
  path: z.string().nullable(),
});
export type SetupProbeResult = z.infer<typeof SetupProbeResultSchema>;

/** Catalogue ids to probe. An id the catalogue does not know is dropped from the answer, not guessed at. */
export const SetupProbeRequest = z.object({ ids: z.array(z.string().min(1)).min(1).max(64) });
export const SetupProbeResponse = z.object({ results: z.array(SetupProbeResultSchema) });
export type SetupProbeResponse = z.infer<typeof SetupProbeResponse>;

// --- install lines ---------------------------------------------------------------

/** Homebrew's own installer, verbatim from brew.sh. */
export const HOMEBREW_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

/** Apple's Command Line Tools — git without Homebrew. Opens the system's own installer dialog. */
export const XCODE_CLT_INSTALL_COMMAND = 'xcode-select --install';

/**
 * One shell line installing every ticked item Homebrew can: formulae first,
 * then casks, each deduplicated in first-seen order. `null` when none of them
 * is brew-installable.
 */
export function composeBrewInstall(items: readonly SetupItem[]): string | null {
  const formulae: string[] = [];
  const casks: string[] = [];
  for (const item of items) {
    const brew = item.install?.brew;
    if (!brew) continue;
    if ('formula' in brew) {
      if (!formulae.includes(brew.formula)) formulae.push(brew.formula);
    } else if (!casks.includes(brew.cask)) {
      casks.push(brew.cask);
    }
  }
  const lines: string[] = [];
  if (formulae.length > 0) lines.push(`brew install ${formulae.join(' ')}`);
  if (casks.length > 0) lines.push(`brew install --cask ${casks.join(' ')}`);
  return lines.length > 0 ? lines.join(' && ') : null;
}

export type SetupInstallOption = {
  id: 'brew' | 'homebrew-bootstrap' | 'xcode-clt';
  label: string;
  command: string;
};

/**
 * What the install runner can offer for `items`, best first.
 *
 * With brew, one brew line. Without it, Homebrew's installer comes before
 * anything else — and when a ticked item is one the Command Line Tools also
 * provide (git), `xcode-select --install` is offered beside it.
 */
export function planSetupInstall(items: readonly SetupItem[], brewInstalled: boolean): SetupInstallOption[] {
  const brewLine = composeBrewInstall(items);
  if (brewInstalled) {
    return brewLine ? [{ id: 'brew', label: 'Install with Homebrew', command: brewLine }] : [];
  }
  const options: SetupInstallOption[] = [];
  if (brewLine) {
    options.push({ id: 'homebrew-bootstrap', label: 'Install Homebrew first', command: HOMEBREW_INSTALL_COMMAND });
  }
  if (items.some((item) => item.install?.xcodeClt)) {
    options.push({
      id: 'xcode-clt',
      label: "Install Apple's Command Line Tools",
      command: XCODE_CLT_INSTALL_COMMAND,
    });
  }
  return options;
}

/** The numeric core of a probed version line — `git version 2.45.0 (Apple Git-154)` → `2.45.0`. */
export function setupVersionNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /(?:^|[^0-9.])v?(\d+\.\d+(?:\.\d+)?)/.exec(raw);
  return match?.[1] ?? null;
}
