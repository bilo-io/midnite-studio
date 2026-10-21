import { Tooltip } from '../../components/tooltip';
import { bridge } from '../../services/bridge';
import { openExternal } from '../../services/queries';

/**
 * The right-hand slot of a setup row: a detected version or a binary path,
 * muted and tabular. A version opens the tool's release notes in the browser;
 * a path reveals the binary in Finder. A tool with no known notes URL renders
 * its version as plain text.
 */

/** Release notes / changelog page per catalogue id. `{v}` is the bare semver. */
export const RELEASE_NOTES_URL: Readonly<Record<string, string>> = {
  homebrew: 'https://github.com/Homebrew/brew/releases',
  git: 'https://github.com/git/git/tags',
  gh: 'https://github.com/cli/cli/releases',
  glab: 'https://gitlab.com/gitlab-org/cli/-/releases',
  az: 'https://github.com/Azure/azure-cli/releases',
  claude: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
  codex: 'https://github.com/openai/codex/releases',
  gemini: 'https://github.com/google-gemini/gemini-cli/releases',
  node: 'https://nodejs.org/en/blog/release/v{v}',
  pnpm: 'https://github.com/pnpm/pnpm/releases',
  bun: 'https://github.com/oven-sh/bun/releases',
  proto: 'https://github.com/moonrepo/proto/releases',
  docker: 'https://docs.docker.com/desktop/release-notes/',
  orbstack: 'https://docs.orbstack.dev/release-notes',
  ffmpeg: 'https://ffmpeg.org/index.html#news',
  ripgrep: 'https://github.com/BurntSushi/ripgrep/releases',
  jq: 'https://github.com/jqlang/jq/releases',
  ollama: 'https://github.com/ollama/ollama/releases',
  midnite: 'https://github.com/bilo-io/midnite-apps/releases',
};

const SEMVER = /\d+(?:\.\d+)+/;

/** The version as shown: a trailing "(Claude Code)"-style suffix is dropped when it only repeats the name. */
export function displayVersion(raw: string, label: string): string {
  const trimmed = raw.trim();
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(trimmed);
  if (!m) return trimmed;
  const suffix = m[2]!.toLowerCase();
  const name = label.toLowerCase();
  const repeats = suffix.includes(name) || name.includes(suffix) || name.split(/\s+/).some((w) => w.length > 2 && suffix.includes(w));
  return repeats && m[1] ? m[1] : trimmed;
}

/** The release-notes URL for a tool's version, or `undefined` when none is known. */
export function releaseNotesUrl(toolId: string, version: string): string | undefined {
  const template = RELEASE_NOTES_URL[toolId];
  if (!template) return undefined;
  if (!template.includes('{v}')) return template;
  const semver = SEMVER.exec(version)?.[0];
  return semver ? template.replace('{v}', semver) : undefined;
}

const META_CLASS = 'max-w-[40%] shrink-0 truncate text-right text-xs tabular-nums text-muted-foreground';
const LINK_CLASS = `${META_CLASS} rounded px-1 underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary`;

export type SetupMetaProps =
  | { kind: 'version'; toolId: string; label: string; version: string }
  | { kind: 'path'; toolId: string; label: string; path: string };

export function SetupMeta(props: SetupMetaProps) {
  if (props.kind === 'path') {
    const { toolId, label, path } = props;
    return (
      <Tooltip label="Open in Finder" side="top">
        <button
          type="button"
          data-testid="setup-meta"
          aria-label={`Open ${label} in Finder`}
          onClick={(e) => {
            e.stopPropagation();
            void bridge()?.setup.reveal({ id: toolId });
          }}
          className={LINK_CLASS}
        >
          {path}
        </button>
      </Tooltip>
    );
  }
  const { toolId, label, version } = props;
  const text = displayVersion(version, label);
  const url = releaseNotesUrl(toolId, version);
  if (!url) {
    return (
      <span data-testid="setup-meta" className={META_CLASS}>
        {text}
      </span>
    );
  }
  return (
    <Tooltip label="Release notes" side="top">
      <button
        type="button"
        data-testid="setup-meta"
        aria-label={`${label} ${text} release notes`}
        onClick={(e) => {
          e.stopPropagation();
          openExternal(url);
        }}
        className={LINK_CLASS}
      >
        {text}
      </button>
    </Tooltip>
  );
}
