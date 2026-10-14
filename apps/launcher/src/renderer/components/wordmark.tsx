import type { LauncherApp } from '../../common/catalog';

/**
 * "Midnite **Coder**" — the brand half in the brand face, the app half in its
 * own accent. The same split as Studio's `brand.tsx` and the website's
 * `wordmark.tsx`, with the qualifier carrying the colour so seven tiles read as
 * seven apps from one family.
 */
export function AppWordmark({ app }: { app: LauncherApp }) {
  return (
    <span className="app-wordmark">
      <span className="font-brand app-wordmark-brand">Midnite</span>{' '}
      <span className="app-wordmark-name" style={{ color: app.accent }}>
        {app.name}
      </span>
    </span>
  );
}

/** The launcher's own mark in the top bar. */
export function LauncherWordmark() {
  return (
    <span className="launcher-wordmark">
      <span className="font-brand rainbow-text launcher-wordmark-brand">Midnite</span>{' '}
      <span className="launcher-wordmark-name">Apps</span>
    </span>
  );
}
