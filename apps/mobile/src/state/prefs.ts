// Mobile preferences (Phase 146 Theme F6). One tiny zustand store persisted as a single non-secret JSON blob under
// `mobile.prefs` in expo-secure-store (the same native module the token uses, so no second storage dependency). The blob
// is validated on read: unknown keys are stripped and anything invalid resets to defaults.
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { create } from 'zustand';

export const PREFS_KEY = 'mobile.prefs';
const RECENT_CAP = 5;

/** The repo the app is looking at. `defaultBranch` is what the branch resets to on a switch. */
export const RepoPrefSchema = z.object({ owner: z.string(), name: z.string(), defaultBranch: z.string() });
export type RepoPref = z.infer<typeof RepoPrefSchema>;

/** Theme J owns the provider registry; until it lands an id is any non-empty string. */
export type AgentProviderId = string;

export const MobilePrefsSchema = z.object({
  version: z.literal(1),
  currentRepo: RepoPrefSchema.nullable(),
  recentRepos: z.array(RepoPrefSchema).max(RECENT_CAP),
  branchByRepo: z.record(z.string(), z.string()),
  theme: z.enum(['system', 'light', 'dark']),
  lastProvider: z.string().min(1).nullable(),
  tasksViewByProject: z.record(z.string(), z.enum(['board', 'list', 'graph'])),
  seenAgentHint: z.boolean(),
});
export type MobilePrefs = z.infer<typeof MobilePrefsSchema>;

export const DEFAULT_PREFS: MobilePrefs = {
  version: 1,
  currentRepo: null,
  recentRepos: [],
  branchByRepo: {},
  theme: 'system',
  lastProvider: null,
  tasksViewByProject: {},
  seenAgentHint: false,
};

export const repoKey = (repo: { owner: string; name: string }): string => `${repo.owner}/${repo.name}`;

/** Parse a stored blob; anything missing, malformed or invalid is the defaults. */
export function parsePrefs(raw: string | null): MobilePrefs {
  if (raw === null) return DEFAULT_PREFS;
  try {
    const parsed = MobilePrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

interface PrefsActions {
  /** Load the persisted blob once. Writes only start after this, so a slow read never overwrites saved prefs. */
  hydrate(): Promise<void>;
  /** Select a repo: it joins the recents (newest first, capped at five) and its branch resets to the default. */
  setCurrentRepo(repo: RepoPref): void;
  setBranch(repo: { owner: string; name: string }, branch: string): void;
  setTheme(theme: MobilePrefs['theme']): void;
  setLastProvider(provider: AgentProviderId | null): void;
  setTasksView(projectId: string, view: 'board' | 'list' | 'graph'): void;
  setSeenAgentHint(seen: boolean): void;
}

export type PrefsState = MobilePrefs & PrefsActions & { hydrated: boolean };

/** The persistable slice of the store, or null when the live state fails the schema (never throws in a subscriber). */
function snapshot(state: PrefsState): MobilePrefs | null {
  const parsed = MobilePrefsSchema.safeParse({ ...state });
  return parsed.success ? parsed.data : null;
}

export const usePrefs = create<PrefsState>()((set) => ({
  ...DEFAULT_PREFS,
  hydrated: false,
  async hydrate() {
    let raw: string | null = null;
    try {
      raw = await SecureStore.getItemAsync(PREFS_KEY);
    } catch {
      raw = null;
    }
    set({ ...parsePrefs(raw), hydrated: true });
  },
  setCurrentRepo(repo) {
    set((s) => {
      const { [repoKey(repo)]: _reset, ...branchByRepo } = s.branchByRepo;
      const recents = [repo, ...s.recentRepos.filter((r) => repoKey(r) !== repoKey(repo))].slice(0, RECENT_CAP);
      return { currentRepo: repo, recentRepos: recents, branchByRepo };
    });
  },
  setBranch(repo, branch) {
    set((s) => ({ branchByRepo: { ...s.branchByRepo, [repoKey(repo)]: branch } }));
  },
  setTheme(theme) {
    set({ theme });
  },
  setLastProvider(lastProvider) {
    set({ lastProvider });
  },
  setTasksView(projectId, view) {
    set((s) => ({ tasksViewByProject: { ...s.tasksViewByProject, [projectId]: view } }));
  },
  setSeenAgentHint(seenAgentHint) {
    set({ seenAgentHint });
  },
}));

// Persist every change made after hydration (the hydrating set itself is not a change). Fire-and-forget: a failed write
// costs a preference, never a crash.
usePrefs.subscribe((state, prev) => {
  if (!state.hydrated || !prev.hydrated) return;
  const now = snapshot(state);
  if (now === null) return;
  const next = JSON.stringify(now);
  if (next === JSON.stringify(snapshot(prev))) return;
  void SecureStore.setItemAsync(PREFS_KEY, next).catch(() => undefined);
});

/** The branch in view for the current repo: the stored one, else the repo's default. */
export function selectBranch(s: Pick<MobilePrefs, 'currentRepo' | 'branchByRepo'>): string | null {
  const repo = s.currentRepo;
  return repo ? (s.branchByRepo[repoKey(repo)] ?? repo.defaultBranch) : null;
}
