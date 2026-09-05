import { Accordion } from '@bilo-io/ui';
import { LuDiff, LuFolderTree } from 'react-icons/lu';

import {
  DIFF_PREF_DEFAULTS,
  useUiStore,
  type CommitFileView,
  type DiffLayout,
} from '../../../store/ui-store';
import { Choice, Field } from './controls';

/**
 * Settings' second way into the two diff controls and the two file-view
 * toggles (Phase 63).
 *
 * The toolbar (`diff-toolbar.tsx`) keeps its own buttons — this page does not
 * replace them, it exists because both are conditionally rendered there: the
 * split-layout toggle disappears while viewing a binary or deleted file, and
 * the old-gutter toggle only appears in unified layout. A preference you can
 * only change when the thing it governs happens to be in the right state is
 * not a preference the user owns, so this page is always visible regardless
 * of what file or diff is currently open.
 *
 * Two accordions, not one flat list of four: "Diff view" and "File lists"
 * govern different surfaces (the diff pane vs. the commit/changes file
 * lists) and share nothing but a settings page.
 */
export function DiffPage() {
  const diffLayout = useUiStore((s) => s.diffLayout);
  const setDiffLayout = useUiStore((s) => s.setDiffLayout);
  const diffShowOldGutter = useUiStore((s) => s.diffShowOldGutter);
  const toggleDiffOldGutter = useUiStore((s) => s.toggleDiffOldGutter);
  const commitFileView = useUiStore((s) => s.commitFileView);
  const setCommitFileView = useUiStore((s) => s.setCommitFileView);
  const changesFileView = useUiStore((s) => s.changesFileView);
  const setChangesFileView = useUiStore((s) => s.setChangesFileView);

  const resetDiffView = () => {
    setDiffLayout(DIFF_PREF_DEFAULTS.diffLayout);
    if (diffShowOldGutter !== DIFF_PREF_DEFAULTS.diffShowOldGutter) {
      toggleDiffOldGutter();
    }
  };
  const resetFileLists = () => {
    setCommitFileView(DIFF_PREF_DEFAULTS.commitFileView);
    setChangesFileView(DIFF_PREF_DEFAULTS.changesFileView);
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Diff view" icon={<LuDiff className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Choice<DiffLayout>
            label="Layout"
            hint="The toolbar's toggle only appears for files that can be split — binary and deleted files have no side-by-side form."
            value={diffLayout}
            onChange={setDiffLayout}
            options={[
              ['unified', 'Unified', 'One column, changes inline'],
              ['split', 'Split', 'Old and new side by side'],
            ]}
          />

          <Choice<'on' | 'off'>
            label="Old-image gutter"
            hint="Only applies in unified layout."
            value={diffShowOldGutter ? 'on' : 'off'}
            onChange={(next) => {
              if ((next === 'on') !== diffShowOldGutter) {
                toggleDiffOldGutter();
              }
            }}
            options={[
              ['on', 'On', 'Show the pre-image line-number column'],
              ['off', 'Off', "Just the current file's line numbers"],
            ]}
          />

          <Field label="Reset" hint="Restore both diff-view preferences above to their defaults.">
            <button
              type="button"
              onClick={resetDiffView}
              className="h-6 w-fit rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Reset to defaults
            </button>
          </Field>
        </div>
      </Accordion>

      <Accordion title="File lists" icon={<LuFolderTree className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <Choice<CommitFileView>
            label="Commit files"
            hint="How the commit inspector lists a commit's files."
            value={commitFileView}
            onChange={setCommitFileView}
            options={[
              ['tree', 'Tree', 'Nested by directory'],
              ['list', 'List', 'Flat, full paths'],
            ]}
          />

          <Choice<CommitFileView>
            label="Uncommitted changes"
            hint="How the Changes panel lists a checkout's files. Its own preference — the two panes answer different questions and have different defaults."
            value={changesFileView}
            onChange={setChangesFileView}
            options={[
              ['tree', 'Tree', 'Nested by directory'],
              ['list', 'List', 'Flat, full paths'],
            ]}
          />

          <Field
            label="Reset"
            hint="Restore both file-list preferences above to their defaults."
          >
            <button
              type="button"
              onClick={resetFileLists}
              className="h-6 w-fit rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Reset to defaults
            </button>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}
