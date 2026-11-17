import { APP_IDS, type AppId } from './catalog';

export type ChangelogCategory = 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Security' | 'General';

export type ChangelogItem = {
  id: string;
  version: string;
  category: ChangelogCategory;
  title: string;
  body: string;
  raw: string;
  appIds: AppId[];
};

export type ChangelogRelease = {
  version: string;
  date: string | null;
  items: ChangelogItem[];
};

export type ChangelogPayload = {
  releases: ChangelogRelease[];
  rawMarkdown: string;
  error: string | null;
};

/** Keyword/regex patterns that attribute a changelog bullet to one or more suite apps. */
const APP_PATTERNS: Record<AppId, RegExp> = {
  // Studio is the parent suite/shell hosting all apps, so it covers everything.
  studio: /.*/,
  agents: /\b(agents?|coder|patrol|loops?|prompt injection|mcp|skills?|cli policy|agentic)\b/i,
  gamer: /\b(gamer|games?|gameplay|3d|physics|terrain|procedural)\b/i,
  media: /\b(media|creator|video|audio|sprite|remotion|visualizer|orb|explainer|voiceover|music|sound)\b/i,
  money: /\b(money|accountant|crypto|finance|wallet|balance|portfolio)\b/i,
  mind: /\b(mind|capture|knowledge graph|circlepack|companion|notes?)\b/i,
  browser: /\b(browser|chromium|permission|tabs?|cookie|web)\b/i,
  science: /\b(science|simulator|simulation)\b/i,
  vanguard: /\b(vanguard|antivirus|malware|vault|cleaner|monitor|quarantine|supply-chain|sensors?|egress|slopsquat|threat|cisa|osv)\b/i,
  startup: /\b(startup|founder|pitch)\b/i,
  health: /\b(health|wellness|ergonomics)\b/i,
};

/** Normalizes a category heading into a standard ChangelogCategory. */
function parseCategory(heading: string): ChangelogCategory {
  const norm = heading.trim().toLowerCase();
  if (norm.startsWith('add')) return 'Added';
  if (norm.startsWith('change')) return 'Changed';
  if (norm.startsWith('fix')) return 'Fixed';
  if (norm.startsWith('remov')) return 'Removed';
  if (norm.startsWith('sec')) return 'Security';
  return 'General';
}

/** Determines which apps a changelog bullet applies to. */
export function detectAppIds(text: string): AppId[] {
  const matched: AppId[] = [];
  // Check specific apps first
  for (const appId of APP_IDS) {
    if (appId === 'studio') continue;
    if (APP_PATTERNS[appId].test(text)) {
      matched.push(appId);
    }
  }
  // If text mentions universal suite shell changes (e.g. "One shell for every suite app", "Report an Issue"),
  // or no specific app was identified, it also applies across the suite.
  if (/\b(every app|suite app|all suite apps|report an issue|one shell)\b/i.test(text)) {
    for (const appId of APP_IDS) {
      if (!matched.includes(appId)) matched.push(appId);
    }
  }
  // Studio always receives all items as the total changelog host
  if (!matched.includes('studio')) {
    matched.push('studio');
  }
  return matched;
}

/** Extracts the title and body from a changelog bullet. */
export function parseBulletText(raw: string): { title: string; body: string } {
  const trimmed = raw.trim();
  // Check for leading **Title** format
  const boldMatch = /^\*\*([^*]+)\*\*(?::\s*|\s*[-–—]\s*|\s*)(.*)$/.exec(trimmed);
  if (boldMatch && boldMatch[1]) {
    return {
      title: boldMatch[1].trim(),
      body: boldMatch[2]?.trim() ?? '',
    };
  }

  // Fallback: split by first colon if available
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx < 50) {
    return {
      title: trimmed.slice(0, colonIdx).replace(/^\*+|\*+$/g, '').trim(),
      body: trimmed.slice(colonIdx + 1).trim(),
    };
  }

  return {
    title: trimmed,
    body: '',
  };
}

