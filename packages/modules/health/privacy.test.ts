import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The privacy guard: Health data never leaves the machine, so no source file may reach the network. */
const MESSAGE = 'Health data never leaves the machine — see Phase 128 Decision 6.';

const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['navigator.sendBeacon', /navigator\.sendBeacon/],
  ['network module import', /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:node:)?(?:http|https|net|dgram)['"]|['"]undici['"]/],
  ['electron net', /from\s+['"]electron['"]/],
  ['other feature package', /['"]@midnite\/studio-feature-(?!report\b|monitor\b)[\w-]+/],
];

/** Names of the forbidden things `source` contains. */
export function violations(source: string): string[] {
  return FORBIDDEN.filter(([, re]) => re.test(source)).map(([name]) => name);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('Health stays on this machine', () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it('the matcher fires on planted network calls', () => {
    expect(violations("await fetch('https://x')")).toContain('fetch(');
    expect(violations("import http from 'node:https';")).toContain('network module import');
    expect(violations("import x from '@midnite/studio-feature-git/renderer';")).toContain('other feature package');
    expect(violations("import { x } from '@midnite/studio-feature-report/renderer';")).toEqual([]);
  });

  it('no source file under packages/modules/health reaches the network', () => {
    const files = sources(root);
    expect(files.length).toBeGreaterThan(10);
    const bad = files.flatMap((f) => violations(readFileSync(f, 'utf8')).map((v) => `${f}: ${v}`));
    expect(bad, MESSAGE).toEqual([]);
  });
});
