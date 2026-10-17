// vitest, not Playwright: the shim's two handlers with the socket call stubbed — no process, no browser.
import { MCP_CONTENT_KEY, type McpToolId } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createRunShim, runShimSocketFromArgv } from './run-shim';

const TOOLS: McpToolId[] = ['game_state', 'game_screenshot'];

function setup(socketPath: string | null = '/tmp/run.sock') {
  const call = vi.fn(async (req: { tool: string }) =>
    req.tool === 'game_screenshot'
      ? { id: 'x', ok: true as const, value: { [MCP_CONTENT_KEY]: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }] } }
      : { id: 'x', ok: true as const, value: { state: { x: 1 } } },
  );
  const shim = createRunShim({ toolIds: TOOLS, socketPath, toJsonSchema: () => ({ properties: {} }), timeoutMs: () => 1000, call });
  return { shim, call };
}

describe('createRunShim', () => {
  it('lists the run’s tools and nothing else', () => {
    expect(setup().shim.listTools().tools.map((t) => t.name)).toEqual(TOOLS);
  });

  it('refuses a tool outside the run without touching the socket', async () => {
    const { shim, call } = setup();
    for (const name of ['game_create', 'repo_list', 'model_save', 'Bash']) {
      expect(await shim.callTool(name, {})).toEqual({ content: [{ type: 'text', text: `Unknown tool: "${name}"` }], isError: true });
    }
    expect(call).not.toHaveBeenCalled();
  });

  it('forwards a run tool to the one socket it was given, passing pictures through untouched', async () => {
    const { shim, call } = setup();
    expect(await shim.callTool('game_state', { game: 'g' })).toEqual({ content: [{ type: 'text', text: '{"state":{"x":1}}' }] });
    expect(await shim.callTool('game_screenshot', { game: 'g' })).toEqual({ content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }] });
    expect(call).toHaveBeenCalledWith({ socketPath: '/tmp/run.sock', tool: 'game_state', input: { game: 'g' }, timeoutMs: 1000 });
  });

  it('has nothing to call without --socket — there is no fallback to a global server', async () => {
    const { shim, call } = setup(null);
    expect(await shim.callTool('game_state', {})).toMatchObject({ isError: true });
    expect(call).not.toHaveBeenCalled();
    expect(runShimSocketFromArgv(['node', 'shim.js'])).toBeNull();
    expect(runShimSocketFromArgv(['node', 'shim.js', '--socket'])).toBeNull();
    expect(runShimSocketFromArgv(['node', 'shim.js', '--socket', '/r/s.sock'])).toBe('/r/s.sock');
  });
});
