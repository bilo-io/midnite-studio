import { useMemo, useRef, useState } from 'react';
import { LuArrowRight, LuCheck, LuExternalLink, LuGithub, LuPencil, LuTriangleAlert } from 'react-icons/lu';

import { Button, Eyebrow, GlowCard, Heading, Lede, Reveal, Section } from '../../components';

import {
  composeIssueBody,
  composeIssueTitle,
  composeIssueUrl,
  ISSUE_LABEL,
  ISSUE_REPO,
  isValidEmail,
} from './issue-url';
import { AGENT_ROSTER } from './roster';

const EMAIL_ERROR_ID = 'early-access-email-error';
const EMAIL_HINT_ID = 'early-access-email-hint';

type Preview = { url: string; title: string; body: string };

/**
 * The early-access request: one glowing input that grows into a short form.
 *
 * **The shape is the point.** A three-field form sitting open on a landing page
 * is a wall the reader has to price before they engage with it; the same three
 * fields behind a single input they can *see* is one decision — type your
 * address — with the rest arriving only once they have made it. So the resting
 * state is one field, and focusing or typing in it reveals the two optional
 * ones underneath. It never collapses again: pulling a form closed under
 * someone's cursor because focus moved is hostile, and there is nothing to gain
 * from the reclaimed space once they have started.
 *
 * **Submitting shows the issue, it does not send it.** There is no backend and
 * no third-party form service here — pressing the button composes a prefilled
 * issue in the public releases repo and shows it, verbatim, in a preview. The
 * visitor reads the exact text, then opens it on GitHub in a new tab and posts
 * it under their own account. That is worth the extra click three times over:
 * no address list living somewhere they cannot see, no API key in the page, and
 * nothing submitted that they have not read. It also means the "open" control
 * is a real `<a>` activated by a real click, which is the only reliable way to
 * open a new tab without a popup blocker eating it.
 *
 * Motion: the reveal is the site's one entrance (`Reveal`), whose transition
 * runs on the duration tokens that `tokens.css` zeroes under
 * `prefers-reduced-motion` — and `useReducedMotion` is not needed because
 * nothing here animates in JS. The glow on focus is a `box-shadow` transition
 * on the same tokens.
 */
