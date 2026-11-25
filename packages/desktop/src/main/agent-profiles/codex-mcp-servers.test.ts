import { describe, expect, it } from 'vitest';

import { codexOtherMcpServers, type CodexMcpServerSeams } from './codex-mcp-servers';

const USER = '[mcp_servers.github]\ncommand = "gh"\n\n[mcp_servers.midnite]\ncommand = "x"\n\n[mcp_servers."weird.name"]\nurl = "http://x"\n';
const trust = (dir: string, level = 'trusted'): string => `\n[projects."${dir}"]\ntrust_level = "${level}"\n`;

function seams(files: Record<string, string>, markers: string[] = ['/repo/.git']): CodexMcpServerSeams {
  return {
    env: {},
    home: () => '/home/u',
    read: async (path) => files[path] ?? null,
    exists: async (path) => markers.includes(path),
    realpath: async (path) => path,
  };
}

/**
 * #1697 — the servers a restricted Codex agent turns off, read (never written) from Codex's own layers. #1718 —
 * a project layer counts only where Codex trusts it; the rules below were checked against codex 0.162 `mcp list`.
 */
describe('codexOtherMcpServers', () => {
  const project = { '/repo/.codex/config.toml': '[mcp_servers.db]\ncommand = "db"\n' };

  it('joins the user and a trusted project layer and drops midnite; a dotted name is kept (#1713)', async () => {
    const files = { '/home/u/.codex/config.toml': USER + trust('/repo'), ...project };
    expect(await codexOtherMcpServers('/repo', seams(files))).toEqual({ names: ['db', 'github', 'weird.name'] });
  });

  it('skips the project layer of an untrusted project, as Codex does (#1718)', async () => {
    const untrusted = { '/home/u/.codex/config.toml': USER, ...project };
    expect(await codexOtherMcpServers('/repo', seams(untrusted))).toEqual({ names: ['github', 'weird.name'] });
    const explicit = { '/home/u/.codex/config.toml': USER + trust('/repo', 'untrusted'), ...project };
    expect(await codexOtherMcpServers('/repo', seams(explicit))).toEqual({ names: ['github', 'weird.name'] });
  });

  it('a trusted root covers its subdirectories; trust above the project root does not count', async () => {
    const files = {
      '/home/u/.codex/config.toml': USER + trust('/repo'),
      ...project,
      '/repo/pkg/.codex/config.toml': '[mcp_servers.pkg]\ncommand = "p"\n',
    };
    expect(await codexOtherMcpServers('/repo/pkg', seams(files))).toEqual({ names: ['db', 'github', 'pkg', 'weird.name'] });
    const above = { ...files, '/home/u/.codex/config.toml': USER + trust('/') };
    expect(await codexOtherMcpServers('/repo/pkg', seams(above))).toEqual({ names: ['github', 'weird.name'] });
  });

  it('the nearest entry wins per layer: a trusted subdirectory alone loads only its own layer', async () => {
    const files = {
      ...project,
      '/repo/pkg/.codex/config.toml': '[mcp_servers.pkg]\ncommand = "p"\n',
      '/home/u/.codex/config.toml': trust('/repo/pkg'),
    };
    expect(await codexOtherMcpServers('/repo/pkg', seams(files))).toEqual({ names: ['pkg'] });
    const mixed = { ...files, '/home/u/.codex/config.toml': trust('/repo') + trust('/repo/pkg', 'untrusted') };
    expect(await codexOtherMcpServers('/repo/pkg', seams(mixed))).toEqual({ names: ['db'] });
  });

  it('with no root marker the project is cwd alone', async () => {
    const files = {
      '/home/u/.codex/config.toml': trust('/work'),
      '/work/.codex/config.toml': '[mcp_servers.parent]\ncommand = "p"\n',
      '/work/a/.codex/config.toml': '[mcp_servers.a]\ncommand = "a"\n',
    };
    expect(await codexOtherMcpServers('/work/a', seams(files, []))).toEqual({ names: [] });
  });

  it('keys trust on the canonical path', async () => {
    const files = { '/home/u/.codex/config.toml': trust('/private/repo'), '/private/repo/.codex/config.toml': '[mcp_servers.db]\ncommand = "db"\n' };
    const s = { ...seams(files, ['/private/repo/.git']), realpath: async (p: string) => `/private${p}` };
    expect(await codexOtherMcpServers('/repo', s)).toEqual({ names: ['db'] });
  });

  it('honours CODEX_HOME, and a missing file adds nothing', async () => {
    const files = { '/alt/config.toml': '[mcp_servers.alt]\ncommand = "a"\n' };
    expect(await codexOtherMcpServers('/nowhere', { ...seams(files), env: { CODEX_HOME: '/alt' } })).toEqual({ names: ['alt'] });
  });
});
