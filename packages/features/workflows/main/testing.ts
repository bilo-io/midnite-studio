import { silentWorkflowLogger, type WorkflowsPorts } from './ports';

/**
 * Ports that fail the test if a workflow ever spawns a real process, reads a key or reaches a
 * forge — the executor suites inject their own fakes, and this is only what the *default* wiring
 * reaches for. Override the members a test cares about.
 */
export function fakeWorkflowsPorts(over: Partial<WorkflowsPorts> = {}): WorkflowsPorts {
  const refuse = (what: string) => () => {
    throw new Error(`${what} is not available in tests`);
  };
  return {
    log: silentWorkflowLogger,
    listAgents: async () => [],
    agentBinding: () => undefined,
    ollamaBaseUrl: () => 'http://127.0.0.1:11434',
    ollamaApiKey: async () => null,
    ollamaPrompt: async () => ({ ok: false, message: 'no ollama in tests' }),
    pty: {
      onPty: refuse('a pty'),
      offPty: refuse('a pty'),
      killPty: refuse('a pty'),
      activityFor: () => null,
      startNodeSession: async () => ({ ok: false, message: 'no terminal session in tests' }),
    },
    ...over,
  };
}
