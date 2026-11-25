import { describe, expect, it } from 'vitest';

import { codexOtherMcpServers } from './codex-mcp-servers';

/** #1697 — the servers a restricted Codex agent turns off, read (never written) from Codex's own two layers. */
describe('codexOtherMcpServers', () => {
  const files: Record<string, string> = {
    '/home/u/.codex/config.toml': '[mcp_servers.github]\ncommand = "gh"\n\n[mcp_servers.midnite]\ncommand = "x"\n\n[mcp_servers."weird.name"]\nurl = "http://x"\n',
    '/repo/.codex/config.toml': '[mcp_servers.db]\ncommand = "db"\n',
    '/alt/config.toml': '[mcp_servers.alt]\ncommand = "a"\n',
  };
  const read = async (path: string): Promise<string | null> => files[path] ?? null;

  it('joins the user and project layers and drops midnite; a dotted name is kept (#1713)', async () => {
    expect(await codexOtherMcpServers('/repo', { env: {}, home: () => '/home/u', read })).toEqual({
      names: ['db', 'github', 'weird.name'],
    });
  });

  it('honours CODEX_HOME, and a missing file adds nothing', async () => {
    expect(await codexOtherMcpServers('/nowhere', { env: { CODEX_HOME: '/alt' }, home: () => '/home/u', read })).toEqual({
      names: ['alt'],
    });
  });
});
