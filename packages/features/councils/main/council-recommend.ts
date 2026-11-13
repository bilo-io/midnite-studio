import {
  COUNCIL_MEMBER_PROVIDERS,
  COUNCIL_MIN_MEMBERS,
  COUNCIL_PRO_MEMBERS,
  CouncilGeneratedSchema,
  CouncilRecommendationSchema,
  failure,
  modelsForAgent,
  ok,
  type CouncilAvailableProvider,
  type CouncilGenerated,
  type CouncilMemberProvider,
  type CouncilRecommendation,
  type GitOpResult,
} from '@midnite/studio-shared';

import { askOnce, type Outcome } from './council-runner';

/**
 * "Recommend a council" (Phase 133 Theme E): one small, fast model is asked
 * for a panel to start from, the answer is validated by the wire schema, and
 * the user edits it before anything is created. Nothing here writes a council.
 *
 * "Generate with AI" (Phase 134 Theme E) rides the same path for a Custom
 * council: the synthesizer's instructions plus members with a provider and a
 * model, each held to what is available here — a provider that is not
 * installed becomes the one that answered, a model outside the catalogue (or
 * the renderer's list) is dropped back to the CLI's default.
 */

/** The model each provider is asked with — the cheapest that answers well enough to propose a panel. */
const RECOMMEND_MODELS: Record<CouncilMemberProvider, string | undefined> = {
  claude: 'haiku',
  agy: 'gemini-3.8-flash-low',
  codex: 'gpt-5-mini',
  opencode: undefined,
};

/** Fastest first: the order providers are tried in when the request names none. */
const RECOMMEND_ORDER: readonly CouncilMemberProvider[] = ['claude', 'agy', 'codex', 'opencode'];

export const COUNCIL_RECOMMEND_TIMEOUT_MS = 90_000;

export type AskFn = (provider: CouncilMemberProvider, model: string | undefined, prompt: string, limitMs: number) => Promise<Outcome>;

/** How many members a recommendation proposes when the request names no cap. */
const DEFAULT_MAX_MEMBERS = 5;

export function buildRecommendPrompt(
  name: string,
  brief: string | undefined,
  providers: readonly CouncilMemberProvider[],
  maxMembers: number = DEFAULT_MAX_MEMBERS,
): string {
  const most = clampCount(maxMembers);
  return [
    'You design small panels of AI agents ("councils") that each answer the same question from a different angle;',
    'a synthesizer then distills their answers into one.',
    '',
    `Council name: ${name}`,
    ...(brief && brief.trim().length > 0 ? [`What it is for: ${brief.trim()}`] : []),
    '',
    `Propose ${Math.min(3, most)} to ${most} members with distinct, complementary perspectives. Give each a short name and a one- or two-sentence`,
    `role written as an instruction to that member. Use only these providers: ${providers.join(', ')}.`,
    '',
    'Answer with JSON only, no prose and no code fence, in exactly this shape:',
    '{"description":"<one sentence>","synthProvider":"<provider>","members":[{"name":"<name>","role":"<role>","provider":"<provider>"}]}',
  ].join('\n');
}

function clampCount(count: number): number {
  return Math.max(COUNCIL_MIN_MEMBERS, Math.min(COUNCIL_PRO_MEMBERS, Math.round(count)));
}

/** The first `{` to the last `}` of `text`, parsed; `null` when there is no JSON object. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const raw: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Which models each provider may use: the renderer's list, held to the catalogue. */
export type ModelAvailability = ReadonlyMap<CouncilMemberProvider, ReadonlySet<string>>;

export function modelAvailability(available: readonly CouncilAvailableProvider[] | undefined): ModelAvailability | undefined {
  if (!available) return undefined;
  const map = new Map<CouncilMemberProvider, Set<string>>();
  for (const entry of available) {
    const catalogue = new Set(modelsForAgent(entry.provider).map((m) => m.id));
    map.set(entry.provider, new Set(entry.models.filter((id) => catalogue.has(id))));
  }
  return map;
}

/**
 * One proposed member, held to what is available: an unknown or uninstalled
 * provider becomes `fallback`; a model is kept only when it is in that
 * provider's available list (never without one).
 */
function coerceMember(
  value: unknown,
  allowed: readonly CouncilMemberProvider[],
  fallback: CouncilMemberProvider,
  models: ModelAvailability | undefined,
): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const { model, ...record } = value as Record<string, unknown>;
  const provider = typeof record['provider'] === 'string' && (allowed as readonly string[]).includes(record['provider'])
    ? (record['provider'] as CouncilMemberProvider)
    : fallback;
  const keep = typeof model === 'string' && models?.get(provider)?.has(model) === true;
  return { ...record, provider, ...(keep ? { model } : {}) };
}

