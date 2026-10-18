import { useEffect, useState } from 'react';

import {
  CaptureAcceleratorSchema,
  type CaptureSettings,
  type CaptureStatus,
} from '@midnite/studio-shared';

/** What a shortcut state reads as under the field. */
export function shortcutNote(status: CaptureStatus): string {
  const { shortcut } = status;
  switch (shortcut.state) {
    case 'registered':
      return `${shortcut.accelerator} freezes the screen under the pointer and opens the region picker here.`;
    case 'conflict':
    case 'invalid':
      return shortcut.message ?? `${shortcut.accelerator} could not be used.`;
    case 'disabled':
      return shortcut.message ?? 'Global shortcuts are off in this run.';
    default:
      return 'No global shortcut. Set one to capture a region from anywhere while the app is open.';
  }
}

/**
 * Capture's settings (Phase 113 Theme K), kept in main: the one global chord (registered only while the
 * app runs, reported when another app holds it), and whether this app's own windows step out of the
 * shot. Clipboard history has its switch on its own section.
 */
export function SettingsSection({
  status,
  onChange,
}: {
  status: CaptureStatus;
  onChange: (patch: Partial<CaptureSettings>) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(status.settings.shortcut ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(status.settings.shortcut ?? ''), [status.settings.shortcut]);

  const save = async () => {
    const value = draft.trim();
    if (value && !CaptureAcceleratorSchema.safeParse(value).success) {
      setError('Write it as modifiers then a key, e.g. CommandOrControl+Shift+2.');
      return;
    }
    setError(await onChange({ shortcut: value || null }));
  };

  const problem = status.shortcut.state === 'conflict' || status.shortcut.state === 'invalid';

  return (
    <section
      aria-labelledby="capture-settings"
      className="rounded-lg border border-border p-4 text-xs"
    >
      <h2 id="capture-settings" className="mb-2 text-sm font-medium">
        Capture settings
      </h2>
      <label className="mb-1 block font-medium" htmlFor="capture-shortcut">
        Global shortcut
      </label>
      <div className="mb-1 flex gap-2">
        <input
          id="capture-shortcut"
          className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 font-mono"
          value={draft}
          placeholder="e.g. CommandOrControl+Shift+2"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
        <button type="button" onClick={() => void save()}>
          Save
        </button>
        {status.settings.shortcut ? (
          <button type="button" onClick={() => void onChange({ shortcut: null }).then(setError)}>
            Remove
          </button>
        ) : null}
      </div>
      <p
        role={problem ? 'alert' : undefined}
        className={problem ? 'mb-3 text-destructive' : 'mb-3 text-muted-foreground'}
      >
        {error ?? shortcutNote(status)}
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          role="switch"
          checked={status.settings.hideWindows}
          onChange={(e) => void onChange({ hideWindows: e.target.checked })}
        />
        Hide this app's windows while a screen is captured
      </label>
    </section>
  );
}
