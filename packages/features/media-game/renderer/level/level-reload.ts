import { serialise, type EditState } from './level-edit-model';

/**
 * What a level that changed on disk means for the open editor (Phase 138 Theme F):
 * - `same`: the file is what is on screen (an agent saved it), so the editor is simply marked saved;
 * - `reload`: the editor holds nothing of the user's, so the file replaces it;
 * - `conflict`: unsaved edits and a different file, so the user chooses (Save keeps theirs, Reload takes the file).
 */
export type ReloadDecision = 'same' | 'reload' | 'conflict';

export function decideReload(file: unknown, edit: EditState): ReloadDecision {
  if (JSON.stringify(file) === JSON.stringify(serialise(edit))) return 'same';
  return edit.dirty ? 'conflict' : 'reload';
}
