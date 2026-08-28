import { ConfirmDialog } from '../../../components/confirm-dialog';
import { useFileEditorStore } from '../../../store/file-editor-store';

/**
 * The unsaved-changes guard's UI, mounted once from `app.tsx`.
 *
 * `ui-store`'s `setActiveView`/`selectRepo`/`selectWorktree` and the
 * beforeunload listener all defer their real state change into
 * `file-editor-store`'s `pendingNav` instead of applying it — this renders
 * whenever one is waiting, independent of `dialog-host.tsx`'s own confirm
 * slot, since neither of those actions can reach a hook-bound `useDialogs()`.
 */
export function FileEditorGuard() {
  const pendingNav = useFileEditorStore((s) => s.pendingNav);
  const target = useFileEditorStore((s) => s.target);
  const saveError = useFileEditorStore((s) => s.saveError);

  if (!pendingNav || !target) return null;

  const fileName = target.relPath.slice(target.relPath.lastIndexOf('/') + 1);

  return (
    <ConfirmDialog
      request={{
        title: `Save changes to "${fileName}"?`,
        body: saveError ?? 'This file has unsaved changes.',
        confirmLabel: 'Save',
        secondaryLabel: 'Discard',
        // Explicitly null, not absent: `undefined` reads to ConfirmDialog as
        // "still being counted" and renders "Checking what this affects…"
        // forever — this guard has no commit-shaped blast radius to report.
        blastRadius: null,
        onConfirm: () => void useFileEditorStore.getState().resolvePendingSave(),
        onSecondary: () => useFileEditorStore.getState().resolvePendingDiscard(),
      }}
      onCancel={() => useFileEditorStore.getState().resolvePendingCancel()}
    />
  );
}
