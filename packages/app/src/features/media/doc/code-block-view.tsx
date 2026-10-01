import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

/**
 * The Docs code block's node view: the usual `<pre><code>` plus a language
 * picker pinned to its top-right corner. Picking writes the node's `language`
 * attr, which the markdown serializer emits as the fence info string.
 *
 * Options come from `lowlight.listLanguages()` (passed in as an extension
 * option), plus "Auto" (`language: null`, lowlight guesses) and the current
 * value when it is an alias not in that list (```` ```ts ````), so opening a
 * doc never silently rewrites its fences.
 */
export const AUTO_LANGUAGE = '';

export function languageOptions(languages: readonly string[], current: string | null): string[] {
  const set = new Set(languages);
  if (current && !set.has(current)) set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}

const labelFor = (lang: string): string => (lang === 'plaintext' ? 'Plain text' : lang);

export function CodeBlockView({ node, updateAttributes, extension, editor }: NodeViewProps) {
  const current = (node.attrs.language as string | null) || null;
  const languages = (extension.options.languages as readonly string[] | undefined) ?? [];
  const options = languageOptions(languages, current);
  return (
    <NodeViewWrapper className="doc-code-block group relative">
      <select
        contentEditable={false}
        aria-label="Code language"
        data-testid="code-language"
        className="doc-code-lang absolute right-2 top-2 z-10 max-w-[9rem] cursor-pointer rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground opacity-60 outline-none transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
        value={current ?? AUTO_LANGUAGE}
        disabled={!editor.isEditable}
        onChange={(e) => updateAttributes({ language: e.target.value === AUTO_LANGUAGE ? null : e.target.value })}
      >
        <option value={AUTO_LANGUAGE}>Auto</option>
        {options.map((lang) => (
          <option key={lang} value={lang}>
            {labelFor(lang)}
          </option>
        ))}
      </select>
      <pre>
        <NodeViewContent<'code'> as="code" className={current ? `language-${current}` : undefined} />
      </pre>
    </NodeViewWrapper>
  );
}
