// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashMcpTools } from '@midnite/studio-runtime';
import { ALL_APPS_INSTALLED, listMcpToolIds, MCP_TOOLS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { MCP_TOOL_MANIFESTS } from './tool-manifests';

/**
 * Our own server, pinned (Phase 121 Theme C). The `midnite` MCP server's tool list is what every agent that
 * connects to it reads, and what an allowlist entry for it would hash. A description is model-visible text, so
 * a change to one is a security-relevant diff: it must show up in review as a changed line of
 * `tool-manifest.pin.json`, not slip through as a prose edit.
 *
 * Pinned: each tool's id and description (the text the model reads) per `MCP_TOOL_MANIFESTS`, as a SHA-256 per
 * tool, and the `hashMcpTools` SHA-256 an allowlist would hold over the whole list. After an intended change:
 * `UPDATE_MCP_PIN=1 pnpm --filter @midnite/studio-desktop exec vitest run src/main/mcp/tool-manifest-pin.test.ts`
 * and commit the new file with the reason in the PR.
 */
const PIN_FILE = join(__dirname, 'tool-manifest.pin.json');

const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

function current() {
  const tools = listMcpToolIds(ALL_APPS_INSTALLED, MCP_TOOL_MANIFESTS).map((id) => ({ name: id, description: MCP_TOOLS[id].description }));
  return {
    hash: hashMcpTools(tools),
    tools: Object.fromEntries(tools.map((t) => [t.name, sha(t.description)])),
  };
}

describe('the midnite server manifest is pinned', () => {
  it('matches tool-manifest.pin.json, tool by tool', () => {
    const now = current();
    if (process.env['UPDATE_MCP_PIN'] === '1') writeFileSync(PIN_FILE, `${JSON.stringify(now, null, 2)}\n`);
    const pinned = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as ReturnType<typeof current>;
    // Per tool first, so a failure names the tool whose description moved, then the whole-list hash.
    expect(now.tools).toEqual(pinned.tools);
    expect(now.hash).toBe(pinned.hash);
  });

  it('has a description for every tool, none of which instructs the model beyond describing the tool', () => {
    for (const [id, tool] of Object.entries(MCP_TOOLS)) {
      expect(tool.description.length, id).toBeGreaterThan(0);
      expect(tool.description, id).not.toMatch(/<\s*\/?\s*(important|system|instructions?)\b/i);
    }
  });
});
