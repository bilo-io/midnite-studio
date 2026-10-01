import { readChangeText, type ChangeText } from '@midnite/studio-git-engine';
import {
  failure,
  fastModelFor,
  modelArgsFor,
  ok,
  type GitOpResult,
} from '@midnite/studio-shared';

import { runHeadlessText, defaultAiImproveFieldDeps, type AiImproveFieldDeps } from './improve-field';

/**
 * "Write with AI" on the commit box. Read-only: reads a diff, asks the active
 * provider's FASTEST model (`fastModelFor`, e.g. Claude -> `haiku`) for a
 * Conventional Commits message, and hands the text back. It rides
 * `runHeadlessText`, the same runner the wand and Docs use, so provider
 * resolution, Ollama routing, timeouts and the `GitOpResult` envelope are
 * all shared rather than rebuilt.
 */
export const AI_COMMIT_MESSAGE_TIMEOUT_MS = 30_000;

/** Diff budget sent to the model. Total patch characters, then per file. */
export const COMMIT_DIFF_TOTAL_CAP = 12_000;
export const COMMIT_DIFF_FILE_CAP = 2_500;
const STAT_CAP = 3_000;
const UNTRACKED_LIST_CAP = 40;

/** Split a unified patch into per-file chunks at each `diff --git` header. */
function splitPatch(patch: string): string[] {
  return patch.split(/^(?=diff --git )/m).filter((chunk) => chunk.trim().length > 0);
}

/**
 * Cap the patch: each file's chunk is cut to {@link COMMIT_DIFF_FILE_CAP} (a
 * big file must not starve the others), then chunks are added until
 * {@link COMMIT_DIFF_TOTAL_CAP} is spent; what is left out is counted in a
 * trailing note. `--stat` is sent separately and uncut, so the model always
 * sees every file's name even when its hunks were dropped.
 */
export function capPatch(patch: string): string {
  const chunks = splitPatch(patch);
  const kept: string[] = [];
  let used = 0;
  let omitted = 0;
  for (const chunk of chunks) {
    if (used >= COMMIT_DIFF_TOTAL_CAP) {
      omitted += 1;
      continue;
    }
    const room = Math.min(COMMIT_DIFF_FILE_CAP, COMMIT_DIFF_TOTAL_CAP - used);
    const piece = chunk.length > room ? `${chunk.slice(0, room)}\n[... file diff truncated]\n` : chunk;
    kept.push(piece);
    used += piece.length;
  }
  if (omitted > 0) kept.push(`[... ${omitted} more file diff(s) omitted, see the stat above]\n`);
  return kept.join('');
}

export function buildCommitMessagePrompt(change: ChangeText): string {
  const untracked = change.untracked.slice(0, UNTRACKED_LIST_CAP);
  const extra = change.untracked.length - untracked.length;
  return [
    'Write a git commit message for the changes below.',
    'Follow Conventional Commits exactly:',
    '- first line: type(scope): subject, at most 72 characters, imperative mood, no trailing period;',
    '  type is one of feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert;',
    '  scope is optional (omit the parentheses if there is none);',
    '- then a blank line and, only if the change merits it, a short body wrapped at 72 columns',
    '  explaining what and why;',
    '- no markdown, no code fence, no quotes, no preamble, no trailer lines.',
    'Reply with ONLY the commit message.',
    '',
    change.source === 'staged'
      ? 'These are the STAGED changes (what the commit will contain):'
      : 'Nothing is staged; these are the working-tree changes:',
    '',
    'Summary:',
    change.stat.slice(0, STAT_CAP),
    ...(untracked.length > 0
      ? [
          'New untracked files:',
          ...untracked.map((p) => `  ${p}`),
          ...(extra > 0 ? [`  ... and ${extra} more`] : []),
          '',
        ]
      : []),
    'Diff:',
    capPatch(change.patch),
  ].join('\n');
}

/** Models sometimes fence or quote the reply despite the instruction. */
export function cleanCommitMessage(raw: string): string {
  let text = raw.trim();
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(text);
  if (fenced?.[1]) text = fenced[1].trim();
  return text.replace(/\r\n/g, '\n');
}

export type AiCommitMessageInput = {
  /** Resolved checkout directory (already validated by the handler). */
  cwd: string;
  agentId?: string | undefined;
  ollamaModel?: string | undefined;
};

export async function generateCommitMessage(
  input: AiCommitMessageInput,
  deps: AiImproveFieldDeps = defaultAiImproveFieldDeps,
  readChanges: (cwd: string) => Promise<ChangeText | null> = readChangeText,
): Promise<GitOpResult<{ text: string; source: 'staged' | 'working' }>> {
  const change = await readChanges(input.cwd);
  if (!change) return failure('There are no changes to describe.');

  const result = await runHeadlessText(
    {
      prompt: buildCommitMessagePrompt(change),
      agentId: input.agentId,
      repoPath: input.cwd,
      ollamaModel: input.ollamaModel,
      modelArgs: (agentId) => {
        const model = fastModelFor(agentId);
        return model ? modelArgsFor(agentId, model) : [];
      },
      what: 'Write with AI',
    },
    deps,
    AI_COMMIT_MESSAGE_TIMEOUT_MS,
  );
  if (!result.ok) return result;
  const text = cleanCommitMessage(result.value.text);
  return text.length === 0
    ? failure('The model answered with nothing.')
    : ok({ text, source: change.source });
}
