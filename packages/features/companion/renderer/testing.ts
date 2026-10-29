import { Fragment, createElement, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { create } from 'zustand';

import { createFrameChrome } from '@midnite/studio-frame';

import { companionPorts } from './companion-ports';
import { createDefaultCompanionHost } from './default-host';
import type { CompanionHost } from './host';
import { TEST_COMMAND_ACCESS, TEST_PAGE_ROLE_TITLE, TEST_SETTINGS_PAGES, TEST_VIEW_KEYWORDS, TEST_VIEW_LABELS } from './test-catalog';

/**
 * Test support for the companion's own suite (Phase 123 Theme F) — never imported by product code.
 *
 * The moved tests drove Studio's real stores. They now drive a default host whose reaches are small
 * stand-in stores: the file editor's pending navigation, the issue modal's target, and the pop-out
 * game flag — exactly the three the navigation tests set and read. `test-setup.ts` installs a fresh
 * host before every test.
 */

export const useFileEditorStore = create<{ pendingNav: unknown; target: unknown; content: string; savedContent: string }>(() => ({
  pendingNav: null,
  target: null,
  content: '',
  savedContent: '',
}));

export const useIssueModalStore = create<{ target: { repoId: string; number: number } | null }>(() => ({ target: null }));

export const useGamePopped = create<{ popped: boolean }>(() => ({ popped: false }));

export const openedBrowserUrls: string[] = [];

/** One kit chrome (and its dialog host) for the whole suite; `renderPanel` installs it. */
const kit = createFrameChrome();
export const testChrome = kit.chrome;
const KitDialogHost = kit.DialogHost;
export const TestDialogHost: CompanionHost['components']['DialogHost'] = ({ children }) =>
  createElement(Fragment, null, children, createElement(KitDialogHost));

/** A port-driven stand-in for the app's `useComposerMic` (push-to-talk only, no conversation mode). */
export const useTestComposerMic: CompanionHost['hooks']['useComposerMic'] = (options = {}) => {
  const [held, setHeld] = useState(false);
  const available = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micAvailable(),
  );
  const reason = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micUnavailableReason(),
  );
  const { onInterrupt } = options;
  const pressStart = useCallback(() => {
    if (!companionPorts().micAvailable()) return;
    (onInterrupt ?? (() => companionPorts().interrupt()))();
    setHeld(true);
    companionPorts().micPressStart();
  }, [onInterrupt]);
  useEffect(() => {
    if (!held) return undefined;
    const release = () => {
      setHeld(false);
      companionPorts().micPressEnd();
    };
    const keyRelease = (event: KeyboardEvent) => {
      if (event.key === ' ') release();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keyup', keyRelease);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keyup', keyRelease);
      window.removeEventListener('blur', release);
    };
  }, [held]);
  return { available, reason, held, pressStart };
};

const DefaultComposer = createDefaultCompanionHost().components.AiComposer;

/** The default composer plus the mic button the real one draws (testid `<prefix>-mic`). */
const TestAiComposer: CompanionHost['components']['AiComposer'] = (props) =>
  createElement(
    DefaultComposer,
    {
      ...props,
      leading: createElement(
        Fragment,
        null,
        props.leading,
        props.mic
          ? createElement('button', {
              type: 'button',
              'aria-label': 'Hold to talk',
              'aria-disabled': props.mic.available ? undefined : true,
              'data-testid': `${props.testIdPrefix ?? 'ai-composer'}-mic`,
              title: props.mic.available ? 'Hold to talk' : props.mic.reason,
              onPointerDown: props.mic.pressStart,
            })
          : null,
      ),
    },
  );

export function createTestCompanionHost(overrides: Partial<CompanionHost> = {}): CompanionHost {
  const base = createDefaultCompanionHost();
  // Studio's `setActiveView` defers behind the unsaved-file dialog; the stand-in does the same.
  const setView = base.ui.getState().setActiveView;
  base.ui.setState({
    setActiveView: (view) => {
      const editor = useFileEditorStore.getState();
      if (editor.target && editor.content !== editor.savedContent) {
        useFileEditorStore.setState({ pendingNav: { view } });
        return;
      }
      setView(view);
    },
  });
  return {
    ...base,
    pageRoleTitle: TEST_PAGE_ROLE_TITLE,
    // Two stand-in revealers, enough for the engine's own paths: Studio's live in the app.
    revealers: {
      note: { view: 'notes', reveal: async () => ({ ok: false, reason: 'not-found', say: "I couldn't find that note." }) },
      issue: {
        view: 'tasks',
        reveal: async (ref) => {
          useIssueModalStore.setState({ target: { repoId: ref.repoId, number: ref.number } });
          return { ok: true, did: 'revealed', label: `issue ${ref.number}` };
        },
      },
    },
    components: { ...base.components, DialogHost: TestDialogHost, AiComposer: TestAiComposer },
    hooks: { ...base.hooks, useComposerMic: useTestComposerMic },
    catalog: {
      viewLabels: TEST_VIEW_LABELS,
      viewKeywords: TEST_VIEW_KEYWORDS,
      settingsPages: TEST_SETTINGS_PAGES,
      commandAccess: TEST_COMMAND_ACCESS,
    },
    gamePopped: () => useGamePopped.getState().popped,
    openBrowserUrl: (url) => void openedBrowserUrls.push(url),
    hasUnsavedFileNav: () => useFileEditorStore.getState().pendingNav !== null,
    openIssue: (target) => useIssueModalStore.setState({ target }),
    ...overrides,
  };
}
