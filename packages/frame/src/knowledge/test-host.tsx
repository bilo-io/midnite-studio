// Test support for the Knowledge view's unit tests: a fake host and a `render` that installs it.
import type { ReactElement, ReactNode } from 'react';

import { render as rtlRender, type RenderOptions } from '@testing-library/react';

import { FrameChromeProvider } from '../chrome/chrome-port';
import { createFrameChrome } from '../kit/frame-chrome';
import {
  KnowledgeHostProvider,
  type KnowledgeCorpus,
  type KnowledgeHost,
  type KnowledgeSettings,
  type KnowledgeSourcePreviewProps,
} from './knowledge-host';
import { SimplePopover } from './simple-popover';

/** The corpus the fake host reports; a test assigns to it before rendering. */
export const testCorpus: { repoId: string | null; worktreePath?: string } = { repoId: null };

/** What the fake host was last asked to persist. */
export const testPersisted: { settings: KnowledgeSettings; writes: Partial<KnowledgeSettings>[] } = {
  settings: {
    rendererVariant: 'atlas',
    layoutId: 'force-atlas2',
    detailId: 'core',
    filtersWidth: 288,
    detailWidth: 384,
  },
  writes: [],
};

export function resetTestHost(): void {
  testCorpus.repoId = null;
  delete testCorpus.worktreePath;
  testPersisted.writes = [];
  testPersisted.settings = {
    rendererVariant: 'atlas',
    layoutId: 'force-atlas2',
    detailId: 'core',
    filtersWidth: 288,
    detailWidth: 384,
  };
}

function TestSourcePreview({ sourceFile, targetLine }: KnowledgeSourcePreviewProps) {
  return (
    <div data-testid="file-preview-stub">
      {sourceFile}:{targetLine ?? 'no-line'}
    </div>
  );
}

export function makeTestHost(overrides: Partial<KnowledgeHost> = {}): KnowledgeHost {
  return {
    useFocus: () => true,
    useCorpus: (): KnowledgeCorpus => ({ ...testCorpus }),
    useSettings: () => testPersisted.settings,
    getSettings: () => testPersisted.settings,
    setSettings: (patch) => {
      testPersisted.writes.push(patch);
      testPersisted.settings = { ...testPersisted.settings, ...patch };
    },
    prefersReducedMotion: () => false,
    panelBounds: {
      filtersWidth: { min: 220, max: 500, initial: 288 },
      detailWidth: { min: 280, max: 640, initial: 384 },
    },
    Popover: SimplePopover,
    SourcePreview: TestSourcePreview,
    ...overrides,
  };
}

const { chrome } = createFrameChrome();
const TEST_HOST = makeTestHost();

export function TestKnowledgeProviders({ children, host = TEST_HOST }: { children: ReactNode; host?: KnowledgeHost }) {
  return (
    <FrameChromeProvider chrome={chrome}>
      <KnowledgeHostProvider host={host}>{children}</KnowledgeHostProvider>
    </FrameChromeProvider>
  );
}

/** `render` with the frame chrome and the fake Knowledge host installed. */
export function render(ui: ReactElement, options: RenderOptions = {}) {
  return rtlRender(ui, { wrapper: TestKnowledgeProviders, ...options });
}
