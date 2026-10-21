import { loopModelArgs, ok, type GitOpResult, type LoopModel } from '@midnite/studio-shared';

import { defaultAiImproveFieldDeps, runHeadlessText, type AiImproveFieldDeps } from './improve-field';

/**
 * Docs' AI edit (Phase 99 Theme B) — `improve-field.ts`'s headless seam,
 * generalised from "one field" to "one markdown doc, or the selection in it".
 *
 * The agent answers **replacement markdown only**; nothing is written here.
 * The renderer shows it as a diff card and writes through `media:file-write`
 * only on Accept. Unlike the wand this runs the thread picker's model (the
 * primary agent's default when none is chosen) — an edit to a document is the
 * user's actual work, not a disposable field rewrite on the cheap tier.
 */

/** A whole-doc rewrite of a long doc takes a while; the wand's 30 s does not fit. */
export const DOC_EDIT_TIMEOUT_MS = 180_000;

export type DocEditInput = {
  docName: string;
  markdown: string;
  selection?: string | undefined;
  prompt: string;
  agentId?: string | undefined;
  model?: LoopModel | undefined;
  repoPath?: string | null | undefined;
  ollamaModel?: string | undefined;
};

export function buildDocEditPrompt(input: DocEditInput): string {
  const scoped = input.selection !== undefined && input.selection.trim().length > 0;
  const rules = [
    'Reply with ONLY the replacement markdown and nothing else —',
    'no preamble, no explanation, no surrounding code fence.',
    'Preserve the markdown conventions already in use (heading levels, list markers, task lists, tables).',
  ];
  return scoped
    ? [
        `You are editing part of the markdown document "${input.docName}".`,
        'Rewrite ONLY the selected passage below, following the instruction.',
        'Your reply replaces the selection verbatim, so do not repeat any text outside it.',
        ...rules,
        '',
        `Instruction: ${input.prompt}`,
        '',
        'Selected passage:',
        '<<<SELECTION',
        input.selection,
        'SELECTION>>>',
        '',
        'Whole document, for context only — do not rewrite anything outside the selection:',
        '<<<DOC',
        input.markdown,
        'DOC>>>',
      ].join('\n')
    : [
        `You are editing the markdown document "${input.docName}".`,
        'Apply the instruction to the document and reply with the full, updated document.',
        ...rules,
        '',
        `Instruction: ${input.prompt}`,
        '',
        '<<<DOC',
        input.markdown,
        'DOC>>>',
      ].join('\n');
}

/**
 * Agents wrap markdown in a fence despite being told not to; one outer
 * ```` ```markdown ```` / ```` ``` ```` pair around the whole reply is
 * unwrapped. A fence that is part of the content (text around it) is kept.
 */
export function unwrapMarkdownFence(text: string): string {
  const match = /^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```[ \t]*$/i.exec(text.trim());
  return match ? match[1]! : text;
}

export async function runDocEdit(
  input: DocEditInput,
  deps: AiImproveFieldDeps = defaultAiImproveFieldDeps,
): Promise<GitOpResult<{ replacement: string }>> {
  const result = await runHeadlessText(
    {
      prompt: buildDocEditPrompt(input),
      agentId: input.agentId,
      repoPath: input.repoPath,
      ollamaModel: input.ollamaModel,
      modelArgs: (agentId) => (input.model ? loopModelArgs(agentId, input.model) : []),
      what: 'Ask AI',
    },
    deps,
    DOC_EDIT_TIMEOUT_MS,
  );
  if (!result.ok) return result;
  return ok({ replacement: unwrapMarkdownFence(result.value.text) });
}
