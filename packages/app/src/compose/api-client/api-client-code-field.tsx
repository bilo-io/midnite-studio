import { useEffect, useRef } from 'react';

import Editor, { type OnChange, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';

import type { ApiClientCodeFieldProps } from '@midnite/studio-feature-api-client/renderer';

import { useStudioMonacoTheme } from '../../features/themes/use-studio-monaco-theme';
import { DEFAULT_EDITOR_FONT_FAMILY } from '../../lib/monaco/editor-prefs';
import { getMonaco } from '../../lib/monaco/monaco-loader';

// Same eager loader-configuration call `code-editor.tsx` makes at module
// scope — before `<Editor>` ever mounts and reaches for its own
// `loader.init()`, which defaults to a CDN fetch.
void getMonaco();

const registeredLibs = new Set<string>();
async function registerAmbientLib(fileName: string, content: string): Promise<void> {
  if (registeredLibs.has(fileName)) return;
  registeredLibs.add(fileName);
  const monaco = await getMonaco();
  // `monaco.languages.typescript` is this package's own deprecated shim (typed as `{deprecated: true}`,
  // monaco-editor 0.56) — the real namespace moved to this top-level `typescript` export.
  monaco.typescript.javascriptDefaults.addExtraLib(content, fileName);
}

/**
 * A controlled Monaco field for the API Client (Phase 66 Themes D/F).
 *
 * A **new component, not a reuse of `CodeEditor`** (Decision 4 in the phase
 * doc): `CodeEditor({fileName})` reads and writes `useFileEditorStore`
 * directly and derives its language from a file name — neither is true of a
 * request body or a response pane, which are controlled by `value`/`onChange`
 * and told their language explicitly.
 *
 * Repeats `code-editor.tsx`'s resize handling verbatim rather than factoring
 * it out: the two components' owning stores differ (this one has none), and
 * a shared hook over "the store" would have to be parameterized into
 * meaninglessness to serve both. The theme effect is the exception — it
 * needed no store parameter to begin with, so it is the shared
 * `useStudioMonacoTheme()` hook (`features/themes/use-studio-monaco-theme.ts`)
 * instead of a fourth copy.
 */
export function ApiClientCodeField({ value, onChange, language, height, readOnly = false, onEditorMount, ambientLib }: ApiClientCodeFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyStudioTheme = useStudioMonacoTheme();

  // The script fields' `pm.d.ts` (the feature's `ambientLib`) — registered with the language
  // service once per file name, and only when a field that carries one actually mounts, **not** at
  // module scope: `monaco.typescript` is a lazy getter that, the moment it is touched, registers the
  // whole TypeScript/JavaScript contribution, which reads `document.queryCommandSupported` at its
  // own evaluation time (absent under jsdom) and would fire for every importer of this module.
  const libContent = ambientLib?.content;
  const libName = ambientLib?.fileName;
  useEffect(() => {
    if (libContent === undefined || libName === undefined) return;
    void registerAmbientLib(libName, libContent);
  }, [libContent, libName]);

  const handleMount: OnMount = (editor, monaco) => {
    applyStudioTheme(monaco);
    editorRef.current = editor;

    // `automaticLayout: false` below means this field must lay itself out on
    // container resize — a debounced `ResizeObserver`, same 60ms trailing
    // edge as `code-editor.tsx`, rather than the built-in flag's 100ms poll.
    const host = hostRef.current;
    if (host) {
      const observer = new ResizeObserver(() => {
        if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = setTimeout(() => editor.layout(), 60);
      });
      observer.observe(host);
      resizeObserverRef.current = observer;
    }

    onEditorMount?.(editor);
  };

  const handleChange: OnChange = (next) => onChange(next ?? '');

  // Store → view sync has no store here; instead the model is kept in sync
  // with the controlled `value` prop whenever it changes out from under a
  // mounted editor (a tab switch reusing the same instance, a Beautify
  // rewrite) without echoing the editor's own keystrokes back at itself.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || model.getValue() === value) return;
    model.setValue(value);
  }, [value]);

  useEffect(
    () => () => {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    },
    [],
  );

  return (
    <div ref={hostRef} className="monaco-field min-h-0 flex-1 overflow-hidden" data-testid="monaco-field">
      <Editor
        height={height ?? '100%'}
        width="100%"
        defaultValue={value}
        language={language}
        onMount={handleMount}
        onChange={handleChange}
        loading={null}
        options={{
          readOnly,
          fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
          minimap: { enabled: false },
          automaticLayout: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
        }}
      />
    </div>
  );
}