/**
 * Parses Keep-a-Changelog formatted markdown into structured releases and items.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const lines = markdown.split('\n');
  const releases: ChangelogRelease[] = [];
  let currentRelease: ChangelogRelease | null = null;
  let currentCategory: ChangelogCategory = 'General';
  let currentRaw = '';
  let itemIdCounter = 0;

  const flushItem = () => {
    if (!currentRelease || !currentRaw.trim()) return;
    const { title, body } = parseBulletText(currentRaw);
    const appIds = detectAppIds(currentRaw);
    currentRelease.items.push({
      id: `item-${++itemIdCounter}`,
      version: currentRelease.version,
      category: currentCategory,
      title,
      body,
      raw: currentRaw.trim(),
      appIds,
    });
    currentRaw = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Version heading: `## [0.0.6] - 2026-10-31` or `## [0.0.6]`
    const vMatch = /^##\s+\[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/.exec(line);
    if (vMatch) {
      flushItem();
      const version = vMatch[1];
      if (version && version !== 'Unreleased') {
        currentRelease = {
          version,
          date: vMatch[2] ?? null,
          items: [],
        };
        releases.push(currentRelease);
        currentCategory = 'General';
      } else {
        currentRelease = null;
      }
      continue;
    }

    if (!currentRelease) continue;

    // Category heading: `### Added`, `### Changed`, etc.
    const catMatch = /^###\s+(.*)/.exec(line);
    if (catMatch && catMatch[1]) {
      flushItem();
      currentCategory = parseCategory(catMatch[1]);
      continue;
    }

    // Bullet line: `- text` or `* text`
    const bulletMatch = /^\s*[-*]\s+(.*)/.exec(line);
    if (bulletMatch && bulletMatch[1]) {
      flushItem();
      currentRaw = bulletMatch[1];
    } else if (currentRaw && line.trim()) {
      // Continuation line of previous bullet
      currentRaw += ` ${line.trim()}`;
    }
  }

  flushItem();
  return releases;
}

/**
 * Filters a changelog by app.
 * If appId is 'studio' or 'all', returns all items (the total changelog).
 * Otherwise returns only items attributed to that specific app.
 */
export function filterChangelogByApp(
  releases: readonly ChangelogRelease[] | null | undefined,
  appId: AppId | 'all',
): ChangelogRelease[] {
  if (!releases || !Array.isArray(releases)) return [];

  if (appId === 'all' || appId === 'studio') {
    return releases.map((r) => ({ ...r, items: [...(r.items ?? [])] }));
  }

  return releases
    .map((r) => {
      const items: readonly ChangelogItem[] = r.items ?? [];
      const filteredItems = items.filter((item: ChangelogItem) => item?.appIds?.includes(appId));
      return {
        ...r,
        items: [...filteredItems],
      };
    })
    .filter((r) => r.items.length > 0);
}

/**
 * Searches and filters changelog items by query and app.
 */
export function searchChangelog(
  releases: readonly ChangelogRelease[],
  query: string,
  appId: AppId | 'all' = 'all',
): ChangelogRelease[] {
  const appFiltered = filterChangelogByApp(releases, appId);
  const q = query.trim().toLowerCase();
  if (!q) return appFiltered;

  return appFiltered
    .map((r) => ({
      ...r,
      items: r.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.body.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          r.version.toLowerCase().includes(q),
      ),
    }))
    .filter((r) => r.items.length > 0);
}

/**
 * Quick summary for an individual app's detail sheet.
 */
export function appChangelogSummary(
  releases: readonly ChangelogRelease[],
  appId: AppId,
): {
  latestVersion: string | null;
  latestItems: ChangelogItem[];
  totalItems: number;
} {
  const filtered = filterChangelogByApp(releases, appId);
  if (filtered.length === 0) {
    return { latestVersion: null, latestItems: [], totalItems: 0 };
  }
  const first = filtered[0];
  const total = filtered.reduce((acc, r) => acc + r.items.length, 0);
  return {
    latestVersion: first?.version ?? null,
    latestItems: (first?.items ?? []).slice(0, 4),
    totalItems: total,
  };
}
