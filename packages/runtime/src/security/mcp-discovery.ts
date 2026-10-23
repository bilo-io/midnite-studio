import { join } from 'node:path';

import type { McpServerSource } from '@midnite/studio-shared';

/**
 * MCP server discovery — Phase 121 Theme C.
 *
 * The servers a repo's agents will load, read from the five places they load them from:
 * `<repo>/.mcp.json`, `<repo>/.cursor/mcp.json`, `<repo>/.vscode/mcp.json`, `~/.claude.json` (the user's
 * `mcpServers`, plus the entry Claude Code keeps per project path) and `~/.codex/config.toml`
 * (`[mcp_servers.<name>]`). **Read-only by construction**: the only filesystem seam this file takes is
 * `readFile`, so nothing here can write. A missing, unreadable or malformed file is an empty source, never
 * an error: discovery must not break a run, it only reports what it can read.
 */

export type DiscoveredMcpServer = {
  serverName: string;
  source: McpServerSource;
  sourcePath: string;
  /** The raw config entry, exactly as the file carries it. */
  config: Record<string, unknown>;
};

export type DiscoverOptions = {
  repoPath: string;
  home: string;
  /** Resolves with the file's text, or `null` when it is absent or unreadable. */
  readFile: (path: string) => Promise<string | null>;
  /**
   * Phase 115 Theme F's switch for reading agent config files. When it answers `false` nothing is read and
   * nothing is discovered. The composer passes the real setting once that theme lands.
   */
  allowConfigRead?: (() => boolean) | undefined;
};

/** Highest precedence first: a repo's own file wins over the user's. */
const SOURCE_ORDER: readonly McpServerSource[] = ['repo-mcp-json', 'cursor', 'vscode', 'claude-user', 'codex-user'];

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function entriesOf(table: unknown): Array<[string, Record<string, unknown>]> {
  if (!isRecord(table)) return [];
  return Object.entries(table).flatMap(([name, entry]): Array<[string, Record<string, unknown>]> => (isRecord(entry) ? [[name, entry]] : []));
}

export async function discoverMcpServers(options: DiscoverOptions): Promise<DiscoveredMcpServer[]> {
  if (options.allowConfigRead && !options.allowConfigRead()) return [];
  const { repoPath, home, readFile } = options;
  const found: DiscoveredMcpServer[] = [];
  const add = (source: McpServerSource, sourcePath: string, table: unknown): void => {
    for (const [serverName, config] of entriesOf(table)) found.push({ serverName, source, sourcePath, config });
  };

  const repoJson = join(repoPath, '.mcp.json');
  const cursorJson = join(repoPath, '.cursor', 'mcp.json');
  const vscodeJson = join(repoPath, '.vscode', 'mcp.json');
  const claudeJson = join(home, '.claude.json');
  const codexToml = join(home, '.codex', 'config.toml');
  const [repoText, cursorText, vscodeText, claudeText, codexText] = await Promise.all([
    readFile(repoJson),
    readFile(cursorJson),
    readFile(vscodeJson),
    readFile(claudeJson),
    readFile(codexToml),
  ]);

  const repo = parseJson(repoText);
  if (isRecord(repo)) add('repo-mcp-json', repoJson, repo['mcpServers']);
  const cursor = parseJson(cursorText);
  if (isRecord(cursor)) add('cursor', cursorJson, cursor['mcpServers']);
  const vscode = parseJson(vscodeText);
  if (isRecord(vscode)) add('vscode', vscodeJson, vscode['servers']);
  const claude = parseJson(claudeText);
  if (isRecord(claude)) {
    add('claude-user', claudeJson, claude['mcpServers']);
    const projects = claude['projects'];
    if (isRecord(projects) && isRecord(projects[repoPath])) add('claude-user', claudeJson, (projects[repoPath] as Record<string, unknown>)['mcpServers']);
  }
  if (codexText !== null) add('codex-user', codexToml, parseToml(codexText)['mcp_servers']);

  // Two files can define one name. The highest-precedence keeps it; the rest are listed as `name (source)` so
  // each still has its own allowlist entry and nothing is hidden behind a same-named, approved neighbour.
  found.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
  const taken = new Set<string>();
  return found.map((server) => {
    if (!taken.has(server.serverName)) {
      taken.add(server.serverName);
      return server;
    }
    let renamed = `${server.serverName} (${server.source})`;
    for (let n = 2; taken.has(renamed); n += 1) renamed = `${server.serverName} (${server.source} ${n})`;
    taken.add(renamed);
    return { ...server, serverName: renamed };
  });
}

// --- a TOML subset, for `[mcp_servers.<name>]` -----------------------------------------------------------

/**
 * Enough TOML to read Codex's `config.toml`: tables and dotted/quoted table headers, `key = value` with
 * basic and literal strings, integers, floats, booleans, (multi-line) arrays and inline tables. Anything it
 * cannot parse is skipped, so one odd line cannot hide the servers beside it. Dates and multi-line strings
 * are not supported; no key this feature reads uses them.
 */
