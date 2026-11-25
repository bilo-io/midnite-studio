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