/** A recommendation from a model's answer, validated; `null` when it is not one. */
export function parseRecommendation(
  text: string,
  allowed: readonly CouncilMemberProvider[],
  fallback: CouncilMemberProvider,
  options: { maxMembers?: number | undefined; models?: ModelAvailability | undefined } = {},
): CouncilRecommendation | null {
  const record = extractJsonObject(text);
  if (!record) return null;
  // A provider the model invented, or one not installed here, becomes the one that answered.
  record['synthProvider'] = (allowed as readonly unknown[]).includes(record['synthProvider']) ? record['synthProvider'] : fallback;
  if (Array.isArray(record['members'])) {
    record['members'] = record['members']
      .slice(0, clampCount(options.maxMembers ?? COUNCIL_PRO_MEMBERS))
      .map((m: unknown) => coerceMember(m, allowed, fallback, options.models));
  }
  const parsed = CouncilRecommendationSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export async function recommendCouncil(
  request: {
    name: string;
    brief?: string | undefined;
    providers?: CouncilMemberProvider[] | undefined;
    maxMembers?: number | undefined;
    models?: CouncilAvailableProvider[] | undefined;
  },
  ask: AskFn = askOnce,
): Promise<GitOpResult<CouncilRecommendation>> {
  const installed = request.providers && request.providers.length > 0 ? request.providers : [...COUNCIL_MEMBER_PROVIDERS];
  const order = RECOMMEND_ORDER.filter((p) => installed.includes(p));
  if (order.length === 0) return failure('No council agent is installed to ask for a recommendation.');

  const reasons: string[] = [];
  for (const provider of order) {
    const prompt = buildRecommendPrompt(request.name, request.brief, installed, request.maxMembers);
    const outcome = await ask(provider, RECOMMEND_MODELS[provider], prompt, COUNCIL_RECOMMEND_TIMEOUT_MS);
    if (outcome.status === 'succeeded') {
      const recommendation = parseRecommendation(outcome.text, installed, provider, {
        maxMembers: request.maxMembers,
        models: modelAvailability(request.models),
      });
      if (recommendation) return ok(recommendation);
      reasons.push(`${provider}: the answer was not a council`);
    } else {
      reasons.push(`${provider}: ${outcome.error ?? outcome.status}`);
    }
  }
  return failure(`Could not get a recommendation (${reasons.join('; ')}).`);
}

// --- Generate with AI (Phase 134 Theme E) -------------------------------------

export function buildGeneratePrompt(input: {
  name: string;
  topic?: string | undefined;
  count: number;
  available: readonly CouncilAvailableProvider[];
}): string {
  const providers = input.available.map((entry) =>
    entry.models.length > 0 ? `- ${entry.provider}: models ${entry.models.join(', ')}` : `- ${entry.provider}: its default model only (omit "model")`,
  );
  return [
    'You design small panels of AI agents ("councils") that each answer the same question from a different angle;',
    'a synthesizer then combines their answers by following its instructions.',
    '',
    `Council name: ${input.name}`,
    ...(input.topic && input.topic.trim().length > 0 ? [`What it will be asked: ${input.topic.trim()}`] : []),
    '',
    `Write the synthesizer's instructions (two to four sentences saying how to combine the answers and what to end with),`,
    `and exactly ${input.count} members with distinct, complementary perspectives. Give each a short name and a one- or`,
    'two-sentence perspective written as an instruction to that member, a provider and a model.',
    'Use only these providers and models, mixing them where it helps:',
    ...providers,
    '',
    'Answer with JSON only, no prose and no code fence, in exactly this shape:',
    '{"instructions":"<instructions>","members":[{"name":"<name>","role":"<perspective>","provider":"<provider>","model":"<model>"}]}',
  ].join('\n');
}

/** A generated council from a model's answer, held to what is available; `null` when it is not one. */
export function parseGenerated(
  text: string,
  available: readonly CouncilAvailableProvider[],
  fallback: CouncilMemberProvider,
  count: number,
): CouncilGenerated | null {
  const record = extractJsonObject(text);
  if (!record) return null;
  const allowed = available.map((entry) => entry.provider);
  const models = modelAvailability(available);
  if (Array.isArray(record['members'])) {
    record['members'] = record['members'].slice(0, clampCount(count)).map((m: unknown) => coerceMember(m, allowed, fallback, models));
  }
  const parsed = CouncilGeneratedSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export async function generateCouncil(
  request: { name: string; topic?: string | undefined; count: number; providers: CouncilAvailableProvider[] },
  ask: AskFn = askOnce,
): Promise<GitOpResult<CouncilGenerated>> {
  const available = request.providers.filter((entry) => (COUNCIL_MEMBER_PROVIDERS as readonly string[]).includes(entry.provider));
  const installed = available.map((entry) => entry.provider);
  const order = RECOMMEND_ORDER.filter((p) => installed.includes(p));
  if (order.length === 0) return failure('No council agent is installed to generate with.');

  const count = clampCount(request.count);
  const prompt = buildGeneratePrompt({ name: request.name, topic: request.topic, count, available });
  const reasons: string[] = [];
  for (const provider of order) {
    const outcome = await ask(provider, RECOMMEND_MODELS[provider], prompt, COUNCIL_RECOMMEND_TIMEOUT_MS);
    if (outcome.status === 'succeeded') {
      const generated = parseGenerated(outcome.text, available, provider, count);
      if (generated) return ok(generated);
      reasons.push(`${provider}: the answer was not a council`);
    } else {
      reasons.push(`${provider}: ${outcome.error ?? outcome.status}`);
    }
  }
  return failure(`Could not generate a council (${reasons.join('; ')}).`);
}
