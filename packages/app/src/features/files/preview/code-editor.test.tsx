import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@bilo-io/ui/theme';

import { useFileEditorStore } from '../../../store/file-editor-store';

/**
 * `code-editor.tsx` — the first unit test for this file (Phase 64 Theme C;
 * the directory's only prior test was `markdown-links.test.ts`).
 *
 * `@monaco-editor/react`'s `<Editor>` is mocked rather than driven for real —
 * it needs a real DOM layout engine and worker threads jsdom does not
 * provide, and the three properties under test (the store wiring, the
 * store → view sync, and the `ResizeObserver` lifecycle) do not depend on
 * Monaco's own rendering.
 */
let capturedOnMount: ((editor: unknown, monaco: unknown) => void) | undefined;
let capturedOnChange: ((value: string | undefined) => void) | undefined;

vi.mock('@monaco-editor/react', () => ({
  default: (props: {
    onMount?: (editor: unknown, monaco: unknown) => void;
    onChange?: (value: string | undefined) => void;
  }) => {
    capturedOnMount = props.onMount;
    capturedOnChange = props.onChange;
    return null;
  },
}));

vi.mock('../../../lib/monaco/monaco-loader', () => ({
  getMonaco: vi.fn(async () => ({
    editor: { defineTheme: vi.fn(), setTheme: vi.fn() },
  })),
}));

let currentModelValue = '';
const setValueMock = vi.fn((value: string) => {
  currentModelValue = value;
});
const fakeModel = {
  getValue: vi.fn(() => currentModelValue),
  setValue: setValueMock,
};
const layoutMock = vi.fn();
// `code-editor.tsx` reads widget-visibility through this exact shape
// (`_contextKeyService.getContextKeyValue`) rather than the public
// `createContextKey`, per Phase 64 Theme D's Decision 3 — see that file's
// `isMonacoWidgetOpen`. `contextValues` is mutated per-test to simulate
// Monaco's find widget / suggest list / parameter hints opening and closing.
let contextValues: Record<string, unknown> = {};
const fakeEditor = {
  focus: vi.fn(),
  layout: layoutMock,
  getModel: vi.fn(() => fakeModel),
  _contextKeyService: {
    getContextKeyValue: (key: string) => contextValues[key],
  },
};

const observeMock = vi.fn();
const disconnectMock = vi.fn();
class FakeResizeObserver {
  observe = observeMock;
  disconnect = disconnectMock;
  unobserve = vi.fn();
}

const { CodeEditor } = await import('./code-editor');

function renderEditor(onEscape?: () => void, fileName = 'a.ts') {
  return render(
    <ThemeProvider>
      <CodeEditor fileName={fileName} onEscape={onEscape} />
    </ThemeProvider>,
  );
}

describe('CodeEditor', () => {
  beforeEach(() => {
    // `ThemeProvider` asks the platform about `prefers-color-scheme` on
    // mount, and jsdom ships no `matchMedia`. jsdom also ships no
    // `ResizeObserver` at all. Both are re-stubbed every test rather than
    // once at module scope: `afterEach`'s `unstubAllGlobals` below clears a
    // module-scope stub too, which would otherwise only survive the first test.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    capturedOnMount = undefined;
    capturedOnChange = undefined;
    currentModelValue = 'const x = 1;';
    contextValues = {};
    setValueMock.mockClear();
    layoutMock.mockClear();
    observeMock.mockClear();
    disconnectMock.mockClear();
    fakeEditor.focus.mockClear();
    useFileEditorStore.setState({
      target: null,
      savedContent: 'const x = 1;',
      content: 'const x = 1;',
      version: null,
      saving: false,
      saveError: null,
      staleWrite: false,
      pendingNav: null,
      allowClose: false,
    });
  });

  afterEach(() => {
    // `useDismiss` keeps its dismissal stack at module scope: an un-unmounted
    // `CodeEditor` from a prior test would leave a stale 'inline' entry
    // registered, which the Escape tests below would otherwise inherit.
    cleanup();
    vi.unstubAllGlobals();
  });

  it('fires edit() on the store when the editor reports a change', () => {
    renderEditor();
    capturedOnMount?.(fakeEditor, {});
    currentModelValue = 'const x = 2;'; // Monaco's own model already has it
    capturedOnChange?.('const x = 2;');
    expect(useFileEditorStore.getState().content).toBe('const x = 2;');
    // The store → view sync must not push it straight back — model and
    // store already agree, which is the editor's own echo of its keystroke.
    expect(setValueMock).not.toHaveBeenCalled();
  });

  it('pushes a store change into the model via setValue when they diverge', () => {
    renderEditor();
    capturedOnMount?.(fakeEditor, {});
    useFileEditorStore.setState({ content: 'reloaded from disk' });
    expect(setValueMock).toHaveBeenCalledWith('reloaded from disk');
  });

  it('skips the model push when the model already matches the new content', () => {
    renderEditor();
    capturedOnMount?.(fakeEditor, {});
    currentModelValue = 'already-there';
    useFileEditorStore.setState({ content: 'already-there' });
    expect(setValueMock).not.toHaveBeenCalled();
  });

  it('disconnects the ResizeObserver on unmount', () => {
    const { unmount } = renderEditor();
    capturedOnMount?.(fakeEditor, {});
    expect(observeMock).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('restores focus to whatever had it before mount, on unmount', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    const { unmount } = renderEditor();
    capturedOnMount?.(fakeEditor, {});
    unmount();

    expect(document.activeElement).toBe(button);
    button.remove();
  });

  describe('Escape (Phase 64 Theme D)', () => {
    const escapeStudio = () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    it('does not call onEscape while Monaco reports its find widget open', () => {
      const onEscape = vi.fn();
      renderEditor(onEscape);
      capturedOnMount?.(fakeEditor, {});
      contextValues.findWidgetVisible = true;

      escapeStudio();

      expect(onEscape).not.toHaveBeenCalled();
    });

    it('does not call onEscape while Monaco reports its suggest list or parameter hints open', () => {
      const onEscape = vi.fn();
      renderEditor(onEscape);
      capturedOnMount?.(fakeEditor, {});

      contextValues.suggestWidgetVisible = true;
      escapeStudio();
      expect(onEscape).not.toHaveBeenCalled();

      contextValues.suggestWidgetVisible = false;
      contextValues.parameterHintsVisible = true;
      escapeStudio();
      expect(onEscape).not.toHaveBeenCalled();
    });

    it('calls onEscape once nothing internal to Monaco is open — the "second Escape" case', () => {
      const onEscape = vi.fn();
      renderEditor(onEscape);
      capturedOnMount?.(fakeEditor, {});
      contextValues.findWidgetVisible = true;

      escapeStudio(); // first Escape: Monaco's own widget, swallowed
      expect(onEscape).not.toHaveBeenCalled();

      contextValues.findWidgetVisible = false; // Monaco closed it
      escapeStudio(); // second Escape: nothing left for Monaco to consume

      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('calls onEscape on a bare Escape when no widget was ever open', () => {
      const onEscape = vi.fn();
      renderEditor(onEscape);
      capturedOnMount?.(fakeEditor, {});

      escapeStudio();

      expect(onEscape).toHaveBeenCalledTimes(1);
    });
  });
});
