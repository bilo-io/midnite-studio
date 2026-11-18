import { createHeadlessTextPorts, runHeadlessText, type HeadlessTextPorts } from '@midnite/studio-runtime';
import { resolveHeadlessAgent } from '@midnite/studio-shared';
import type { InvestorUpdatePorts } from '@midnite/studio-module-startup/main';

/** A monthly update is a long prompt over real figures, not a one-line wand click. */
export const INVESTOR_UPDATE_TIMEOUT_MS = 180_000;

/**
 * Startup's model runner and agent roster (Phase 153 Theme D): the runtime's `runHeadlessText` over ports built
 * from Node alone (`createHeadlessTextPorts`), so Startup imports no `features/models` and spawns nothing itself.
 * The CLI's own default model is used: an investor update is worth the stronger one. `ready` is awaited before the
 * first PATH probe (the packaged app's PATH is merged from the login shell in the background).
 */
export function createInvestorPorts(
  options: { ports?: HeadlessTextPorts; ready?: Promise<unknown> } = {},
): Pick<InvestorUpdatePorts, 'run' | 'agents'> {
  const ports = options.ports ?? createHeadlessTextPorts();
  const settled = async (): Promise<void> => {
    await options.ready?.catch(() => undefined);
  };
  return {
    agents: async () => {
      await settled();
      return (await ports.listAgents()).map((a) => ({ id: a.id, label: a.label }));
    },
    run: async ({ prompt, agentId, ollamaModel }) => {
      await settled();
      const result = await runHeadlessText(
        { prompt, agentId, ollamaModel, modelArgs: () => [], what: 'the investor update' },
        ports,
        INVESTOR_UPDATE_TIMEOUT_MS,
      );
      if (!result.ok) return result;
      const model = ollamaModel ? `ollama:${ollamaModel}` : (resolveHeadlessAgent(await ports.listAgents(), agentId)?.agent.id ?? 'agent');
      return { ok: true, text: result.text, model };
    },
  };
}