export const EarlyAccess = () => {
  const [email, setEmail] = useState('');
  const [useCase, setUseCase] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const emailRef = useRef<HTMLInputElement | null>(null);

  /** Roster order, not click order — the issue should read the same every time. */
  const agentIds = useMemo(
    () => AGENT_ROSTER.filter((agent) => selected.includes(agent.id)).map((agent) => agent.id),
    [selected],
  );

  const toggleAgent = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError('That does not look like an email address — check it and try again.');
      emailRef.current?.focus();
      return;
    }
    setError(null);
    const request = { email, useCase, agentIds };
    setPreview({
      url: composeIssueUrl(request),
      title: composeIssueTitle(email),
      body: composeIssueBody(request),
    });
  };

  return (
    <Section id="early-access" label="Early access">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
        <div className="flex flex-col gap-4">
          <Eyebrow>Early access</Eyebrow>
          <Heading level={2} typeIn>
            Ask for a build.
          </Heading>
          <Lede typeIn>
            Midnite Studio is usable and unfinished. Tell us what you would point it at and which
            agents you already run, and you go on the list — and get asked first when the thing
            you asked about ships.
          </Lede>
          <p className="max-w-prose text-sm leading-relaxed text-fg-subtle">
            No mailing-list service and no tracking: the form composes a{' '}
            <span className="text-fg-muted">public GitHub issue</span> in{' '}
            <span className="font-mono text-xs text-fg-muted">{ISSUE_REPO}</span>, shows you
            exactly what it says, and you post it yourself. It needs a GitHub account, and the
            issue — including the address you type — is public, the same as filing a bug.
          </p>
        </div>

        <GlowCard glow="accent" className="w-full">
          {preview ? (
            /*
              The preview. Rendered from the same `composeIssueBody` the URL
              carries, so what is on screen cannot drift from what gets posted —
              there is deliberately no second copy of this text to keep in sync.
            */
            <div data-testid="early-access-preview" className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-lane-2">
                <LuCheck aria-hidden="true" />
                Ready to post
              </div>

              <div className="rounded-md bg-bg-sunken p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-fg-subtle">Title</p>
                <p data-testid="preview-title" className="mt-1 break-words font-mono text-xs text-fg">
                  {preview.title}
                </p>
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-fg-subtle">Body</p>
                <pre
                  data-testid="preview-body"
                  className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fg-muted"
                >
                  {preview.body}
                </pre>
                <p className="mt-4 flex items-center gap-2 text-xs text-fg-subtle">
                  <LuGithub aria-hidden="true" />
                  {ISSUE_REPO} · labelled{' '}
                  <span className="font-mono text-accent">{ISSUE_LABEL}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="open-issue"
                  icon={<LuExternalLink />}
                >
                  Open it on GitHub
                </Button>
                <Button
                  variant="ghost"
                  data-testid="edit-request"
                  onClick={() => setPreview(null)}
                  icon={<LuPencil />}
                >
                  Edit
                </Button>
              </div>

              <p className="text-xs leading-relaxed text-fg-subtle">
                It opens in a new tab with every field already filled in. Nothing is posted until
                you press GitHub&rsquo;s own <span className="text-fg-muted">Submit</span> button.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate data-testid="early-access-form">
              <label htmlFor="early-access-email" className="block text-sm font-medium text-fg">
                Your email
              </label>

              {/*
                The one field. `flex` with the submit tucked inside the same
                rounded well, so the resting state reads as a single control
                rather than as a field plus a button — which is what makes the
                growth feel like the control opening rather than a form
                appearing.
              */}
              <div
                className={[
                  'mt-2 flex items-center gap-2 rounded-full bg-bg-sunken px-2 py-2 transition duration-base',
                  /*
                    Focused, the field wears the neon pulse; at rest, the soft
                    glow. The error ring stays a flat single colour on purpose —
                    validation has to read as a state, and a breathing rainbow
                    around a field the visitor has just got wrong reads as
                    decoration.
                  */
                  error
                    ? 'shadow-[0_0_0_1px_var(--ws-lane-4)]'
                    : expanded
                      ? 'ws-neon'
                      : 'shadow-glow-soft',
                ].join(' ')}
              >
                <input
                  ref={emailRef}
                  id="early-access-email"
                  data-testid="email-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? EMAIL_ERROR_ID : EMAIL_HINT_ID}
                  onFocus={() => setExpanded(true)}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setExpanded(true);
                    if (error) setError(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
                />
                <Button type="submit" data-testid="submit-request" aria-label="Compose the request">
                  <span className="hidden sm:inline">Request</span>
                  <LuArrowRight aria-hidden="true" />
                </Button>
              </div>

              {error ? (
                <p
                  id={EMAIL_ERROR_ID}
                  data-testid="email-error"
                  role="alert"
                  className="mt-2 flex items-center gap-2 text-xs text-lane-4"
                >
                  <LuTriangleAlert aria-hidden="true" className="shrink-0" />
                  {error}
                </p>
              ) : (
                <p id={EMAIL_HINT_ID} className="mt-2 text-xs text-fg-subtle">
                  The only required field. Everything below is optional.
                </p>
              )}

              {expanded ? (
                <Reveal>
                  <div className="mt-6 flex flex-col gap-6 border-t border-line pt-6">
                    <div>
                      <label
                        htmlFor="early-access-use-case"
                        className="block text-sm font-medium text-fg"
                      >
                        What would you point it at?
                      </label>
                      <textarea
                        id="early-access-use-case"
                        data-testid="use-case-input"
                        rows={3}
                        value={useCase}
                        placeholder="A monorepo with four agents running at once, mostly reviewing each other’s PRs."
                        onChange={(event) => setUseCase(event.target.value)}
                        className="mt-2 w-full resize-y rounded-md bg-bg-sunken px-3 py-2 text-sm text-fg shadow-glow-soft outline-none transition duration-base placeholder:text-fg-subtle focus:shadow-glow"
                      />
                    </div>

                    <fieldset>
                      <legend className="text-sm font-medium text-fg">Which agents do you use?</legend>
                      <p className="mt-1 text-xs text-fg-subtle">
                        The ten the app launches out of the box. Pick any number.
                      </p>
                      <div
                        data-testid="agent-chips"
                        className="mt-3 flex flex-wrap gap-2"
                      >
                        {AGENT_ROSTER.map((agent) => {
                          const on = selected.includes(agent.id);
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              /* `aria-pressed` and not a checkbox: these are
                                 toggles in a row, and a screen reader should
                                 hear "pressed", not an unlabelled group of ten
                                 boxes. */
                              aria-pressed={on}
                              data-testid={`agent-chip-${agent.id}`}
                              onClick={() => toggleAgent(agent.id)}
                              className={[
                                'rounded-full px-3 py-1.5 text-xs transition duration-fast',
                                on
                                  ? 'bg-accent text-accent-fg shadow-glow'
                                  : 'bg-bg-sunken text-fg-muted shadow-glow-soft hover:text-fg',
                              ].join(' ')}
                            >
                              {agent.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                </Reveal>
              ) : null}
            </form>
          )}
        </GlowCard>
      </div>
    </Section>
  );
};
