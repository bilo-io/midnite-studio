import { useEffect } from 'react';

import { PM_AMBIENT_DTS } from '@midnite/studio-shared';

import { getMonaco } from '../../lib/monaco/monaco-loader';
import { useApiClientStore } from '../../store/api-client-store';
import { MonacoField } from './monaco-field';

/**
 * The Scripts tab (Phase 70 Theme B) — two `MonacoField`s, **Pre-request
 * Script** above **Tests**, each backed by `draft.preRequestScript`/
 * `draft.testScript` directly (no local component state, same "controlled
 * all the way down" shape every other builder tab already uses).
 *
 * The ambient `pm.d.ts` is registered once, from `PM_AMBIENT_DTS`
 * (`@midnite/studio-shared`) — the single list both this editor's
 * autocomplete and `script-runner.ts`'s sandbox allow-list are generated
 * from, so an unsupported call (`pm.sendRequest`, out of scope entirely)
 * red-squiggles here rather than only failing at run time.
 *
 * Registered from `TestEditor`'s own `useEffect`, **not** at this module's
 * top level: `monaco.typescript` (below) is a lazy getter that, the moment
 * it is first touched, registers the whole TypeScript/JavaScript language
 * contribution — which pulls in a clipboard-command module reading
 * `document.queryCommandSupported` at *its own* module-evaluation time,
 * absent under jsdom. A module-scope call would fire the instant anything
 * imports this file (`request-builder.tsx` does, unconditionally), breaking
 * every component test that renders the builder without ever opening the
 * Scripts tab; an effect fires only once a `TestEditor` actually mounts.
 */
let extraLibRegistered = false;
function ensurePmAmbientLib(): void {
  if (extraLibRegistered) return;
  extraLibRegistered = true;
  void getMonaco().then((monaco) => {
    // `monaco.languages.typescript` is this package's own deprecated shim
    // (typed as `{deprecated: true}`, monaco-editor 0.56) — the real
    // namespace moved to this top-level `typescript` export.
    monaco.typescript.javascriptDefaults.addExtraLib(PM_AMBIENT_DTS, 'ts:pm.d.ts');
  });
}

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
      <MonacoField value={value} onChange={onChange} language="javascript" />
    </div>
  );
}

export function TestEditor({ tabId }: { tabId: string }) {
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);

  useEffect(() => {
    ensurePmAmbientLib();
  }, []);

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
