import { AGENT_LIMIT_KEYS, type AgentLimitKey } from '@midnite/studio-shared';

/** Every Builder field that carries an info popover. Stage and option tips read their `summary` instead. */
export type FieldId =
  | 'name'
  | 'description'
  | 'accent'
  | 'icon'
  | 'baseAgent'
  | 'model'
  | 'systemPrompt'
  | 'restrictTools'
  | 'mcpTools'
  | 'skills'
  | AgentLimitKey
  | 'blueprint';

/** Longest info text, in characters. */
export const FIELD_INFO_MAX = 220;

export const FIELD_INFO: Record<FieldId, string> = {
  name: 'What the agent is called in the list and in the new-session menu. It must be unique enough for you to tell apart.',
  description: 'One line on what the agent is for. It shows on the agent\'s card.',
  accent: 'The colour of the agent\'s icon and the stripe on its card and menu row.',
  icon: 'The glyph shown for the agent. Leave it on the base CLI\'s own mark, or borrow another CLI\'s.',
  baseAgent: 'The coding CLI this agent runs on. Midnite starts that CLI with your model, prompt and tool choices.',
  model: 'The model the base CLI runs. Default leaves the CLI\'s own choice in place.',
  systemPrompt: 'The standing instructions every session of this agent starts with: its role, rules and tone.',
  restrictTools: 'Limit which midnite tools this agent\'s sessions can use. Off means all of them.',
  mcpTools: 'The midnite tools this agent may call. Anything unticked is hidden from it and refused if called.',
  skills: 'Skills the agent is nudged to prefer. They are suggested in the prompt, not enforced.',
  toolCallsPerMinute: 'Most midnite tool calls this agent may make in any 60 seconds before it is stopped. Empty uses the repo\'s limit.',
  fileWritesPerMinute: 'Most file-writing tool calls in any 60 seconds before the agent is stopped. Empty uses the repo\'s limit.',
  gitPushesPerHour: 'Most git pushes in any 60 minutes before the agent is stopped. Empty uses the repo\'s limit.',
  outboundHostsPerSession: 'Most distinct hosts the agent\'s commands may reach in one session. Empty uses the repo\'s limit.',
  spendTokensPerSession: 'Most tokens one session may spend before it is stopped. Empty uses the repo\'s limit; No cap turns it off.',
  blueprint: 'Your design notes for this agent across five stages. They are saved with the agent and never change how it runs.',
};

/** The info key for every limit field, so a new limit cannot ship without copy. */
export const LIMIT_FIELD_IDS: readonly AgentLimitKey[] = AGENT_LIMIT_KEYS;

/** One glossary entry on the Info tab. */
export type GlossaryEntry = { term: string; definition: string };

/** The plain-language terms the blueprint uses, A to Z. */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'Evaluation',
    definition: 'A repeatable test that scores an agent\'s answers against known good ones. It tells you whether a change made the agent better or worse.',
  },
  {
    term: 'Fine-tuning',
    definition: 'Training a model further on your own examples so it follows your style or task more closely. It changes the model, not the prompt.',
  },
  {
    term: 'Guardrails',
    definition: 'Checks that run on what goes into and comes out of an agent, blocking unsafe or off-policy content before it lands.',
  },
  {
    term: 'Hybrid search',
    definition: 'Retrieval that combines keyword matching with meaning-based (vector) matching, so exact names and loose paraphrases both find their target.',
  },
  {
    term: 'MCP',
    definition: 'The Model Context Protocol, an open standard for giving an agent tools and data. Midnite exposes its own tools to an agent this way.',
  },
  {
    term: 'Observability',
    definition: 'Recording each step and tool call of a run as a trace, so a bad run can be replayed and diagnosed.',
  },
  {
    term: 'Open-weight model',
    definition: 'A model whose trained weights are published, so you can run it on your own machine instead of calling a hosted API.',
  },
  {
    term: 'Orchestration',
    definition: 'Deciding what an agent does next: splitting a goal into steps, choosing tools and handling retries.',
  },
  {
    term: 'RAG',
    definition: 'Retrieval-augmented generation: fetch relevant passages first, then hand them to the model with the question so it answers from them.',
  },
  {
    term: 'System prompt',
    definition: 'The standing instructions an agent starts every session with: its role, rules and tone. Users never type it.',
  },
  {
    term: 'Tool call',
    definition: 'A request from the model to run a function, such as reading a file or searching, and get the result back.',
  },
  {
    term: 'Vector database',
    definition: 'A store that indexes text as numbers capturing meaning, so it can find passages similar to a question rather than only matching words.',
  },
];
