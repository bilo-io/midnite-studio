import { useEffect, useRef } from 'react';

import Editor, { type OnChange, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';

import { useDismiss } from '../../../components/use-dismiss';
import { DEFAULT_EDITOR_FONT_FAMILY } from '../../../lib/monaco/editor-prefs';
import { getMonaco } from '../../../lib/monaco/monaco-loader';
import { monacoLanguageForFile } from '../../../lib/monaco/monaco-languages';
import { useFileEditorStore } from '../../../store/file-editor-store';
import { useUiStore } from '../../../store/ui-store';
import { useStudioMonacoTheme } from '../../themes/use-studio-monaco-theme';

/**
 * Whether Monaco is currently showing its find widget, suggest list or
 * parameter hints — read via the editor's own (private, undocumented)
 * `_contextKeyService`, never via the public `editor.createContextKey`.
 * `createContextKey(key, defaultValue)` calls `reset()` in its constructor,
 * which writes `defaultValue` straight into the shared context the moment
 * it's called — for a key Monaco's own find/suggest/parameter-hints
 * contributions already own, that would stomp the live value (e.g. force
 * `findWidgetVisible` back to `false` the instant we asked), breaking the
 * very "when" clause that closes the widget on the first Escape. Reading
 * through the private service sidesteps that; optional-chained so a future
 * Monaco rename fails safe to "nothing is open" rather than throwing (Phase
 * 64 Theme D, Decision 3).
 */
function isMonacoWidgetOpen(editor: MonacoEditorNS.IStandaloneCodeEditor): boolean {
  const service = (
    editor as unknown as {
      _contextKeyService?: { getContextKeyValue?: (key: string) => unknown };
    }
  )._contextKeyService;
  const isOpen = (key: string) => service?.getContextKeyValue?.(key) === true;
  return isOpen('findWidgetVisible') || isOpen('suggestWidgetVisible') || isOpen('parameterHintsVisible');
}

// Eagerly configures `@monaco-editor/react`'s loader to use the locally
// bundled `monaco` instance (and registers `MonacoEnvironment.getWorker`) the
// moment THIS lazy chunk evaluates — before `<Editor>` below ever mounts and
// reaches for its own `loader.init()`, which defaults to a CDN fetch. Calling
// it inside an effect would race `<Editor>`'s own mount effect (child effects
// commit before a parent's), so this runs at module scope instead.
void getMonaco();

/**
 * Monaco, via `@monaco-editor/react` (Phase 64 Theme C) — replaces CodeMirror
 * 6. A semi-controlled component, same shape as before: keystrokes flow
 * view → store via `onChange`, and the effect below flows store → view only
 * when they have actually diverged (a Discard, a reload after a stale write,
 * or a remote change) — never on the editor's own echo of what it just typed.
 *
 * Two props, both from `file-preview.tsx`'s existing call site: `fileName`
 * (content still comes from the store) and `onEscape` — Phase 64 Theme D's
 * fallthrough action, defaulted to a no-op so the many pre-existing tests
 * that render this without it keep passing unchanged.
 */
export function CodeEditor({
  fileName,
  onEscape = () => undefined,
}: {
  fileName: string;
  /**
   * Called for an Escape that reaches Studio — i.e. one Monaco did *not*
   * consume internally (no find widget, suggest list or parameter hints
   * open). `file-preview.tsx` passes its `exitEditing`, so this Escape does
   * exactly what the Done button does, guard dialog included.
   */
  onEscape?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Restore focus on unmount — Monaco takes it on mount, so without this,
  // leaving edit mode drops focus to `<body>`. Lifted from `palette.tsx`'s
  // exact pattern (capture ref before mount, restore in cleanup) — the only
  // other place in the app that already does this.
  const previouslyFocused = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  const fontFamily = useUiStore((s) => s.editorFontFamily) || DEFAULT_EDITOR_FONT_FAMILY;
  const fontSize = useUiStore((s) => s.editorFontSize);
  const minimap = useUiStore((s) => s.editorMinimap);
  const tabSize = useUiStore((s) => s.editorTabSize);
  const wordWrap = useUiStore((s) => s.editorWordWrap);

  const language = monacoLanguageForFile(fileName);

  // Defines and applies the active studio palette's Monaco theme — see
  // `use-studio-monaco-theme.ts` for why `<Editor>` below must NOT also carry
  // a `theme` prop.
  useStudioMonacoTheme();

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();

    // Debounced `editor.layout()` on a `ResizeObserver` over the host
    // element, trailing-edge at 60ms, disconnected on unmount — Monaco does
    // not self-size, so without this it keeps its mount-time dimensions
    // inside the resizable Files pane. Deliberately NOT the built-in
    // `automaticLayout` option: that polls on an interval rather than
    // reacting to a real resize, and isn't independently disconnectable.
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

  const handleChange: OnChange = (value) => {
    useFileEditorStore.getState().edit(value ?? '');
  };

  /*
    Escape, registered through Phase 62's shared dismissal stack rather than a
    local `window` listener (Phase 64 Theme D, Decision 3 — P62 landed first,
    so Theme D calls `useDismiss` directly instead of the local `onKeyDown`
    fallback that decision also names).

    `layer: 'inline', blocking: false` — same shape as `code-preview.tsx`'s
    find bar: the editor has no overlay hiding the native browser view, so it
    is passive, not blocking. Active for as long as this component is
    mounted, matching `file-preview.tsx`'s conditional render of it on
    `editing`, so there is nothing separate to toggle here.

    Monaco's own bound Escape already `stopPropagation()`s when it consumes
    the key — closing the find widget, suggest list or parameter hints — so
    in the overwhelmingly common case this callback never runs for THAT
    keypress at all; it only reaches here once nothing internal claimed it.
    `isMonacoWidgetOpen` is the belt-and-suspenders check the phase item asks
    for anyway, so a future Monaco version that stops calling
    `stopPropagation()` fails toward "do nothing" rather than exiting edit
    mode out from under an open widget.
  */
  useDismiss(
    true,
    () => {
      const editor = editorRef.current;
      if (editor && isMonacoWidgetOpen(editor)) return;
      onEscape();
    },
    { layer: 'inline', blocking: false },
  );

  // Store → view sync, for changes that did not originate from typing here —
  // preserved as-is against `model.setValue` (Discard resets `content` to
  // `savedContent`, and a stale-write Reload replaces it outright; both are
  // reachable from the stale-write banner and the guard dialog).
  useEffect(
    () =>
      useFileEditorStore.subscribe((state, prev) => {
        if (state.content === prev.content) return;
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (!editor || !model || model.getValue() === state.content) return;
        model.setValue(state.content);
      }),
    [],
  );

  useEffect(() => {
    // Captured here, not read from the ref inside the cleanup below — same
    // pattern `palette.tsx` uses, and for the same reason: the ref's value
    // may have moved on by the time an unmount actually runs.
    const restoreTo = previouslyFocused.current;
    return () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      restoreTo?.focus();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="code-editor min-h-0 flex-1 overflow-hidden"
      data-testid="code-editor"
    >
      <Editor
        height="100%"
        width="100%"
        // Set once — `key={editorKey}` at the call site (`file-preview.tsx`)
        // force-remounts this whole component per file, so Monaco always gets
        // a fresh model rather than reusing a stale one across files.
        defaultValue={useFileEditorStore.getState().content}
        language={language}
        onMount={handleMount}
        onChange={handleChange}
        loading={null}
        options={{
          fontFamily,
          fontSize,
          tabSize,
          minimap: { enabled: minimap },
          wordWrap: wordWrap ? 'on' : 'off',
          automaticLayout: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
        }}
      />
    </div>
  );
}
