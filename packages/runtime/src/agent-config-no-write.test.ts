import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 115 Theme F — Claude's and Codex's settings are never written. Studio reads `~/.claude`,
 * `~/.codex` and their transcripts; this test fails on any main-side write call whose arguments
 * mention an agent's config path, so a future change cannot start writing it without a reviewer
 * seeing this file. Same shape as `persisted-secrets.test.ts`. The runtime guard is
 * `assertNotAgentConfig` in `private-files.ts`.
 *
 */

const ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['packages', 'apps'];
const SKIP = new Set(['node_modules', 'dist', 'out', 'release', '.vite', 'e2e', 'website']);

const WRITE_CALL =
  /\b(writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|rm|rmSync|unlink|unlinkSync|mkdir|mkdirSync|copyFile|copyFileSync|cp|cpSync|symlink|symlinkSync|link|linkSync|truncate|truncateSync|chmod|chmodSync|createWriteStream|writePrivateFile|appendPrivateFileSync|ensurePrivateDir|ensurePrivateDirSync)\s*\(/;
const AGENT_PATH = /\.claude\b|\.codex\b|\.mcp\.json|['"`]settings\.json['"`]|\bclaudeHome\s*\(|\bcodexHome\s*\(/;

/** Writes of repo-scaffold skills, which are skills and not settings. Path suffix → reason. */
const ALLOWLIST: Record<string, string> = {};

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|spec)\./.test(name)) yield p;
  }
}

/** Offending `file:line` entries: a write call and an agent path within the same 5-line window. */
function findAgentConfigWrites(source: string): number[] {
  const lines = source.split('\n');
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (!WRITE_CALL.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
    const window = lines.slice(i, i + 5).join('\n');
    if (AGENT_PATH.test(window)) hits.push(i + 1);
  });
  return hits;
}

describe('agent config is never written', () => {
  it('flags an injected write to ~/.claude/settings.json', () => {
    const bad = "await writeFile(join(home, '.claude', 'settings.json'), data);";
    expect(findAgentConfigWrites(bad)).toEqual([1]);
    expect(findAgentConfigWrites("await writeFile(join(dir, 'notes.md'), data);")).toEqual([]);
    expect(findAgentConfigWrites("// await writeFile(join(home, '.codex'))")).toEqual([]);
    // Calls the first version missed: copies, streams, truncation and the fs-scope helper.
    expect(findAgentConfigWrites("await cp(src, join(home, '.codex', 'config.toml'));")).toEqual([1]);
    expect(findAgentConfigWrites("createWriteStream(join(claudeHome(), 'x'));")).toEqual([1]);
    expect(findAgentConfigWrites("await writeFile(\n  join(\n    home,\n    '.claude',\n    'settings.json'), d);")).toEqual([1]);
  });

  it('finds no write to .claude, .codex, .mcp.json or settings.json in source', () => {
    const offenders: string[] = [];
    for (const top of SCAN_DIRS) {
      for (const file of walk(join(ROOT, top))) {
        const rel = relative(ROOT, file);
        for (const line of findAgentConfigWrites(readFileSync(file, 'utf8'))) {
          const key = `${rel}:${line}`;
          if (!Object.keys(ALLOWLIST).some((a) => key.startsWith(a))) offenders.push(key);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
