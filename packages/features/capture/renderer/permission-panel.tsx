import { bridge } from '@midnite/studio-frame';
import type { CapturePermission } from '@midnite/studio-shared';

/**
 * The Screen Recording explanation (Phase 113 Theme K), shown in place of the capture tools until macOS
 * allows them. It says what is captured and that it stays local *before* anything asks macOS — and asks
 * at most once: after the user has answered macOS's own prompt, only System Settings can change it, so
 * a denied permission offers that and nothing else. No prompt loop.
 */
export function PermissionPanel({
  permission,
  onChanged,
}: {
  permission: CapturePermission;
  onChanged: () => void;
}) {
  const ask = async () => {
    await bridge()?.capture.requestPermission();
    onChanged();
  };
  const openSettings = async () => {
    await bridge()?.capture.openPermissionSettings();
  };
  return (
    <section
      aria-labelledby="capture-permission"
      className="rounded-lg border border-border p-4 text-xs"
    >
      <h2 id="capture-permission" className="mb-1 text-sm font-medium">
        Screen Recording permission
      </h2>
      <p className="mb-2 text-muted-foreground">
        macOS asks before any app can see your screen. Capture uses it only when you press a capture
        or record button: a screenshot or recording of the screen, window or region you pick, saved
        as a file on this Mac. Nothing is uploaded, and nothing is captured in the background.
      </p>
      {permission === 'not-determined' ? (
        <>
          <p className="mb-3 text-muted-foreground">
            macOS will show its own prompt once. You may need to quit and reopen the app after
            allowing it.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void ask()}>
              Ask macOS
            </button>
            <button type="button" onClick={() => void openSettings()}>
              Open System Settings
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-muted-foreground">
            {permission === 'restricted'
              ? 'Screen Recording is restricted on this Mac (a profile or parental control manages it).'
              : 'Screen Recording is turned off for this app. Turn it on in System Settings ▸ Privacy & Security ▸ Screen Recording, then reopen the app.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void openSettings()}>
              Open System Settings
            </button>
            <button type="button" onClick={onChanged}>
              Check again
            </button>
          </div>
        </>
      )}
    </section>
  );
}
