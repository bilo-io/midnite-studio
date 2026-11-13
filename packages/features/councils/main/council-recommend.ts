import {
  COUNCIL_MEMBER_PROVIDERS,
  CouncilRecommendationSchema,
  failure,
  ok,
  type CouncilMemberProvider,
  type CouncilRecommendation,
  type GitOpResult,
} from '@midnite/studio-shared';

import { askOnce, type Outcome } from './council-runner';

/**
 * "Recommend a council" (Phase 133 Theme E): one small, fast model is asked
 * for a panel to start from, the answer is validated by the wire schema, and
 * the user edits it before anything is created. Nothing here writes a council.
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

export function buildRecommendPrompt(name: string, brief: string | undefined, providers: readonly CouncilMemberProvider[]): string {
  return [
    'You design small panels of AI agents ("councils") that each answer the same question from a different angle;',
    'a synthesizer then distills their answers into one.',
    '',
    `Council name: ${name}`,
    ...(brief && brief.trim().length > 0 ? [`What it is for: ${brief.trim()}`] : []),
    '',
    'Propose 3 to 5 members with distinct, complementary perspectives. Give each a short name and a one- or two-sentence',
    `role written as an instruction to that member. Use only these providers: ${providers.join(', ')}.`,
    '',
    'Answer with JSON only, no prose and no code fence, in exactly this shape:',
    '{"description":"<one sentence>","synthProvider":"<provider>","members":[{"name":"<name>","role":"<role>","provider":"<provider>"}]}',
  ].join('\n');
}

/** The first `{` to the last `}` of `text`, parsed and validated; `null` when it is not a recommendation. */
export function parseRecommendation(text: string, allowed: readonly CouncilMemberProvider[], fallback: CouncilMemberProvider): CouncilRecommendation | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  // A provider the model invented, or one not installed here, becomes the one that answered.
  const coerce = (value: unknown): unknown =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value : fallback;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    record['synthProvider'] = coerce(record['synthProvider']);
    if (Array.isArray(record['members'])) {
      record['members'] = record['members']
        .slice(0, 6)
        .map((m: unknown) => (typeof m === 'object' && m !== null ? { ...(m as Record<string, unknown>), provider: coerce((m as Record<string, unknown>)['provider']) } : m));
    }
  }
  const parsed = CouncilRecommendationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function recommendCouncil(
  request: { name: string; brief?: string | undefined; providers?: CouncilMemberProvider[] | undefined },
  ask: AskFn = askOnce,
): Promise<GitOpResult<CouncilRecommendation>> {
  const installed = request.providers && request.providers.length > 0 ? request.providers : [...COUNCIL_MEMBER_PROVIDERS];
  const order = RECOMMEND_ORDER.filter((p) => installed.includes(p));
  if (order.length === 0) return failure('No council agent is installed to ask for a recommendation.');

  const reasons: string[] = [];
  for (const provider of order) {
    const outcome = await ask(provider, RECOMMEND_MODELS[provider], buildRecommendPrompt(request.name, request.brief, installed), COUNCIL_RECOMMEND_TIMEOUT_MS);
    if (outcome.status === 'succeeded') {
      const recommendation = parseRecommendation(outcome.text, installed, provider);
      if (recommendation) return ok(recommendation);
      reasons.push(`${provider}: the answer was not a council`);
    } else {
      reasons.push(`${provider}: ${outcome.error ?? outcome.status}`);
    }
  }
  return failure(`Could not get a recommendation (${reasons.join('; ')}).`);
}
