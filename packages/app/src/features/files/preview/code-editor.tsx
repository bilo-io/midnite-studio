import { useEffect, useRef } from 'react';

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';

import { useTheme } from '@bilo-io/ui/theme';

import { useFileEditorStore } from '../../../store/file-editor-store';

/**
 * CodeMirror 6, hand-picked rather than the bundled `basicSetup` — the same
 * call the fuzzy matcher and the hand-drawn chart made: this editor's bar is
 * line numbers, history and bracket matching, not everything the meta-package
 * ships (fold gutters, lint panels, autocomplete-from-nothing).
 *
 * A semi-controlled component: keystrokes flow view → store via
 * `updateListener`, and the effect below flows store → view only when they
 * have actually diverged — a Discard, a reload after a stale write, or a
 * remote change — never on the editor's own echo of what it just typed.
 */
export function CodeEditor({ fileName }: { fileName: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef<Compartment | null>(null);
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const language = new Compartment();
    const themeCompartment = new Compartment();

    const view = new EditorView({
      doc: useFileEditorStore.getState().content,
      parent: host,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        keymap.of([...closeBracketsKeymap, ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
        language.of([]),
        themeCompartment.of(editorTheme(darkRef.current)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) useFileEditorStore.getState().edit(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    themeCompartmentRef.current = themeCompartment;

    LanguageDescription.matchFilename(languages, fileName)
      ?.load()
      .then((support) => {
        if (viewRef.current === view) view.dispatch({ effects: language.reconfigure(support) });
      })
      .catch(() => {
        /* An unrecognised or failed grammar leaves plain text — the same
           degrade-gracefully rule CodePreview's own highlight() follows. */
      });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // `fileName` only changes across a remount (`key`-forced by the caller),
    // so this intentionally does not depend on it beyond the initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    const compartment = themeCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({ effects: compartment.reconfigure(editorTheme(dark)) });
  }, [dark]);

  // Store → view sync, for changes that did not originate from typing here:
  // Discard resets `content` to `savedContent`, and a stale-write Reload
  // replaces it outright. Skipped when the two already agree, which is true
  // on every keystroke's own round trip through `edit()`.
  useEffect(
    () =>
      useFileEditorStore.subscribe((state, prev) => {
        if (state.content === prev.content) return;
        const view = viewRef.current;
        if (!view || view.state.doc.toString() === state.content) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: state.content },
        });
      }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className="code-editor min-h-0 flex-1 overflow-auto text-xs [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
      data-testid="code-editor"
    />
  );
}

function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        fontSize: '0.75rem',
      },
      '.cm-content': { caretColor: 'hsl(var(--foreground))' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'hsl(var(--accent))',
      },
      '.cm-activeLine': { backgroundColor: 'hsl(var(--accent) / 0.4)' },
      '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--accent) / 0.4)' },
      '.cm-gutters': {
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--muted-foreground))',
        border: 'none',
        borderRight: '1px solid hsl(var(--border))',
      },
      '.cm-matchingBracket, .cm-nonmatchingBracket': {
        backgroundColor: 'hsl(var(--accent))',
      },
    },
    { dark },
  );
}
