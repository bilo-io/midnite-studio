/**
 * Pure prompt construction for a council run — no pty, no IPC, no store.
 *
 * Brainstorm-only for this phase (see `council.ts`'s `CouncilFormatSchema`),
 * and always attributed: unlike upstream's `debate`/`critique` formats, no
 * shuffle or A/B/C relabeling happens here, so `buildSynthesisPrompt` can name
 * every member by their real name and role directly.
 */

/** What one member is asked, given the run's topic and their own role. */
export function buildMemberPrompt(topic: string, role: string): string {
  return [
    'You are one member of a brainstorming council. Answer briefly and directly from your',
    "assigned role's perspective — you are not the only voice being consulted, so favor a",
    'sharp, opinionated take over a balanced survey.',
    '',
    `Your role: ${role}`,
    '',
    `Topic: ${topic}`,
  ].join('\n');
}

export type CouncilSynthesisEntry = {
  name: string;
  role: string;
  /** Empty for a member that failed, timed out, or was skipped. */
  output: string;
  status: 'succeeded' | 'failed' | 'timeout' | 'skipped';
};

/**
 * What the synthesizer is asked, given every member's (attributed) answer.
 *
 * A member that never produced usable output is still listed — by name, with
 * its status — rather than silently dropped, so the synthesis can say "the
 * Skeptic's answer timed out" instead of reading like the panel had one fewer
 * member than it did.
 */
export function buildSynthesisPrompt(topic: string, entries: readonly CouncilSynthesisEntry[]): string {
  const sections = entries.map((entry) => {
    if (entry.status !== 'succeeded' || entry.output.trim().length === 0) {
      return `### ${entry.name} (${entry.role})\n[${entry.status} — no answer to include]`;
    }
    return `### ${entry.name} (${entry.role})\n${entry.output.trim()}`;
  });

  return [
    'You are synthesizing a brainstorming council\'s answers into one considered write-up.',
    'Distill the panel\'s answers below into a single, coherent brainstorm: pull out the',
    'strongest ideas, note real disagreements between members rather than papering over them,',
    'and end with a short list of concrete next steps. Write the synthesis itself — do not',
    'restate this instruction, and do not simply summarize each member in turn.',
    '',
    `Topic: ${topic}`,
    '',
    ...sections,
  ].join('\n\n');
}
