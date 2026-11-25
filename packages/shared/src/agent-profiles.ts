/**
 * Custom agents (Phase 154) — a user-built agent is a runnable profile (a base
 * roster CLI plus a system prompt, model, MCP tool allowlist, skills and limits)
 * and a blueprint (saved design notes across five stages).
 *
 * Everything here is zod and pure data in, data out: the main process persists
 * profiles in `agent-profiles.json`, the renderer edits them, and a headless
 * companion run can resolve one without importing either side. The launch half
 * (prompt delivery, model flags, the typed line) lives in `agent-profile-launch.ts`.
 */
import { z } from 'zod';

import { AgentLimitsOverrideSchema } from './agent-limits';
import { defaultIdFactory, type IdFactory } from './custom-loops';

/** Every profile id starts with this, so it never collides with a roster agent id. */
export const AGENT_PROFILE_ID_PREFIX = 'profile-';

/** The most agents one user keeps. It keeps the list unvirtualised and the file small. */
export const MAX_AGENT_PROFILES = 200;

/** Longest profile name, in characters. */
export const AGENT_PROFILE_NAME_MAX = 60;

/** `agentProfile:*` failure for an id the store no longer has; the terminal falls back to the base CLI on it. */
export const AGENT_PROFILE_NOT_FOUND = 'Agent not found.';

// --- blueprint ---------------------------------------------------------------

export const AGENT_BLUEPRINT_STAGE_IDS = ['orchestrate', 'ground', 'act', 'adapt', 'operate'] as const;
export type AgentBlueprintStageId = (typeof AGENT_BLUEPRINT_STAGE_IDS)[number];

export interface AgentBlueprintOption {
  id: string;
  label: string;
  summary: string;
  /** The project's own documentation home page over https; `null` for a choice with no project. */
  docsUrl: string | null;
}

export interface AgentBlueprintStage {
  id: AgentBlueprintStageId;
  label: string;
  subtitle: string;
  summary: string;
  options: readonly AgentBlueprintOption[];
}

/** The five stages of building an agent, as data. The Builder, the list card and the Info tab all render from it. */
export const AGENT_BLUEPRINT_STAGES: readonly AgentBlueprintStage[] = [
  {
    id: 'orchestrate',
    label: 'Understand & Orchestrate',
    subtitle: 'Frameworks',
    summary: 'How the agent breaks a goal into steps and decides what runs next.',
    options: [
      {
        id: 'langgraph',
        label: 'LangGraph',
        summary: 'Models an agent as a graph of steps with shared state, so loops, branches and retries are explicit.',
        docsUrl: 'https://www.langchain.com/langgraph',
      },
      {
        id: 'crewai',
        label: 'CrewAI',
        summary: 'Runs a crew of role-based agents that hand tasks to each other toward one goal.',
        docsUrl: 'https://www.crewai.com',
      },
      {
        id: 'llamaindex-workflows',
        label: 'LlamaIndex Workflows',
        summary: 'Event-driven steps that pass typed events, well suited to retrieval-heavy agents.',
        docsUrl: 'https://www.llamaindex.ai',
      },
      {
        id: 'custom',
        label: 'Custom / in-house',
        summary: 'Your own orchestration loop, with no framework between you and the model.',
        docsUrl: null,
      },
    ],
  },
  {
    id: 'ground',
    label: 'Ingest & Ground',
    subtitle: 'RAG & data',
    summary: 'Where the agent gets facts from, so its answers rest on your data rather than on memory.',
    options: [
      {
        id: 'vector-db',
        label: 'Vector DBs (Pinecone / pgvector)',
        summary: 'Stores text as embeddings so the agent can fetch the passages closest in meaning to a question.',
        docsUrl: 'https://www.pinecone.io',
      },
      {
        id: 'hybrid-search',
        label: 'Hybrid search',
        summary: 'Combines keyword and vector search, which catches exact names that embeddings alone can miss.',
        docsUrl: 'https://www.elastic.co',
      },
      {
        id: 'managed-kb',
        label: 'Managed knowledge bases',
        summary: 'A hosted service that ingests, chunks and indexes your documents, so you run no retrieval stack.',
        docsUrl: 'https://aws.amazon.com/bedrock/knowledge-bases/',
      },
    ],
  },
  {
    id: 'act',
    label: 'Connect & Act',
    subtitle: 'Tools & MCP',
    summary: 'The tools the agent can call to read, write and run things outside the model.',
    options: [
      {
        id: 'mcp',
        label: 'Model Context Protocol',
        summary: 'An open standard for exposing tools and data to any compatible agent through one server.',
        docsUrl: 'https://modelcontextprotocol.io',
      },
      {
        id: 'api-sdks',
        label: 'Custom API SDKs',
        summary: 'Tool functions you write against your own services, called directly by the agent.',
        docsUrl: 'https://platform.claude.com',
      },
      {
        id: 'local-exec',
        label: 'Local shell / DB execution',
        summary: 'Lets the agent run shell commands and queries on this machine, within the limits you set.',
        docsUrl: 'https://www.gnu.org/software/bash/',
      },
    ],
  },
  {
    id: 'adapt',
    label: 'Optimize & Adapt',
    subtitle: 'Fine-tuning',
    summary: 'How the model itself is improved or measured for your task.',
    options: [
      {
        id: 'open-weight',
        label: 'Open-weight fine-tuning (Unsloth / Axolotl)',
        summary: 'Trains an open model on your examples, trading setup effort for control and lower running cost.',
        docsUrl: 'https://unsloth.ai',
      },
      {
        id: 'managed-apis',
        label: 'Managed APIs (OpenAI / Anthropic)',
        summary: 'Hosted models you tune through prompts and, where offered, a provider fine-tuning service.',
        docsUrl: 'https://www.anthropic.com',
      },
      {
        id: 'prompt-evals',
        label: 'Prompt evaluation frameworks',
        summary: 'Scores prompt and model changes against a fixed test set, so a tweak is measured, not guessed.',
        docsUrl: 'https://www.promptfoo.dev',
      },
    ],
  },
  {
    id: 'operate',
    label: 'Secure, Deploy & Operate',
    subtitle: 'Production',
    summary: 'What keeps the agent safe, running and observable once real people use it.',
    options: [
      {
        id: 'hosting',
        label: 'Orchestration hosting (Modal / Baseten)',
        summary: 'Runs the agent and its models on managed compute that scales with load.',
        docsUrl: 'https://modal.com',
      },
      {
        id: 'guardrails',
        label: 'Guardrails (NeMo / Llama Guard)',
        summary: 'Checks inputs and outputs against safety and policy rules before they reach a user or a tool.',
        docsUrl: 'https://developer.nvidia.com/nemo-guardrails',
      },
      {
        id: 'observability',
        label: 'Observability (LangSmith / Phoenix)',
        summary: 'Records every step and tool call as a trace, so a bad run can be replayed and diagnosed.',
        docsUrl: 'https://www.langchain.com/langsmith',
      },
    ],
  },
] as const;

