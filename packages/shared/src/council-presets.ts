/**
 * The synthesis presets (Phase 134 Theme A): how each kind of council asks its
 * members to answer and its synthesizer to combine them, agreed with the user.
 *
 * - **Brainstorm** — members diverge; the synthesizer clusters and ranks.
 * - **Debate** — members take opposing positions; the synthesizer judges.
 * - **Promote / Demote** — one argues for, one against; the synthesizer weighs them into a recommendation.
 * - **Review / Red team** — risk, security and UX critics; the synthesizer lists must-fix items.
 *
 * Every preset brings 2–3 members, so each fits the free tier's cap of three.
 * `custom` has no preset: its instructions are the user's own (or generated).
 */
import type { CouncilSynthesisType } from './council';

export type CouncilPresetType = Exclude<CouncilSynthesisType, 'custom'>;

export type CouncilPresetMember = { name: string; role: string };

export type CouncilSynthesisPreset = {
  label: string;
  /** One line for the dropdown and the recommendation. */
  summary: string;
  /** What the council calls itself in each member's prompt ("a debate council"). */
  noun: string;
  /** The synthesizer's instructions, fed to `buildSynthesisPrompt`. */
  instructions: string;
  members: readonly CouncilPresetMember[];
};

export const COUNCIL_SYNTHESIS_PRESETS: Readonly<Record<CouncilPresetType, CouncilSynthesisPreset>> = {
  brainstorm: {
    label: 'Brainstorm',
    summary: 'Members diverge; the synthesizer clusters and ranks the ideas.',
    noun: 'brainstorming',
    instructions: [
      "Distill the panel's answers into one considered brainstorm. Cluster related ideas under short headings,",
      'rank the clusters from strongest to weakest with a one-line reason each, note real disagreements between',
      'members rather than papering over them, and end with a short list of concrete next steps.',
    ].join(' '),
    members: [
      { name: 'Visionary', role: 'Ignore near-term constraints: propose the most ambitious, unexpected ideas you can.' },
      { name: 'Pragmatist', role: 'Propose ideas that could ship soon with the time, cost and people realistically available.' },
      { name: 'Contrarian', role: 'Propose the ideas nobody else will: invert the obvious approach and question the framing.' },
    ],
  },
  debate: {
    label: 'Debate',
    summary: 'Members take opposing positions; the synthesizer judges.',
    noun: 'debate',
    instructions: [
      "Judge the debate. State each side's position in a sentence, weigh the strongest argument and the weakest",
      'point of each, say which side made the better case and why, and give a verdict with your confidence. Name',
      'anything that would change the verdict.',
    ].join(' '),
    members: [
      { name: 'Affirmative', role: 'Take the position in favour and argue it as strongly as the evidence allows.' },
      { name: 'Negative', role: 'Take the position against and argue it as strongly as the evidence allows.' },
      { name: 'Cross-examiner', role: 'Press both positions: find the unsupported claims and the questions each side avoids.' },
    ],
  },
  'promote-demote': {
    label: 'Promote / Demote',
    summary: 'One argues for, one against; the synthesizer weighs them into a recommendation.',
    noun: 'promote / demote',
    instructions: [
      'Weigh the case for against the case against. List the benefits and the costs that survive scrutiny, say',
      'which outweighs the other and by how much, and finish with one clear recommendation (do it, do not, or do',
      'it with conditions) and the conditions, if any.',
    ].join(' '),
    members: [
      { name: 'Promoter', role: 'Make the strongest honest case FOR this: the benefits, who gains, and why now.' },
      { name: 'Demoter', role: 'Make the strongest honest case AGAINST this: the costs, the risks, and what it displaces.' },
    ],
  },
  review: {
    label: 'Review / Red team',
    summary: 'Risk, security and UX critics; the synthesizer lists must-fix items.',
    noun: 'review',
    instructions: [
      "Merge the critics' findings into one review. De-duplicate, then list the must-fix items first (each with",
      'why it matters and a suggested fix), then should-fix, then nits. Drop findings no critic supported with a',
      'concrete reason, and say plainly if nothing must be fixed.',
    ].join(' '),
    members: [
      { name: 'Risk critic', role: 'Find what could go wrong: failure modes, edge cases, rollback and operational risk.' },
      { name: 'Security critic', role: 'Red-team it: how could it be abused, what leaks, what trust is assumed.' },
      { name: 'UX critic', role: 'Find where people will be confused, slowed down or surprised, and what they will expect instead.' },
    ],
  },
};

export const COUNCIL_PRESET_TYPES = Object.keys(COUNCIL_SYNTHESIS_PRESETS) as CouncilPresetType[];

/** The label for any synthesis type, Custom included. */
export function councilSynthesisLabel(type: CouncilSynthesisType): string {
  return type === 'custom' ? 'Custom' : COUNCIL_SYNTHESIS_PRESETS[type].label;
}

/**
 * The instructions a synthesizer runs with: the stored ones when present,
 * otherwise the preset's (Custom without any falls back to Brainstorm's, so a
 * synthesis is never instruction-less).
 */
export function resolveSynthInstructions(type: CouncilSynthesisType, stored: string | undefined): string {
  const trimmed = stored?.trim() ?? '';
  if (trimmed.length > 0) return trimmed;
  return COUNCIL_SYNTHESIS_PRESETS[type === 'custom' ? 'brainstorm' : type].instructions;
}

/** What each member's prompt calls the council ("a debate council"). */
export function councilNoun(type: CouncilSynthesisType): string {
  return type === 'custom' ? '' : COUNCIL_SYNTHESIS_PRESETS[type].noun;
}

export type SynthesisTypeRecommendation = { type: CouncilPresetType; reason: string };

/**
 * Which preset fits a prompt — a cheap keyword heuristic (Decision 4), checked
 * in order: a review, a two-sided choice, a for-or-against question, else a
 * brainstorm. It only suggests; the user picks.
 */
const RULES: readonly { type: CouncilPresetType; reason: string; pattern: RegExp }[] = [
  {
    type: 'review',
    reason: 'It asks for a review, an audit or the risks.',
    pattern: /\b(review|audit|red[- ]?team|security|vulnerab\w*|threat|risks?|critique|pen[- ]?test|bugs?|what could go wrong)\b/i,
  },
  {
    type: 'debate',
    reason: 'It sets two options against each other.',
    pattern: /\b(vs\.?|versus|which is better|better than|compared? (to|with)|or should|debate|argue)\b/i,
  },
  {
    type: 'promote-demote',
    reason: 'It asks whether to do one thing.',
    pattern: /\b(should (we|i|you)|is it worth|worth it|pros and cons|adopt|go ahead|ship|approve|keep or|drop)\b/i,
  },
  {
    type: 'brainstorm',
    reason: 'It asks for ideas.',
    pattern: /\b(ideas?|brainstorm|how (might|could|can) (we|i)|ways to|options for|names? for|suggest)\b/i,
  },
];

export function recommendSynthesisType(topic: string): SynthesisTypeRecommendation | null {
  const text = topic.trim();
  if (text.length === 0) return null;
  for (const rule of RULES) if (rule.pattern.test(text)) return { type: rule.type, reason: rule.reason };
  return { type: 'brainstorm', reason: 'An open question suits a brainstorm.' };
}
