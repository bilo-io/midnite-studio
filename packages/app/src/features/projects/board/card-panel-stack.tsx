import { useEffect } from 'react';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { useRegisterActivePanel } from '../../../components/panel-stack/active-panel';
import { PanelHeader } from '../../../components/panel-stack/panel-header';
import { PanelStack } from '../../../components/panel-stack/panel-stack';
import { usePanelHistory } from '../../../components/panel-stack/use-panel-history';
import { CardDetail } from './card-detail';

/**
 * Wraps the card-detail pane in a `panel-stack` instance (Phase 50 Theme D)
 * — `usePanelHistory`'s own docblock names Projects as a next consumer the
 * moment Councils (Phase 42) shipped the primitive.
 *
 * **One instance per mount, not a module-level store.** `BoardView` only
 * renders this component while a card is selected (see its
 * `{selectedItemId ? <CardPanelStack … /> : null}`), so the whole history
 * resets for free the moment the pane closes — Councils' Theme E
 * persist-across-unmount exception does not apply here, matching
 * `use-panel-history.ts`'s own docblock on when that exception is needed.
 *
 * **Pushes exactly one history depth — card open/close.** A new
 * `selectedItemId` pushes a fresh entry (buying `Mod+[`/`Mod+]` back to the
 * card that was open before); re-selecting the already-open card is a no-op
 * courtesy of `usePanelHistory`'s own same-entry check. A linked PR/issue
 * inside the detail pane stays a `#number` link-out, not a second entry —
 * the phase doc's own scope guardrail.
 */
export function CardPanelStack({
  projectId,
  repoId,
  worktreePath,
  items,
  fields,
  selectedItemId,
  onSelectItem,
  onClose,
}: {
  projectId: string;
  repoId: string | null;
  /** Absent when no worktree is selected — passed through to the composer. */
  worktreePath: string | undefined;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  selectedItemId: string;
  /**
   * Reports a navigation that happened *inside* the panel (Back/Forward)
   * back up to the board, so `BoardView`'s own `selectedItemId` — which
   * drives the column's "is this card open" highlight — never disagrees
   * with what the pane is actually showing.
   */
  onSelectItem: (itemId: string) => void;
  onClose: () => void;
}) {
  const history = usePanelHistory<string>(selectedItemId);

  useEffect(() => {
    if (selectedItemId !== history.current) history.push(selectedItemId);
    // `history.push` only changes identity when its own state changes, and
    // `history.current` tracks `selectedItemId` once pushed — depending on
    // either here would re-run this on every push, not just a real
    // selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId]);

  useEffect(() => {
    // The other direction: Back/Forward inside the panel changes
    // `history.current` without ever touching the `selectedItemId` prop —
    // this is what keeps the board's highlight in sync with that move.
    // Guarded the same way the effect above is, and for the same reason:
    // without it, this would also fire right back on the push that effect
    // just made, one render later.
    if (history.current !== selectedItemId) onSelectItem(history.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.current]);

  useRegisterActivePanel(history, true);

  const labelFor = (itemId: string): string =>
    items.find((i) => i.id === itemId)?.content.title ?? itemId;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border">
      <PanelHeader history={history} label={labelFor} className="shrink-0 border-b border-border px-2 py-1.5" />
      <PanelStack
        history={history}
        className="min-h-0 flex-1"
        render={(itemId) => {
          const item = items.find((i) => i.id === itemId);
          // A history entry can outlive its item — the card left the board
          // (moved off-project, deleted) while still sitting in this panel's
          // own back-stack. Closing rather than rendering a dead end: there
          // is nothing a blank pane can offer the user that a closed one
          // doesn't.
          if (!item) return <MissingCardNotice onClose={onClose} />;
          return (
            <CardDetail
              // Forces `CardComposer`'s own local state (prompt, agent,
              // model) to reset per card — without this key, switching
              // cards without ever fully closing the pane would leave the
              // previous card's composer state bleeding into the new one,
              // since `panel-stack` (deliberately) keeps this pane mounted
              // across a push rather than remounting it.
              key={item.id}
              projectId={projectId}
              repoId={repoId}
              worktreePath={worktreePath}
              item={item}
              fields={fields}
              onClose={onClose}
            />
          );
        }}
      />
    </div>
  );
}

function MissingCardNotice({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    onClose();
  }, [onClose]);
  return null;
}
