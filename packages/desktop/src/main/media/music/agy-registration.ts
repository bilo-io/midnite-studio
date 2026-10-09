import { MCP_SERVER_NAME, failure, ok, type GitOpResult, type MusicAgyStatus } from '@midnite/studio-shared';

/**
 * "Register Midnite in Antigravity" (Phase 101 Theme H, Settings ▸ MCP). Antigravity (`agy`) has no
 * per-run MCP flag, so it can only use Midnite's tools if the server is listed in its own MCP config.
 * Writing into another tool's config is the user's call, never ours: `register` refuses without
 * `consent: true`, only ever adds or removes the one `midnite` entry, keeps every other key as it was,
 * and will not touch a file it cannot parse.
 *
 * Every file access is injected, so the whole thing is tested against a fake config.
 */
export type AgyRegistrationDeps = {
  /** `~/.gemini/antigravity/mcp_config.json`. */
  configPath: string;
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, text: string) => Promise<void>;
  /** How an MCP client launches Midnite's stdio shim — it finds the app's own socket by itself. */
  shimLaunch: () => { command: string; args: string[]; env: Record<string, string> };
};

type Config = { mcpServers?: Record<string, { command?: string; args?: string[] } & Record<string, unknown>> } & Record<string, unknown>;

async function load(deps: AgyRegistrationDeps): Promise<GitOpResult<Config>> {
  const text = await deps.readFile(deps.configPath);
  if (text === null || text.trim() === '') return ok({});
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return ok(parsed as Config);
  } catch {
    return failure(`${deps.configPath} is not valid JSON, so it was left alone. Fix or remove it, then try again.`);
  }
}

export function createAgyRegistration(deps: AgyRegistrationDeps) {
  async function status(): Promise<GitOpResult<MusicAgyStatus>> {
    const config = await load(deps);
    // A damaged file simply reads as "not registered"; register/unregister are the ones that explain it.
    const entry = config.ok ? config.value.mcpServers?.[MCP_SERVER_NAME] : undefined;
    // Registered means *this build's* shim: an entry left by a moved or reinstalled app is stale.
    const current = deps.shimLaunch();
    const registered = Boolean(entry && entry.command === current.command && JSON.stringify(entry.args) === JSON.stringify(current.args));
    return ok({ registered, configPath: deps.configPath });
  }

  async function register(req: { consent: boolean }): Promise<GitOpResult<MusicAgyStatus>> {
    if (req.consent !== true) return failure('Registering Midnite edits Antigravity’s own config, so it needs your OK first.');
    const config = await load(deps);
    if (!config.ok) return config;
    const launch = deps.shimLaunch();
    const next: Config = {
      ...config.value,
      mcpServers: { ...config.value.mcpServers, [MCP_SERVER_NAME]: { command: launch.command, args: launch.args, env: launch.env } },
    };
    try {
      await deps.writeFile(deps.configPath, `${JSON.stringify(next, null, 2)}\n`);
    } catch (error) {
      return failure(`Could not write ${deps.configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return status();
  }

  async function unregister(): Promise<GitOpResult<MusicAgyStatus>> {
    const config = await load(deps);
    if (!config.ok) return config;
    const servers = { ...config.value.mcpServers };
    if (!(MCP_SERVER_NAME in servers)) return status();
    delete servers[MCP_SERVER_NAME];
    const next: Config = { ...config.value, mcpServers: servers };
    try {
      await deps.writeFile(deps.configPath, `${JSON.stringify(next, null, 2)}\n`);
    } catch (error) {
      return failure(`Could not write ${deps.configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return status();
  }

  return { status, register, unregister };
}

export type AgyRegistration = ReturnType<typeof createAgyRegistration>;
