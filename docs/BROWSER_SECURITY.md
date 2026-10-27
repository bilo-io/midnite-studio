# Browser security

What the Browser (Studio's browser pane and the standalone `apps/browser`) does and does not do to
keep a web page from hurting the user, the Mac, or an agent reading that page. Phase 117 built it;
the design record is [`phase-117-browser-security-hardening.md`](../.midnite/tasks/phases/phase-117-browser-security-hardening.md).
This page describes what is on `main`. Where a rule has a unit test, the test file is named, so a
claim here can be checked against code.

All of it lives in `packages/features/browser/main/` (and `shared/` for the rules the renderer and the
launcher also need). The rules are written against structural types, never `electron`, so they run
under bare vitest; `main/pure-rules.test.ts` keeps that true and lists every rule with its test file.

## What a page can and cannot do

| Surface | Behaviour | Where |
|---|---|---|
| Page process | Sandboxed, context-isolated, `nodeIntegration` off, `webviewTag` off, no preload. `window.open` is always denied; a page that wants a new tab gets one made by main. DevTools follow the composer's `devToolsAllowed` (off in a packaged build; a request answers a toast). | `browser-security.ts`, `web-preferences.test.ts` |
| Permissions | Everything is denied by default, on request and on check. Camera, microphone, location and notifications prompt from a bar above the tab; clipboard-read and every device class are never promptable. | `browser-session-policy.ts`, `permission-grant-store.ts` |
| Remembered grants | Per origin, in `<userData>/browser-permissions.json` (0600, atomic rename). Revoked or reset in Settings ▸ Browser ▸ Site permissions. A prompt is rate-limited to one per origin and permission per minute, and cancelled when the tab navigates, closes or is discarded. Origins are displayed as Unicode only when every label is one script; otherwise as punycode. | `permission-grant-store.test.ts`, `idn-hygiene.test.ts` |
| Navigation | Only `http` and `https` open. Other schemes are refused with a visible message. | `browser-security.ts` |
| Downloads | Cancelled by default. With Settings ▸ Browser ▸ Downloads on, files go to a quarantine folder (`~/Downloads/Midnite Quarantine`, 0700). Documents, media and images are allowed; archives, disk images, installers, scripts, executables and unknown types ask first, in the same in-tab bar; anything over 1 GB, or from a page whose verdict is `danger`, is refused. After the file completes, `com.apple.quarantine` is set, SHA-256 is recorded, executables, disk images and installers get `spctl --assess`, `clamscan` runs only if installed, and a line is appended to `<userData>/downloads.ndjson` (0600). Nothing is ever opened by the app. | `download-policy.ts`, `download-quarantine.ts` |
| Site verdict | One `SiteVerdict` per tab, shown as one badge in the address field: TLS state, mixed content, insecure form, lookalike host, known-bad feed hit, vulnerable library signatures, credential risk, trackers blocked. A certificate failure or a feed hit shows an interstitial with no way past unless Settings ▸ Browser ▸ Site safety allows "proceed for this session". | `site-verdict-state.ts`, `shared/domain/site-verdict.ts`, `lookalike.ts` |
| Credential phishing | When a page shows a password field, six rules judge it (`http-password`, `lookalike`, `first-seen`, `cross-origin-action`, `sign-in-elsewhere`, `brand-mention`) and raise the badge. There is no second badge and no interstitial; a risky page's downloads are refused. | `phishing-rules.ts`, `login-form-read.ts` |
| Trackers | Third-party requests matching the bundled EasyPrivacy list are cancelled; third-party `Cookie` and `Set-Cookie` are stripped; `Referer` is reduced to origin cross-site; the User-Agent is reduced to the Chromium major. Applies to the `persist:browser` partition only, not to web apps. Per-site exceptions persist. | `browser-request-filter.ts`, `filter-list.ts` |

### What it does not do

- **No fingerprinting defence beyond the User-Agent.** Canvas, audio and font fingerprinting need a
  page-side hook, which the preload position below rules out.
- **No Safe Browsing and no Web Risk.** Safe Browsing's terms bar a possibly-sold app, and a Web Risk
  lookup sends URLs to Google. Reputation is the two open feeds below, matched locally.
- **No bypass memory across a changed certificate.** "Proceed for this session" is not re-checked if the
  site's certificate changes mid-session.
- **Third-party detection uses a small multi-part-suffix heuristic**, not the full Public Suffix List.
- **Password fields in cross-origin iframes, closed shadow roots, or past the read's node caps are not
  seen** by the phishing rules.
- **No per-tab-group containers.** One `persist:browser` partition (and one per web app).
- **Electron itself is not bumped by this work.** `electron-freshness` is a gate for the Browser bundle;
  the bump is Phase 76 A.

## Feeds, licences and switches

Two reputation feeds and one bundled list. Each outbound feed host is an entry in the egress registry
(`shared/src/egress.ts`), so it appears in the app's network disclosure.

| Source | What | Licence | Switch | Network |
|---|---|---|---|---|
| URLhaus (abuse.ch) | Malware URLs | CC0 | Settings ▸ Privacy, **off by default** | `urlhaus.abuse.ch`, pulled every 6 h while on, stored in `<userData>/browser-feeds/` |
| OpenPhish community feed | Phishing URLs | OpenPhish community feed terms (free, attribution) | Settings ▸ Privacy, **off by default** | `openphish.com`, same schedule and store |
| EasyPrivacy | Tracker host rules (~53k host-anchored rules of ~57k lines; cosmetic, unanchored and unmodelled-option rules are counted and dropped, never guessed) | Dual **GPL-3 or CC BY-SA 3.0**, by the EasyList authors | Settings ▸ Browser ▸ Privacy, **on by default** | None; vendored, refreshed with the app |

- With both feed switches off, no feed request leaves the Mac. A lookup is local: the URL being
  visited is never sent anywhere.
- **EasyPrivacy is vendored as a data file** at `packages/features/browser/main/data/easyprivacy.generated.ts`,
  with its licence record (`EASYPRIVACY-LICENCE.md`) and the SHA-256 of the source beside it. The app
  redistributes it under CC BY-SA 3.0, attributed to "The EasyList authors (https://easylist.to/)";
  the generated file is the share-alike derivative and is the only part under that licence. It is
  consumed at runtime as data by `filter-list.ts`; the app's code does not link it. Regenerate with
  `node packages/features/browser/scripts/gen-easyprivacy.mjs`. DuckDuckGo Tracker Radar is not used:
  its non-commercial clause rules it out.
- A feed hit is shown with the feed and the matching entry. "Proceed" for a feed hit is per entry and is
  revoked when the feed's switch goes off.

## The preload position

**Browser tabs have no preload and no bridge.** A page in a tab cannot call `window.midniteStudio`,
because nothing is injected into it. The chrome around the tab (address row, bars, interstitial) is the
app's own renderer and talks to main over the bridge; the page does not.

Main reads a page in exactly two ways, both through `executeJavaScriptInIsolatedWorld`, never the
page's own world:

1. **The login-form read** (`login-form-read.ts`, world `1117`): a fixed script that returns
   `{ hasPasswordField, formActionOrigins[] }` (zod-checked) and installs no listener, global or timer. It
   calls every DOM member through its prototype, because named-property clobbering crosses worlds. It
   runs after load, on in-page navigation, and on typing (throttled to 2 s).
2. **The agent's tools** (`page-reader.ts`, a separate world), only during an agent session.

Anything that would need a preload (a page-side API shim, canvas noise) is out of scope for that reason.

## The agent boundary

An agent reading a page is the dangerous case: the page is untrusted text, the agent may hold
credentials, and the agent can act. The design is to break that combination instead of trying to detect
injection.

- **Page words only travel as `UntrustedPageContent`** (`shared/untrusted-page-content.ts`): provenance
  tagged, capped at 64 KiB, passed through `redactPaths`. A zod walk in
  `apps/browser/src/compose/browser-agent-boundary.test.tsx` holds every agent tool response to that
  envelope, pixels, or a fixed error line (an error message never carries page text).
- **Six tools only** (`navigate`, `read`, `find`, `click`, `type`, `screenshot`), run by
  `BrowserAgentSession` (`browser-agent-session.ts`) in an isolated world against a per-session
  **origin allowlist** chosen at start.
- **The session pauses for the user** on four actions: navigating off the allowlist, typing into a
  password field, submitting a form, and a download. The call resolves only when the user answers, or
  declines after two minutes.
- **No egress while a session is live.** The request filter's `withRequestGate` cancels the driven tab's
  requests to origins outside the allowlist and outside the page's own site.
- **No vault.** `browser-agent` is a runtime vault principal that can never be granted anything
  (`runtime/src/vault/grants.ts`). The session holds no vault handle.
- **A site verdict rides along.** Each capture carries the tab's level (`ok`, `caution`, `danger`);
  plain http reads `caution`. "Proceed for this session" on an interstitial is refused while an agent
  session drives the tab.
- **Injection heuristics are logged, not relied on.** `shared/injection-heuristics.ts` marks a capture
  `caution` and logs it; tested on fixtures modelled on the Comet and Atlas disclosures. They never
  gate anything, because the boundary above holds without them.
- **ClickFix clipboard watch.** `clipboard-watch.ts` polls the clipboard once a second, only while a
  Browser window is focused, keeps only a hash, and counts a change only after a page interaction. A
  shell-command shape (`shared/clickfix.ts`) raises a warning bar. On by default; Settings ▸ Browser ▸
  Clipboard. Async clipboard writes are already denied; `execCommand('copy')` still works, which is why
  the watch exists.
- **Page deep links.** A page's `midnite-studio://` link is intercepted at `openExternal` and carries the
  page's origin. Links that act (`run`, `clone`) are limited to one per origin per 10 s
  (`shared/page-deep-link.ts`), a page-asked run gets a danger confirm and is never auto-sent, and the
  launcher applies the same limit to `run=`.

The runtime that will actually drive these tools is Phase 121; today the session is complete and
tested, and its tools answer "no session" when none is running.

## Platform gates

Electron freshness is judged for both pins that ship (`root:electron-freshness`; `--strict` fails the
Browser bundle build when the launcher's runtime is outside the supported window). Fuses are flipped
and read back at pack time (`apps/launcher/scripts/afterpack.cjs`, `scripts/lib/electron-fuses.mjs`).
`assertSiteIsolation` throws in dev and logs when packaged if a dangerous Chromium switch is present.

## How it is tested

Rules are vitest (see the table in `main/pure-rules.test.ts`). Two Playwright specs hold what needs a
real browser, and say plainly what they do not cover:

- `packages/app/e2e/browser-interstitial.spec.ts`: a real TLS failure from Chromium against a
  self-signed server, the interstitial's real layout. Under Playwright the tab is not an Electron
  `WebContentsView`, so the failure is delivered as the `failed` event main would send.
- `packages/app/e2e/browser-permission-bar.spec.ts`: real `getUserMedia` refused, then allowed, with the
  app's own bar between. The spec stands in for main's permission handler.
- `packages/app/e2e/visual/site-badge.spec.ts`: the badge's three states.

Still manual, per the phase's Verification: a packaged-app pass through the badssl.com matrix, one real
ClickFix lure served locally, and an agent session against a page with hidden instructions.

To report a vulnerability, follow [`SECURITY.md`](../SECURITY.md); do not open an issue.
