import { useEffect, useRef } from 'react';

import { useTheme } from '@bilo-io/ui/theme';
import Editor, { type OnChange, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';

import { DEFAULT_EDITOR_FONT_FAMILY } from '../../../lib/monaco/editor-prefs';
import { getMonaco } from '../../../lib/monaco/monaco-loader';
import { monacoLanguageForFile } from '../../../lib/monaco/monaco-languages';
import { useFileEditorStore } from '../../../store/file-editor-store';
import { useUiStore } from '../../../store/ui-store';
import { usePaletteStore } from '../../themes/palette-store';
import { resolveEditorPalette } from '../../themes/resolve-palette';

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
 * One prop, content from the store — preserving `file-preview.tsx`'s call
 * site unchanged is the point of keeping this signature.
 */
export function CodeEditor({ fileName }: { fileName: string }) {
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

  const { resolved } = useTheme();
  const activePaletteId = usePaletteStore((s) => s.activePaletteId);
  const editorPaletteOverride = usePaletteStore((s) => s.editorPaletteOverride);
  const userPalettes = usePaletteStore((s) => s.userPalettes);

  const fontFamily = useUiStore((s) => s.editorFontFamily) || DEFAULT_EDITOR_FONT_FAMILY;
  const fontSize = useUiStore((s) => s.editorFontSize);
  const minimap = useUiStore((s) => s.editorMinimap);
  const tabSize = useUiStore((s) => s.editorTabSize);
  const wordWrap = useUiStore((s) => s.editorWordWrap);

  const language = monacoLanguageForFile(fileName);

  // The active studio palette's `monaco.editor.defineTheme` payload (Phase 64
  // Theme B). Monaco's theme is a process-wide singleton, not per-instance —
  // `setTheme` re-themes every mounted editor immediately, which is exactly
  // what a palette switch needs.
  useEffect(() => {
    let cancelled = false;
    void getMonaco().then((monaco) => {
      if (cancelled) return;
      const palette = resolveEditorPalette(resolved);
      const themeId = `studio-${palette.id}`;
      monaco.editor.defineTheme(themeId, {
        base: palette.editor.base,
        inherit: true,
        rules: palette.editor.rules,
        colors: palette.editor.colors,
      });
      monaco.editor.setTheme(themeId);
    });
    return () => {
      cancelled = true;
    };
  }, [resolved, activePaletteId, editorPaletteOverride, userPalettes]);

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
        theme={resolved === 'dark' ? 'vs-dark' : 'vs'}
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