export function parseToml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripComment(lines[i] ?? '').trim();
    if (line === '') continue;
    if (line.startsWith('[[')) {
      // An array of tables: nothing we read uses one; park the cursor in a scratch table.
      current = {};
      continue;
    }
    if (line.startsWith('[')) {
      const end = line.indexOf(']');
      const path = end > 0 ? parseKeyPath(line.slice(1, end)) : null;
      current = path ? descend(root, path) : {};
      continue;
    }
    const eq = findEquals(line);
    if (eq < 0) continue;
    const path = parseKeyPath(line.slice(0, eq));
    if (!path || path.length === 0) continue;
    let rest = line.slice(eq + 1).trim();
    // An array or inline table may continue over several lines: take lines until the brackets balance.
    while (depthOf(rest) > 0 && i + 1 < lines.length) {
      i += 1;
      rest += ` ${stripComment(lines[i] ?? '').trim()}`;
    }
    const parsed = parseValue(rest);
    if (parsed.ok) {
      const table = path.length > 1 ? descend(current, path.slice(0, -1)) : current;
      table[path[path.length - 1] as string] = parsed.value;
    }
  }
  return root;
}

function descend(table: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let node = table;
  for (const key of path) {
    const next = node[key];
    if (isRecord(next)) node = next;
    else {
      const made: Record<string, unknown> = {};
      node[key] = made;
      node = made;
    }
  }
  return node;
}

/** Drops a `#` comment, leaving `#` inside a string alone. */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

function findEquals(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '=') return i;
  }
  return -1;
}

/** Open brackets minus closed, outside strings: positive while a value is still open. */
function depthOf(text: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
  }
  return depth;
}

function parseKeyPath(text: string): string[] | null {
  const path: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    if (i >= text.length) break;
    const ch = text[i] as string;
    if (ch === '"' || ch === "'") {
      const parsed = readString(text, i);
      if (!parsed) return null;
      path.push(parsed.value);
      i = parsed.end;
    } else {
      const start = i;
      while (i < text.length && /[A-Za-z0-9_-]/.test(text[i] as string)) i += 1;
      if (i === start) return null;
      path.push(text.slice(start, i));
    }
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    if (text[i] === '.') i += 1;
    else if (i < text.length) return null;
  }
  return path;
}

function readString(text: string, start: number): { value: string; end: number } | null {
  const quote = text[start] as string;
  let value = '';
  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (ch === quote) return { value, end: i + 1 };
    if (quote === '"' && ch === '\\') {
      const next = text[i + 1];
      i += 1;
      if (next === 'n') value += '\n';
      else if (next === 't') value += '\t';
      else if (next === 'r') value += '\r';
      else if (next === 'u' || next === 'U') {
        const width = next === 'u' ? 4 : 8;
        const code = Number.parseInt(text.slice(i + 1, i + 1 + width), 16);
        if (Number.isFinite(code)) value += String.fromCodePoint(code);
        i += width;
      } else value += next ?? '';
    } else value += ch;
  }
  return null;
}

type ParsedValue = { ok: true; value: unknown } | { ok: false };

function parseValue(text: string): ParsedValue {
  const t = text.trim();
  if (t === '') return { ok: false };
  if (t[0] === '"' || t[0] === "'") {
    const parsed = readString(t, 0);
    return parsed ? { ok: true, value: parsed.value } : { ok: false };
  }
  if (t === 'true') return { ok: true, value: true };
  if (t === 'false') return { ok: true, value: false };
  if (t[0] === '[') return parseArray(t);
  if (t[0] === '{') return parseInline(t);
  if (/^[+-]?(?:\d[\d_]*)(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?$/.test(t)) return { ok: true, value: Number(t.replace(/_/g, '')) };
  return { ok: false };
}

/** Splits a bracketed body at top-level commas. */
function splitTop(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] as string;
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function parseArray(text: string): ParsedValue {
  const close = text.lastIndexOf(']');
  if (close < 0) return { ok: false };
  const out: unknown[] = [];
  for (const part of splitTop(text.slice(1, close))) {
    const parsed = parseValue(part);
    if (parsed.ok) out.push(parsed.value);
  }
  return { ok: true, value: out };
}

function parseInline(text: string): ParsedValue {
  const close = text.lastIndexOf('}');
  if (close < 0) return { ok: false };
  const out: Record<string, unknown> = {};
  for (const part of splitTop(text.slice(1, close))) {
    const eq = findEquals(part);
    if (eq < 0) continue;
    const path = parseKeyPath(part.slice(0, eq));
    const parsed = parseValue(part.slice(eq + 1));
    if (path && path.length > 0 && parsed.ok) descend(out, path.slice(0, -1))[path[path.length - 1] as string] = parsed.value;
  }
  return { ok: true, value: out };
}