const BlueprintStageChoiceSchema = z.object({
  options: z.array(z.string()).max(4).default([]),
  note: z.string().max(500).default(''),
});

/** A missing stage means nothing is chosen for it. */
export const AgentBlueprintSchema = z.partialRecord(z.enum(AGENT_BLUEPRINT_STAGE_IDS), BlueprintStageChoiceSchema);
export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;

export interface AgentBlueprintSummaryRow {
  stageId: AgentBlueprintStageId;
  stageLabel: string;
  optionLabels: string[];
  note: string;
}

/** One row per stage in stage order, unknown option ids dropped. The stack bar, list card and Info tab render from it. */
export function blueprintSummary(blueprint: AgentBlueprint): AgentBlueprintSummaryRow[] {
  return AGENT_BLUEPRINT_STAGES.map((stage) => {
    const choice = blueprint[stage.id];
    const optionLabels = (choice?.options ?? [])
      .map((id) => stage.options.find((option) => option.id === id)?.label)
      .filter((label): label is string => label !== undefined);
    return { stageId: stage.id, stageLabel: stage.label, optionLabels, note: choice?.note ?? '' };
  });
}

// --- profile -----------------------------------------------------------------

export const AgentProfileSchema = z.object({
  // Also names the prompt file on disk, so nothing but `[A-Za-z0-9_-]` may follow the prefix (no path separators or dots).
  id: z.string().regex(/^profile-[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(AGENT_PROFILE_NAME_MAX),
  description: z.string().max(280).default(''),
  /** The roster agent this profile runs on. */
  baseAgentId: z.string().min(1),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1).optional(),
  /** An `AgentModelInfo.id` from `modelsForAgent(baseAgentId)`, not a CLI string; `'default'` adds no flag. */
  model: z.string().min(1).default('default'),
  systemPrompt: z.string().max(20_000).default(''),
  /** `null` is "no restriction"; `[]` is "no midnite tools at all". */
  mcpTools: z.array(z.string()).nullable().default(null),
  skills: z.array(z.string().min(1).max(200)).max(50).default([]),
  limits: AgentLimitsOverrideSchema.default({}),
  blueprint: AgentBlueprintSchema.default({}),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

/** Keeps valid entries and drops invalid ones and later duplicates of an `id`. */
export function parseAgentProfiles(raw: unknown): AgentProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentProfile[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const parsed = AgentProfileSchema.safeParse(entry);
    if (parsed.success && !seen.has(parsed.data.id)) {
      seen.add(parsed.data.id);
      out.push(parsed.data);
    }
  }
  return out;
}

/** The id for a new profile, from the shared id factory so tests inject one. */
export function newAgentProfileId(ids: IdFactory = defaultIdFactory): string {
  const raw = ids('loop');
  const body = raw.replace(/^[a-z]+-/, '').replace(/[^A-Za-z0-9_-]/g, '');
  return `${AGENT_PROFILE_ID_PREFIX}${body}`;
}

export function createBlankAgentProfile(ids: IdFactory = defaultIdFactory, now = Date.now()): AgentProfile {
  return AgentProfileSchema.parse({
    id: newAgentProfileId(ids),
    name: 'New agent',
    baseAgentId: 'claude',
    accent: '#8b5cf6',
    createdAt: now,
    updatedAt: now,
  });
}

/** `base`, or the first of `base 2`, `base 3`, … not in `existing`; trimmed to 60 characters from `base`, never the suffix. */
export function uniqueProfileName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  const fit = (stem: string, suffix: string): string =>
    `${stem.slice(0, Math.max(0, AGENT_PROFILE_NAME_MAX - suffix.length)).trimEnd()}${suffix}`;
  const first = fit(base, '');
  if (!taken.has(first)) return first;
  for (let n = 2; ; n += 1) {
    const candidate = fit(base, ` ${n}`);
    if (!taken.has(candidate)) return candidate;
  }
}

export function duplicateAgentProfile(
  profile: AgentProfile,
  existingNames: readonly string[],
  ids: IdFactory = defaultIdFactory,
  now = Date.now(),
): AgentProfile {
  return {
    ...profile,
    id: newAgentProfileId(ids),
    name: uniqueProfileName(`${profile.name} copy`, existingNames),
    createdAt: now,
    updatedAt: now,
  };
}
