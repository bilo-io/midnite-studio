/**
 * Pure prompt construction for a council run — no pty, no IPC, no store.
 *
 * Brainstorm-only for this phase (see `council.ts`'s `CouncilFormatSchema`),
 * and always attributed: unlike upstream's `debate`/`critique` formats, no
 * shuffle or A/B/C relabeling happens here, so `buildSynthesisPrompt` can name
 * every member by their real name and role directly.
 *
 * Two parts of these prompts are not the user's own typing and are fenced as untrusted data
 * (Phase 121 Theme A, the same `fenceUntrusted` Chats uses): a topic whose provenance says it was
 * pasted from somewhere else, and every member answer the synthesizer reads, which is another
 * model's output and may carry whatever that model was fed.
 */
import {
  COUNCIL_FOLLOW_UP_EXCERPT_CHARS,
  COUNCIL_SYNTHESIS_ENTRY_CHARS,
  fenceUntrusted,
  sanitizeLabel,
  untrustedHeaderFor,
  type ContentProvenance,
} from '@midnite/studio-shared';

/** `text` cut to `max` characters at a word boundary where one is near, marked when cut. */
export function excerpt(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd()} […]`;
}

/** What one member is asked, given the run's topic and their own role. */
export function buildMemberPrompt(topic: string, role: string, topicProvenance?: Partial<ContentProvenance>): string {
  const header = untrustedHeaderFor([topicProvenance], 'user');
  return [
    ...(header === '' ? [] : [header, '']),
    'You are one member of a brainstorming council. Answer briefly and directly from your',
    "assigned role's perspective — you are not the only voice being consulted, so favor a",
    'sharp, opinionated take over a balanced survey.',
    '',
    `Your role: ${role}`,
    '',
    `Topic: ${fenceUntrusted(topic, topicProvenance, 'user')}`,
  ].join('\n');
}

export type CouncilSynthesisEntry = {
  name: string;
  role: string;
  /** Empty for a member that failed, timed out, or was skipped. */
  output: string;
  status: 'succeeded' | 'failed' | 'timeout' | 'skipped' | 'cancelled';
};

/**
 * What the synthesizer is asked, given every member's (attributed) answer.
 *
 * A member that never produced usable output is still listed — by name, with
 * its status — rather than silently dropped, so the synthesis can say "the
 * Skeptic's answer timed out" instead of reading like the panel had one fewer
 * member than it did.
 */
export function buildSynthesisPrompt(
  topic: string,
  entries: readonly CouncilSynthesisEntry[],
  topicProvenance?: Partial<ContentProvenance>,
  previousSynthesis?: string,
): string {
  const sections = entries.map((entry) => {
    if (entry.status !== 'succeeded' || entry.output.trim().length === 0) {
      return `### ${sanitizeLabel(entry.name)} (${sanitizeLabel(entry.role, 200)})\n[${entry.status} — no answer to include]`;
    }
    // Bounded per member, so the synthesizer's prompt cannot grow with the capture cap.
    const answer = excerpt(entry.output, COUNCIL_SYNTHESIS_ENTRY_CHARS);
    return `### ${sanitizeLabel(entry.name)} (${sanitizeLabel(entry.role, 200)})\n${fenceUntrusted(answer, { origin: 'agent-output', ref: entry.name })}`;
  });

  const anyAnswer = entries.some((e) => e.status === 'succeeded' && e.output.trim().length > 0);
  const header = anyAnswer ? untrustedHeaderFor([{ origin: 'agent-output' }]) : untrustedHeaderFor([topicProvenance], 'user');
  return [
    ...(header === '' ? [] : [header]),
    'You are synthesizing a brainstorming council\'s answers into one considered write-up.',
    'Distill the panel\'s answers below into a single, coherent brainstorm: pull out the',
    'strongest ideas, note real disagreements between members rather than papering over them,',
    'and end with a short list of concrete next steps. Write the synthesis itself — do not',
    'restate this instruction, and do not simply summarize each member in turn.',
    '',
    ...(previousSynthesis && previousSynthesis.trim().length > 0
      ? [
          'This is a follow-up turn. An excerpt of the previous synthesis, for continuity:',
          fenceUntrusted(excerpt(previousSynthesis, COUNCIL_FOLLOW_UP_EXCERPT_CHARS), { origin: 'agent-output', ref: 'previous synthesis' }),
        ]
      : []),
    `Topic: ${fenceUntrusted(topic, topicProvenance, 'user')}`,
    '',
    ...sections,
  ].join('\n\n');
}

/**
 * A follow-up turn's member prompt (Phase 133 Theme D): the user's new
 * question plus an excerpt of where the council landed last time — a pointer,
 * not every member's transcript. A member whose CLI session is resumed already
 * remembers its own earlier answer; one that starts fresh is also reminded of
 * its role and the thread's first topic.
 */
export function buildFollowUpPrompt(input: {
  prompt: string;
  role: string;
  previousSynthesis: string | undefined;
  firstTopic: string;
  resumed: boolean;
}): string {
  const synthesis = input.previousSynthesis?.trim() ?? '';
  const header = synthesis.length > 0 ? untrustedHeaderFor([{ origin: 'agent-output' }]) : '';
  return [
    ...(header === '' ? [] : [header, '']),
    input.resumed
      ? 'The council continues. Answer the follow-up below from the same role as before.'
      : [
          'You are one member of a brainstorming council, joining a follow-up turn. Answer briefly and',
          "directly from your assigned role's perspective.",
          '',
          `Your role: ${input.role}`,
          '',
          `The council's original topic: ${fenceUntrusted(input.firstTopic, undefined, 'user')}`,
        ].join('\n'),
    '',
    ...(synthesis.length > 0
      ? [
          'Where the council landed last turn (an excerpt of the synthesis):',
          fenceUntrusted(excerpt(synthesis, COUNCIL_FOLLOW_UP_EXCERPT_CHARS), { origin: 'agent-output', ref: 'previous synthesis' }),
          '',
        ]
      : []),
    `Follow-up: ${fenceUntrusted(input.prompt, undefined, 'user')}`,
  ].join('\n');
}
