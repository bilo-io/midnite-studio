import { useEffect, useRef } from 'react';

import Editor, { type OnChange, type OnMount } from '@monaco-editor/react';

import { DEFAULT_EDITOR_FONT_FAMILY } from '../../lib/monaco/editor-prefs';
import { getMonaco } from '../../lib/monaco/monaco-loader';
import { useUiStore } from '../../store/ui-store';
import { useStudioMonacoTheme } from '../themes/use-studio-monaco-theme';

// Eagerly configures `@monaco-editor/react`'s loader onto the locally bundled
// `monaco` instance the moment this module evaluates — same reasoning as
// `code-editor.tsx`'s identical top-of-module call: before `<Editor>` below
// ever mounts and reaches for its own default CDN loader.
void getMonaco();

/**
 * The query tab's SQL editor — Monaco (`@monaco-editor/react`), not
 * CodeMirror.
 *
 * The phase doc as written planned a CodeMirror setup (`@codemirror/lang-sql`,
 * "reuses `code-editor.tsx`'s setup … rather than adopting Monaco or a second
 * editor stack"), gated against Phase 64's own plan to replace that same file
 * with Monaco (Decision 9). By the time this batch landed, **Phase 64's
 * Monaco replacement had already shipped** (`features/files/preview/code-editor.tsx`
 * is Monaco today, confirmed by reading it) — so building a NEW CodeMirror
 * consumer here would do the opposite of Decision 9's own contingency ("if
 * P61 lands first, @codemirror/lang-sql plus the core packages stay for this
 * consumer alone"): it would re-introduce a second editor engine into a
 * codebase that had just finished removing one, and hold P64 Theme G's
 * `@codemirror/*` cleanup hostage to a dependency this file never needed.
 * Monaco already ships built-in `sql` tokenisation (`monaco-languages`'s
 * basic-languages set — no extra package, unlike CodeMirror's
 * `@codemirror/lang-sql`), and `monaco-languageForFile`'s `sql: 'sql'`
 * mapping already exists. So: Monaco, no new dependency, and P64 Theme G was
 * free to remove `@codemirror/*` without waiting on this phase — it since
 * has (PR #221, 2026-09-06): the seven `@codemirror/*` entries are gone from
 * `packages/app/package.json`, and nothing in the workspace imports them.
 *
 * Deliberately its own standalone setup rather than a shared component with
 * `code-editor.tsx` — the file-editor store shape (saved/dirty content,
 * discard/reload) does not fit a query tab, whose only persisted state is the
 * tab's own `sql` field in `workbench-store.ts`. A remount per active tab
 * (the call site keys this on `tab.id`, same as `Workbench`'s own
 * active-body swap) is what makes `defaultValue` correct with no store↔view
 * sync effect: switching tabs is a fresh mount reading that tab's own sql,
 * never a live update to the same instance.
 */
export function QueryEditor({
  sql,
  onChange,
  onRunChord,
}: {
  sql: string;
  onChange: (sql: string) => void;
  /** `Mod+Enter` is `status.commit` app-wide (Decision 4) — handled locally on the editor, not as a registered command. */
  onRunChord: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fontFamily = useUiStore((s) => s.editorFontFamily) || DEFAULT_EDITOR_FONT_FAMILY;
  const fontSize = useUiStore((s) => s.editorFontSize);
  const tabSize = useUiStore((s) => s.editorTabSize);

  // This mount site previously had no studio-theme effect at all — it just
  // hardcoded the `theme` prop below, so the query editor never picked up a
  // palette (a second, separate defect from the six mount sites' shared
  // override bug).
  useStudioMonacoTheme();

  const handleMount: OnMount = (editor, monaco) => {
    editor.focus();

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunChord());

    const host = hostRef.current;
    if (host) {
      const observer = new ResizeObserver(() => {
        if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = setTimeout(() => editor.layout(), 60);
      });
      observer.observe(host);
      resizeObserverRef.current = observer;
    }
  };

  const handleChange: OnChange = (value) => onChange(value ?? '');

  useEffect(
    () => () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    },
    [],
  );

  return (
    <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" data-testid="query-editor">
      <Editor
        height="100%"
        width="100%"
        defaultValue={sql}
        language="sql"
        onMount={handleMount}
        onChange={handleChange}
        loading={null}
        options={{
          fontFamily,
          fontSize,
          tabSize,
          minimap: { enabled: false },
          wordWrap: 'on',
          automaticLayout: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
        }}
      />
    </div>
  );
}
