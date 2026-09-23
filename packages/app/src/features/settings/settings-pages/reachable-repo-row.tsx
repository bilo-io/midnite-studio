import type { ReactNode } from 'react';
import { LuGitBranch, LuLock, LuStar } from 'react-icons/lu';

import type { ReachableRepo } from '@midnite/studio-shared';

import type { IconComponent } from '../../../components/icon-button';

/**
 * "updated 3w ago" — coarser than the app's other `relativeAge` copies
 * (which stop at days), because a repo listing spans months and years and
 * "412d ago" reads worse than "1y ago". An unparseable timestamp is `null`
 * so the row simply omits the segment.
 */
export function relativeUpdated(iso: string, now: number): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86_400);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * GitHub linguist's colours for the languages a repo listing most often
 * shows — `gh repo list --json languages` returns names and byte sizes but
 * not the colour, so the common ones are carried here. Anything else falls
 * back to a stable hashed hue ({@link languageColor}).
 */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  'Objective-C': '#438eff',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#663399',
  SCSS: '#c6538c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Dart: '#00B4AB',
  Elixir: '#6e4a7e',
  Scala: '#c22d40',
  Lua: '#000080',
  Dockerfile: '#384d54',
  HCL: '#844FBA',
  Makefile: '#427819',
  MDX: '#fcb32c',
  Nix: '#7e7eff',
  Zig: '#ec915c',
};

export function languageColor(name: string): string {
  const known = LANGUAGE_COLORS[name];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 55% 55%)`;
}

export interface LanguageShare {
  name: string;
  /** 0-100, rounded to one decimal place. */
  percent: number;
  color: string;
}

/** How many languages get their own segment before the rest fold into "Other". */
const MAX_LANGUAGE_SEGMENTS = 5;

/**
 * Byte sizes → percentage shares, largest first, with the long tail folded
 * into one "Other" segment so a repo with twenty languages still draws a
 * legible bar. Empty (or all-zero) input is `[]`, which the row reads as
 * "no bar".
 */
export function languageShares(languages: ReachableRepo['languages']): LanguageShare[] {
  if (!languages || languages.length === 0) return [];
  const total = languages.reduce((sum, l) => sum + l.size, 0);
  if (total <= 0) return [];
  const sorted = [...languages].sort((a, b) => b.size - a.size);
  const head = sorted.slice(0, MAX_LANGUAGE_SEGMENTS);
  const tail = sorted.slice(MAX_LANGUAGE_SEGMENTS);
  const toPercent = (size: number) => Math.round((size / total) * 1000) / 10;
  const shares = head.map((l) => ({ name: l.name, percent: toPercent(l.size), color: languageColor(l.name) }));
  const tailSize = tail.reduce((sum, l) => sum + l.size, 0);
  if (tailSize > 0) shares.push({ name: 'Other', percent: toPercent(tailSize), color: 'var(--muted-foreground)' });
  return shares;
}

function LanguageBar({ shares }: { shares: LanguageShare[] }) {
  const summary = shares.map((s) => `${s.name} ${s.percent}%`).join(', ');
  return (
    <div role="img" aria-label={`Languages: ${summary}`} className="mt-1 flex h-1.5 w-full gap-px overflow-hidden rounded-full">
      {shares.map((s) => (
        <span
          key={s.name}
          title={`${s.name} ${s.percent}%`}
          className="h-full min-w-[2px] first:rounded-l-full last:rounded-r-full"
          style={{ flexGrow: s.percent, flexBasis: 0, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
}

/**
 * One row of Settings ▸ Accounts ▸ Reachable repositories: the provider's
 * mark on the left, the repo name, a compact metadata line (primary
 * language · stars · default branch · last update) and, for GitHub, a
 * segmented language-share bar. Every metadata piece is optional on the
 * wire, so a provider that does not supply one just draws less.
 * `children` is the trailing action area (Clone…, and anything beside it).
 */
export function ReachableRepoRow({
  repo,
  providerIcon: ProviderIcon,
  providerLabel,
  now = Date.now(),
  children,
}: {
  repo: ReachableRepo;
  providerIcon: IconComponent;
  providerLabel: string;
  now?: number;
  children?: ReactNode;
}) {
  const shares = languageShares(repo.languages);
  const primary = shares[0];
  const updated = repo.updatedAt ? relativeUpdated(repo.updatedAt, now) : null;

  return (
    <div
      data-testid="reachable-repo-row"
      className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-2 py-1.5"
    >
      <span role="img" aria-label={providerLabel} title={providerLabel} className="flex shrink-0 text-muted-foreground">
        <ProviderIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-xs font-medium">{repo.fullName}</p>
          {repo.private ? (
            <LuLock aria-label="Private" className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 text-[10px] text-muted-foreground">
          {primary && primary.name !== 'Other' ? (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: primary.color }} />
              {primary.name}
            </span>
          ) : null}
          {repo.stars !== undefined && repo.stars > 0 ? (
            <span className="flex items-center gap-0.5" aria-label={`${repo.stars} stars`}>
              <LuStar className="h-2.5 w-2.5" />
              {repo.stars}
            </span>
          ) : null}
          {repo.defaultBranch ? (
            <span className="flex min-w-0 items-center gap-0.5">
              <LuGitBranch className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{repo.defaultBranch}</span>
            </span>
          ) : null}
          {updated ? <span>updated {updated}</span> : null}
        </div>
        {shares.length > 0 ? <LanguageBar shares={shares} /> : null}
      </div>
      {children}
    </div>
  );
}
