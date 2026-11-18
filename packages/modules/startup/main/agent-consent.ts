import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  DEFAULT_STARTUP_AGENT_CONSENT,
  StartupAgentConsentSchema,
  type StartupAgentConsent,
  type StartupRequest,
  type StartupResult,
} from '@midnite/studio-shared';

/**
 * Startup's two agent-access switches (Phase 153 Theme C), kept in the app's own settings file —
 * `<userData>/startup/agent-consent.json`, beside the workspace but never inside it — so an exported or
 * restored workspace cannot grant an agent access. Both default off; "make changes" means nothing without "read",
 * so it is stored as off whenever read is. `get` is synchronous (the MCP server asks on every call); `set`
 * writes temp + rename.
 */
export type AgentConsentStore = {
  get(): StartupAgentConsent;
  set(next: StartupAgentConsent): Promise<StartupAgentConsent>;
};

const normalise = (c: StartupAgentConsent): StartupAgentConsent => ({ read: c.read, write: c.read && c.write });

export function openAgentConsent(dir: string, warn?: (message: string) => void): AgentConsentStore {
  const file = join(dir, 'agent-consent.json');
  let current: StartupAgentConsent = DEFAULT_STARTUP_AGENT_CONSENT;
  try {
    const parsed = StartupAgentConsentSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) current = normalise(parsed.data);
    else warn?.('startup: agent-consent.json is not valid; agent access stays off.');
  } catch (error) {
    // A missing file is the normal first run; anything else is worth one line.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warn?.(`startup: could not read agent-consent.json (${String(error)}); agent access stays off.`);
  }
  return {
    get: () => current,
    async set(next) {
      const value = normalise(next);
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      await writeFile(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
      await rename(tmp, file);
      current = value;
      return value;
    },
  };
}

/** The two ops over the store; `store` is absent in a bare test, where reads answer the defaults and writes refuse. */
export async function agentConsentOp(
  store: AgentConsentStore | undefined,
  request: Extract<StartupRequest, { op: 'getAgentConsent' | 'setAgentConsent' }>,
): Promise<StartupResult<StartupAgentConsent>> {
  if (request.op === 'getAgentConsent') return { ok: true, value: store?.get() ?? DEFAULT_STARTUP_AGENT_CONSENT };
  if (store === undefined) return { ok: false, kind: 'invalid', message: 'Agent access cannot be changed here.' };
  try {
    return { ok: true, value: await store.set(request.consent) };
  } catch (error) {
    return { ok: false, kind: 'io', message: String(error) };
  }
}
