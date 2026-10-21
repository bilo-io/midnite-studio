import { bridge, relativeAge, useFrameChrome } from '@midnite/studio-frame';
import {
  clipboardImageUrl,
  CLIPBOARD_HISTORY_MAX_ENTRIES,
  type ClipboardEntry,
} from '@midnite/studio-shared';

/**
 * Clipboard history (Phase 113 Theme K) — **off until the user turns it on**, and blind while off. The
 * list is what main kept: text and images copied since, never anything a password manager marked
 * concealed or transient. Copy puts an entry back on the clipboard; Clear removes all of it from disk,
 * behind a confirm that says how much goes.
 */
export function ClipboardSection({
  enabled,
  entries,
  onToggle,
}: {
  enabled: boolean;
  entries: ClipboardEntry[];
  onToggle: (enabled: boolean) => void;
}) {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const api = bridge()?.capture.clipboard;

  const clear = () =>
    dialogs.confirm({
      title: 'Clear clipboard history?',
      body: 'Deletes every kept entry and image from this Mac. What is on the clipboard now stays there.',
      confirmLabel: 'Clear history',
      danger: true,
      blastRadiusKind: 'trash',
      blastRadius: { count: entries.length, sample: [] },
      onConfirm: () => void api?.clear(),
    });

  return (
    <section
      aria-labelledby="capture-clipboard"
      className="rounded-lg border border-border p-4 text-xs"
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 id="capture-clipboard" className="flex-1 text-sm font-medium">
          Clipboard history
        </h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label="Keep clipboard history"
          />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>
      <p className="mb-3 text-muted-foreground">
        {enabled
          ? `Keeping text and images you copy (the last ${CLIPBOARD_HISTORY_MAX_ENTRIES}), on this Mac only. Anything a password manager marks private is never kept.`
          : 'Off. While it is off, the clipboard is not read at all. Turn it on to keep what you copy from now on — text and images only, never entries a password manager marks private.'}
      </p>
      {entries.length > 0 ? (
        <>
          <ul className="mb-2 divide-y divide-border" aria-label="Clipboard entries">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                {entry.kind === 'image' ? (
                  <img
                    src={clipboardImageUrl(entry.id)}
                    alt={`Copied image, ${entry.width} × ${entry.height}`}
                    className="h-10 w-16 rounded object-cover"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate font-mono" title={entry.text}>
                    {entry.text}
                  </span>
                )}
                {entry.kind === 'image' ? (
                  <span className="flex-1 text-muted-foreground">{`${entry.width} × ${entry.height}`}</span>
                ) : null}
                <span className="text-muted-foreground">
                  {relativeAge(entry.createdAt, Date.now())}
                </span>
                <button
                  type="button"
                  onClick={() => void api?.copy({ id: entry.id })}
                  aria-label="Copy entry"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => void api?.remove({ id: entry.id })}
                  aria-label="Delete entry"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={clear}>
            Clear history…
          </button>
        </>
      ) : enabled ? (
        <p className="text-muted-foreground">Nothing copied yet.</p>
      ) : null}
    </section>
  );
}
