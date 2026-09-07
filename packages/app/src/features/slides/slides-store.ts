import { create } from 'zustand';

export type MarkdownSource = { content: string; label?: string };

type SlidesState = {
  /** The currently open deck's source; `null` is closed. Never persisted — closing forgets the deck, and reopening the same file rebuilds it from source, every time (this is a viewer, not an editor). */
  deck: MarkdownSource | null;
  /**
   * Whichever markdown surface is currently in view — the slot
   * `markdown.presentAsSlides` targets when invoked without a click (the
   * palette, a future chord).
   *
   * **The claim rule, for every surface past and future (Phase 29 Theme F):**
   * a surface claims this slot **iff** it renders exactly one document-level
   * body at a time. Description-level surfaces do — Files preview
   * (`markdown-preview.tsx`), a PR/review description (`pr-detail.tsx`), an
   * issue body (`issue-detail.tsx`), release notes (`version-notes-panel.tsx`).
   * A conversation/comment list does not, however many bodies it renders,
   * because none of several visible bodies is unambiguously "the" one a
   * bodiless command invocation should mean — `comment-thread.tsx`,
   * `pr-conversation.tsx` and `issue-conversation.tsx` all get a Present
   * button (every markdown body is presentable by click) but never call
   * `setActiveMarkdown`. Judge a new surface by this rule, not by resemblance
   * to an existing one.
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
