import { LuApple, LuArrowLeft, LuExternalLink } from 'react-icons/lu';

import { Button, Container, Eyebrow, GlowCard, Heading, Lede } from '../components';
import { SiteNav } from '../components/site-nav';
import { hrefFor } from '../routes';

import { CopyButton } from './copy-button';
import { useLatestVersion } from './use-latest-version';

/**
 * The install command, verbatim, and the single source of it on this page.
 *
 * It is also what the copy button puts on the clipboard, so the two can never
 * drift. Documented in `docs/RELEASING.md`.
 */
const INSTALL_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/install.sh | sh';

/** Where the builds live. This repo is private; nothing here may link to it. */
const RELEASES_URL = 'https://github.com/bilo-io/midnite-apps/releases';
const INSTALLER_URL =
  'https://github.com/bilo-io/midnite-apps/blob/main/midnite-studio/install.sh';

/**
 * What the script does, in the order it does it.
 *
 * Read off the installer itself rather than paraphrased from memory — a page
 * that asks someone to pipe a URL into `sh` owes them an accurate account of
 * what it will do, and a link to read it first.
 */
const STEPS: readonly { title: string; detail: string }[] = [
  {
    title: 'Checks the machine',
    detail:
      'Refuses anything that is not macOS on arm64, because Apple silicon is the only build published.',
  },
  {
    title: 'Resolves the version',
    detail:
      'Reads midnite-studio/version.json in the public releases repo — not “latest release”, which in a repo distributing several apps is whichever one shipped most recently.',
  },
  {
    title: 'Downloads the zip with curl',
    detail:
      'curl never sets the com.apple.quarantine attribute a browser would, so the app opens without the Gatekeeper “unverified developer” prompt.',
  },
  {
    title: 'Verifies before it installs',
    detail:
      'Unpacks to a staging directory and checks the bundle is structurally complete — Info.plist, the executable, and a full-size Electron Framework — before anything in /Applications is touched.',
  },
  {
    title: 'Swaps it in, keeping a backup',
    detail:
      'The previous copy is moved aside and only removed once the new one verifies, so an interrupted install cannot leave a broken app behind.',
  },
];

const VersionBadge = () => {
  const state = useLatestVersion();

  const text =
    state.status === 'released'
      ? `v${state.version}`
      : state.status === 'unreleased'
        ? 'No public release yet'
        : state.status === 'unavailable'
          ? 'latest'
          : '…';

  return (
    <span
      data-testid="version-badge"
      className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-elevated px-3 py-1 font-mono text-xs text-fg-muted"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          state.status === 'released' ? 'bg-lane-2' : 'bg-fg-subtle'
        }`}
      />
      {text}
    </span>
  );
};

/**
 * The download page.
 *
 * One command, what it does, and where the builds come from. It links to the
 * public `bilo-io/midnite-apps` repo for the release list and the installer
 * source; **it must never link to `bilo-io/midnite-studio`**, which is private
 * and would give every visitor a 404 that looks like a broken site.
 *
 * The version badge is decoration, not a gate: the command is correct whether
 * or not the feed answers, so the page renders fully while the fetch is in
 * flight and stays useful when it fails.
 */
export const DownloadPage = () => (
  <>
    <SiteNav offLanding />
    <main>
      <div className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 30% 0%, var(--ws-accent-soft) 0%, transparent 62%)',
          }}
        />
        <Container className="pb-16 pt-20 sm:pt-28">
          <div className="flex flex-col items-start gap-5">
            <Eyebrow>Download</Eyebrow>
            <Heading level={1}>One command.</Heading>
            <Lede>
              Midnite Studio installs to <code className="font-mono text-fg">/Applications</code>{' '}
              from the public releases repository. Paste this into a terminal.
            </Lede>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
                <LuApple aria-hidden="true" />
                macOS · Apple silicon
              </span>
              <VersionBadge />
            </div>

            <GlowCard glow="accent" className="w-full max-w-3xl" bare>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
                <span className="font-mono text-xs text-fg-subtle">sh</span>
                <CopyButton value={INSTALL_COMMAND} label="the install command" />
              </div>
              {/*
                Wraps rather than scrolls. The command is one long line, and a
                horizontally-scrolling code block inside a card with
                `overflow-hidden` reads as *clipped* — the visitor sees a
                sentence cut off at the card's edge with nothing to say it can
                be dragged. Wrapping shows all of it, and the copy button beside
                it is what guarantees the pasted text is exact either way.
              */}
              <pre className="whitespace-pre-wrap break-all bg-bg-sunken px-4 py-4 text-left">
                <code
                  data-testid="install-command"
                  className="font-mono text-xs leading-relaxed text-fg sm:text-sm"
                >
                  {INSTALL_COMMAND}
                </code>
              </pre>
            </GlowCard>

            <p className="max-w-prose text-sm text-fg-subtle">
              Prefer to read it first? The installer is{' '}
              <a
                href={INSTALLER_URL}
                className="text-accent underline decoration-dotted underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                a single POSIX shell script
              </a>
              . Set <code className="font-mono">MIDNITE_STUDIO_VERSION=0.3.1</code> to pin a
              version, or <code className="font-mono">MIDNITE_STUDIO_NO_OPEN=1</code> to skip
              launching the app afterwards.
            </p>
          </div>
        </Container>
      </div>

      <Container className="pb-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <Heading level={2}>What the script does</Heading>
            <ol className="mt-6 space-y-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-xs text-accent"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">{step.title}</p>
                    <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <aside className="flex flex-col gap-4">
            <GlowCard>
              <h3 className="text-sm font-semibold text-fg">Releases and issues</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Every build, its notes and the bug tracker live in the public{' '}
                <span className="font-mono text-xs">bilo-io/midnite-apps</span> repository.
                Release tags are namespaced per app —{' '}
                <span className="font-mono text-xs">midnite-studio/v0.3.1</span>, never a bare
                version — because it ships more than one.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  href={RELEASES_URL}
                  variant="ghost"
                  target="_blank"
                  rel="noreferrer"
                  icon={<LuExternalLink />}
                >
                  All releases
                </Button>
                <Button href={hrefFor('landing')} variant="ghost" icon={<LuArrowLeft />}>
                  Back to the site
                </Button>
              </div>
            </GlowCard>

            <GlowCard>
              <h3 className="text-sm font-semibold text-fg">Updating</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Re-running the same command installs the newest version over the old one. Builds
                are ad-hoc signed rather than notarized today, so re-running the installer — not
                an in-app &ldquo;restart to install&rdquo; — is the update path.
              </p>
            </GlowCard>
          </aside>
        </div>
      </Container>
    </main>
  </>
);
