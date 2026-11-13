import { create } from 'zustand';

/**
 * The composer's unsent prompt per council (Phase 134 Theme B) — in a store
 * rather than the composer's own state so the synthesizer card can recommend a
 * synthesis type for what is being typed. Session-only: nothing persists.
 */
type CouncilDraftState = {
  drafts: Record<string, string>;
  setDraft: (councilId: string, text: string) => void;
};

export const useCouncilDraftStore = create<CouncilDraftState>()((set) => ({
  drafts: {},
  setDraft: (councilId, text) => set((state) => ({ drafts: { ...state.drafts, [councilId]: text } })),
}));

/** A council's draft and its setter, shaped like `useState`. */
export function useCouncilDraft(councilId: string): [string, (next: string | ((current: string) => string)) => void] {
  const draft = useCouncilDraftStore((state) => state.drafts[councilId] ?? '');
  const setDraft = useCouncilDraftStore((state) => state.setDraft);
  return [
    draft,
    (next) => {
      const current = useCouncilDraftStore.getState().drafts[councilId] ?? '';
      setDraft(councilId, typeof next === 'function' ? next(current) : next);
    },
  ];
}
