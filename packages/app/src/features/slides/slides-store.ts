import { create } from 'zustand';

export type MarkdownSource = { content: string; label?: string };

type SlidesState = {
  /** The currently open deck's source; `null` is closed. Never persisted — closing forgets the deck, and reopening the same file rebuilds it from source, every time (this is a viewer, not an editor). */
  deck: MarkdownSource | null;
  /**
   * Whichever markdown surface is currently in view, kept live by the two
   * description-level surfaces (Files preview, PR/Review description) — see
   * `markdown-preview.tsx` and `pr-detail.tsx`. A comment thread never claims
   * this slot (Theme D's resolved decision): a PR can hold dozens of comment
   * bodies at once, and none of them is unambiguously "the" markdown a
   * keyboard-invoked command should target.
   */
  activeMarkdown: MarkdownSource | null;
  present: (source: MarkdownSource) => void;
  presentActive: () => void;
  close: () => void;
  setActiveMarkdown: (source: MarkdownSource | null) => void;
};

export const useSlidesStore = create<SlidesState>((set, get) => ({
  deck: null,
  activeMarkdown: null,
  present: (source) => set({ deck: source }),
  presentActive: () => {
    const { activeMarkdown } = get();
    if (activeMarkdown) set({ deck: activeMarkdown });
  },
  close: () => set({ deck: null }),
  // Last-mounted/updated wins if two surfaces are visible at once — a single
  // global slot, accepted as a niche edge case rather than a stack or a
  // z-order tiebreak (resolved in the phase doc).
  setActiveMarkdown: (source) => set({ activeMarkdown: source }),
}));
