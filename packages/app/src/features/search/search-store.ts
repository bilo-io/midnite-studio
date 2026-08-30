import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Commit, GrepHit } from '@midnite/studio-shared';

import { adoptRenamedPersistKey } from '../../store/persist-rename';

export type SearchMode = 'commits' | 'content' | 'files';

export type CommitsSearchOptions = {
  grep: string;
  author: string;
  since: string;
  until: string;
  paths: string;
  pickaxeString: string;
  regexp: boolean;
  ignoreCase: boolean;
};

export type ContentSearchOptions = {
  pattern: string;
  rev: string;
  paths: string;
  regexp: boolean;
  ignoreCase: boolean;
  wordMatch: boolean;
  contextLines: number;
};

export type FilesSearchOptions = {
  query: string;
};

export type InFlightSearch = {
  requestId: string;
  mode: SearchMode;
  startedAt: number;
};

export type SearchState = {
  mode: SearchMode;
  commitsOptions: CommitsSearchOptions;
  contentOptions: ContentSearchOptions;
  filesOptions: FilesSearchOptions;

  // Selected item in search results list
  selectedItem:
    | { kind: 'commit'; commit: Commit }
    | { kind: 'content'; hit: GrepHit }
    | { kind: 'file'; path: string }
    | null;

  // Runtime results (not persisted)
  inFlight: InFlightSearch | null;
  commitsResults: Commit[];
  contentResults: GrepHit[];
  filesResults: string[];
  totalResults: number;
  truncated: boolean;
  error: string | null;

  flags: { regexp: boolean; ignoreCase: boolean; wordMatch: boolean };
  setFlags: (flags: Partial<{ regexp: boolean; ignoreCase: boolean; wordMatch: boolean }>) => void;

  // Actions
  setMode: (mode: SearchMode) => void;
  setCommitsOptions: (options: Partial<CommitsSearchOptions>) => void;
  setContentOptions: (options: Partial<ContentSearchOptions>) => void;
  setFilesOptions: (options: Partial<FilesSearchOptions>) => void;
  setSelectedItem: (item: SearchState['selectedItem']) => void;

  startSearch: (requestId: string, mode: SearchMode) => void;
  appendCommits: (requestId: string, commits: Commit[]) => void;
  appendContentHits: (requestId: string, hits: GrepHit[]) => void;
  setFilesResults: (requestId: string, files: string[]) => void;
  finishSearch: (requestId: string, total: number, truncated: boolean, error?: string) => void;
  cancelSearch: () => void;
  resetResults: () => void;
};

const DEFAULT_COMMITS_OPTIONS: CommitsSearchOptions = {
  grep: '',
  author: '',
  since: '',
  until: '',
  paths: '',
  pickaxeString: '',
  regexp: false,
  ignoreCase: false,
};

const DEFAULT_CONTENT_OPTIONS: ContentSearchOptions = {
  pattern: '',
  rev: '',
  paths: '',
  regexp: false,
  ignoreCase: false,
  wordMatch: false,
  contextLines: 0,
};

const DEFAULT_FILES_OPTIONS: FilesSearchOptions = {
  query: '',
};

/**
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey('midnite-studio:search-store', 'midnite-studio:search-store');

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      mode: 'commits',
      commitsOptions: DEFAULT_COMMITS_OPTIONS,
      contentOptions: DEFAULT_CONTENT_OPTIONS,
      filesOptions: DEFAULT_FILES_OPTIONS,
      selectedItem: null,

      flags: { regexp: false, ignoreCase: true, wordMatch: false },
      setFlags: (flags) =>
        set((state) => ({
          flags: { ...state.flags, ...flags },
          commitsOptions: {
            ...state.commitsOptions,
            ...(flags.regexp !== undefined ? { regexp: flags.regexp } : {}),
            ...(flags.ignoreCase !== undefined ? { ignoreCase: flags.ignoreCase } : {}),
          },
          contentOptions: {
            ...state.contentOptions,
            ...(flags.regexp !== undefined ? { regexp: flags.regexp } : {}),
            ...(flags.ignoreCase !== undefined ? { ignoreCase: flags.ignoreCase } : {}),
            ...(flags.wordMatch !== undefined ? { wordMatch: flags.wordMatch } : {}),
          },
        })),

      inFlight: null,
      commitsResults: [],
      contentResults: [],
      filesResults: [],
      totalResults: 0,
      truncated: false,
      error: null,

      setMode: (mode) => {
        if (get().mode === mode) return;
        get().cancelSearch();
        set({
          mode,
          selectedItem: null,
          commitsResults: [],
          contentResults: [],
          filesResults: [],
          totalResults: 0,
          truncated: false,
          error: null,
        });
      },

      setCommitsOptions: (options) =>
        set((state) => ({
          commitsOptions: { ...state.commitsOptions, ...options },
        })),

      setContentOptions: (options) =>
        set((state) => ({
          contentOptions: { ...state.contentOptions, ...options },
        })),

      setFilesOptions: (options) =>
        set((state) => ({
          filesOptions: { ...state.filesOptions, ...options },
        })),

      setSelectedItem: (selectedItem) => set({ selectedItem }),

      startSearch: (requestId, mode) => {
        set({
          inFlight: { requestId, mode, startedAt: Date.now() },
          commitsResults: [],
          contentResults: [],
          filesResults: [],
          totalResults: 0,
          truncated: false,
          error: null,
          selectedItem: null,
        });
      },

      appendCommits: (requestId, commits) => {
        const { inFlight, commitsResults } = get();
        if (!inFlight || inFlight.requestId !== requestId) return;
        const next = [...commitsResults, ...commits];
        const first = next[0];
        set({
          commitsResults: next,
          totalResults: next.length,
          selectedItem: get().selectedItem ?? (first ? { kind: 'commit', commit: first } : null),
        });
      },

      appendContentHits: (requestId, hits) => {
        const { inFlight, contentResults } = get();
        if (!inFlight || inFlight.requestId !== requestId) return;
        const next = [...contentResults, ...hits];
        const first = next[0];
        set({
          contentResults: next,
          totalResults: next.length,
          selectedItem: get().selectedItem ?? (first ? { kind: 'content', hit: first } : null),
        });
      },

      setFilesResults: (requestId, files) => {
        const { inFlight } = get();
        if (!inFlight || inFlight.requestId !== requestId) return;
        const first = files[0];
        set({
          filesResults: files,
          totalResults: files.length,
          selectedItem: get().selectedItem ?? (first ? { kind: 'file', path: first } : null),
        });
      },


      finishSearch: (requestId, total, truncated, error) => {
        const { inFlight } = get();
        if (!inFlight || inFlight.requestId !== requestId) return;
        set({
          inFlight: null,
          totalResults: total,
          truncated,
          error: error ?? null,
        });
      },

      cancelSearch: () => {
        const { inFlight } = get();
        if (inFlight) {
          window.midniteStudio?.search.cancel({ repoId: 'current', requestId: inFlight.requestId });
          set({ inFlight: null });
        }
      },

      resetResults: () => {
        get().cancelSearch();
        set({
          commitsResults: [],
          contentResults: [],
          filesResults: [],
          totalResults: 0,
          truncated: false,
          error: null,
          selectedItem: null,
        });
      },
    }),
    {
      name: 'midnite-studio:search-store',
      partialize: (state) => ({
        mode: state.mode,
        commitsOptions: state.commitsOptions,
        contentOptions: state.contentOptions,
        filesOptions: state.filesOptions,
      }),
    },
  ),
);
