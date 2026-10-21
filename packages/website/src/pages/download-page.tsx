import { LuApple, LuArrowLeft, LuKeyRound } from 'react-icons/lu';

import { Button, Container, GlowCard, Heading, Lede } from '../components';
import { SiteNav } from '../components/site-nav';
import { anchorHref, hrefFor } from '../routes';
import { Footer } from '../sections/footer/footer';

/**
 * How access works, in the order it happens. Midnite is access-gated: there is
 * no public download link, so this page explains the flow and routes every
 * call to action to the early-access form.
 */
const STEPS: readonly { title: string; detail: string }[] = [
  {
    title: 'Ask for access',
    detail:
      'Fill in the early-access form on the landing page with your name and the agents you use. It takes a minute.',
  },
  {
    title: 'Get your invitation',
    detail:
      'Invitations go out in waves. When yours is ready you are sent the install instructions directly, not a public link.',
  },
  {
    title: 'Install Midnite Apps',
    detail:
      'Midnite Apps is the launcher: it installs to /Applications, then installs and opens each midnite app, Midnite Studio included. macOS on Apple silicon only.',
  },
  {
    title: 'Stay up to date',
    detail:
      'The launcher checks for new builds and updates each app in place, so there is nothing to re-download.',
  },
];

/**
 * The access page, still served at `/download/`.
 *
 * **Nothing here may link to a repository or a release list** — access is
 * gated, and every call to action goes to the early-access section. The path
 * keeps its name so existing links and the nav item keep resolving.
 *
 * **The layout is nav / main / footer**, the same three parts the landing page
 * has — `app.tsx` chooses between the two whole pages and neither of them
 * wraps the other, so the footer has to be part of *this* component rather
 * than something the router adds around it.
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
            <Heading level={1}>Get Midnite</Heading>
            <Lede>
              Midnite Apps is the launcher that installs and opens each midnite app, Midnite Studio
              included. Access is invitation-only for now: request it and you will be sent
              everything you need.
            </Lede>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
                <LuApple aria-hidden="true" />
                macOS · Apple silicon
              </span>
              <span
                data-testid="access-badge"
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-elevated px-3 py-1 text-xs text-fg-muted"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-fg-subtle" />
                Early access
              </span>
            </div>

            <Button
              href={anchorHref('early-access')}
              data-testid="get-access"
              icon={<LuKeyRound />}
            >
              Get access
            </Button>
          </div>
        </Container>
      </div>

      <Container className="pb-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <Heading level={2}>How access works</Heading>
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
              <h3 className="text-sm font-semibold text-fg">Already invited?</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Follow the instructions in your invitation. If you cannot find it, request access
                again with the same details and it will be re-sent.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button href={anchorHref('early-access')} variant="ghost" icon={<LuKeyRound />}>
                  Request access
                </Button>
                <Button href={hrefFor('landing')} variant="ghost" icon={<LuArrowLeft />}>
                  Back to the site
                </Button>
              </div>
            </GlowCard>
          </aside>
        </div>
      </Container>
    </main>

    {/*
      The same `Footer` the landing page's registry row renders — imported, not
      copied, so the two pages cannot drift on a link or the agent roster. Its
      anchors are built with `anchorHref`, so from this URL they are
      cross-page navigations to `/#features` rather than dead in-page jumps —
      that is the property `download-page.test.tsx` pins.
    */}
    <Footer />
  </>
);
