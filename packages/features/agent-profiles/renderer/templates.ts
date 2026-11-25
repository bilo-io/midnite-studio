import type { AgentProfile } from '@midnite/studio-shared';

export type AgentProfileTemplate = {
  id: string;
  label: string;
  summary: string;
  /** Fills a blank profile. Templates leave `mcpTools` `null` (no restriction). */
  apply: (blank: AgentProfile) => AgentProfile;
};

/** The starter agents offered from the empty state and "New from template". */
export const AGENT_PROFILE_TEMPLATES: readonly AgentProfileTemplate[] = [
  {
    id: 'reviewer',
    label: 'Reviewer',
    summary: 'Reads diffs and reports findings by severity. Writes nothing.',
    apply: (blank) => ({
      ...blank,
      name: 'Reviewer',
      description: 'Reads diffs and reports findings by severity.',
      accent: '#f59e0b',
      systemPrompt:
        'You are a code reviewer. Read the change you are given, and the code around it, before you judge it. ' +
        'Report each finding with a severity (critical, warning or nit), the file and line, and a one-sentence reason. ' +
        'Lead with what could break in production. Do not edit, create or delete any file. ' +
        'If the change is sound, say so in one line.',
      blueprint: {
        operate: { options: ['guardrails'], note: 'Read-only: the agent never writes files.' },
      },
    }),
  },
  {
    id: 'researcher',
    label: 'Researcher',
    summary: 'Reads and summarises with sources. No file writes.',
    apply: (blank) => ({
      ...blank,
      name: 'Researcher',
      description: 'Reads and summarises with sources.',
      accent: '#06b6d4',
      systemPrompt:
        'You are a researcher. Find the answer in the repository, its docs and the sources you are pointed to. ' +
        'Quote or cite the file or link behind every claim, so the reader can check it. ' +
        'Separate what you verified from what you infer. Summarise in short paragraphs, most important first. ' +
        'Do not write or change any file.',
      blueprint: {
        ground: { options: ['hybrid-search'], note: 'Cite the passage each answer came from.' },
      },
    }),
  },
  {
    id: 'builder',
    label: 'Builder',
    summary: 'Implements a spec in small commits and runs the tests.',
    apply: (blank) => ({
      ...blank,
      name: 'Builder',
      description: 'Implements a spec in small commits and runs the tests.',
      accent: '#22c55e',
      systemPrompt:
        'You are a builder. Read the spec fully, then implement it one small step at a time. ' +
        'After each step run the relevant tests and fix what fails before moving on. ' +
        'Commit after each working step with a message that says what changed and why. ' +
        'Follow the conventions of the code around you, and stop to ask when the spec is unclear.',
      blueprint: {
        orchestrate: { options: ['custom'], note: 'Plan, implement, test, commit; repeat.' },
      },
    }),
  },
];
