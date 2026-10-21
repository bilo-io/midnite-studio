import { PM_AMBIENT_DTS } from '@midnite/studio-shared';

import { useApiClientStore } from './api-client-store';
import { MonacoField } from './ui';

/**
 * The Scripts tab (Phase 70 Theme B) — two `MonacoField`s, **Pre-request
 * Script** above **Tests**, each backed by `draft.preRequestScript`/
 * `draft.testScript` directly (no local component state, same "controlled
 * all the way down" shape every other builder tab already uses).
 *
 * The ambient `pm.d.ts` is `PM_AMBIENT_DTS` (`@midnite/studio-shared`) — the
 * single list both this editor's autocomplete and `script-runner.ts`'s sandbox
 * allow-list are generated from, so an unsupported call (`pm.sendRequest`, out
 * of scope entirely) red-squiggles here rather than only failing at run time.
 * It reaches the editor as the code field's `ambientLib`; registering it with
 * Monaco's language service (once, and only when a script field actually
 * mounts — see `compose/api-client-code-field.tsx`) is the Studio editor's
 * job, since this package never imports an editor. An editor with no language
 * service ignores it.
 */
const PM_AMBIENT_LIB = { content: PM_AMBIENT_DTS, fileName: 'ts:pm.d.ts' } as const;

function ScriptField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-6 shrink-0 items-center border-b border-border px-2 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <MonacoField value={value} onChange={onChange} language="javascript" ambientLib={PM_AMBIENT_LIB} />
    </div>
  );
}

export function TestEditor({ tabId }: { tabId: string }) {
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);

  if (!tab) return null;
  const { draft } = tab;

  return (
    <div className="flex min-h-0 flex-1 flex-col divide-y divide-border">
      <ScriptField
        label="Pre-request Script"
        value={draft.preRequestScript}
        onChange={(value) => editDraft(tabId, { preRequestScript: value })}
      />
      <ScriptField
        label="Tests"
        value={draft.testScript}
        onChange={(value) => editDraft(tabId, { testScript: value })}
      />
    </div>
  );
}

/** The Scripts tab's count badge — the phase doc's own wording ("a count
 *  badge when either is non-empty"). Exported so `request-builder.tsx`'s
 *  tab row can render it without re-deriving the rule. */
export function scriptCountBadge(draft: { preRequestScript: string; testScript: string }): number {
  return (draft.preRequestScript.trim().length > 0 ? 1 : 0) + (draft.testScript.trim().length > 0 ? 1 : 0);
}
