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
  onClose,
}: {
  projectId: string;
  repoId: string | null;
  /** Absent when no worktree is selected — passed through to the composer. */
  worktreePath: string | undefined;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  selectedItemId: string;
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
          if (!item) return null;
          return (
            <CardDetail
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
