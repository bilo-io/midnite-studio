import { rosterLabel } from './roster';

/**
 * The early-access sign-up, composed as a GitHub issue.
 *
 * **Why an issue and not a form service.** A "join the waitlist" box normally
 * means a third-party endpoint, a public API key sitting in the client, and an
 * address list living somewhere neither we nor the visitor can see. This site
 * has no backend and wants none: the request is a prefilled issue in the public
 * releases repo, opened in a new tab, which the visitor reads in full and
 * submits themselves under their own account. Zero services, zero tokens in the
 * page, and the visitor can see and edit every character before it is posted.
 *
 * The trade-off is honest and worth stating on the page: the issue is public,
 * and it needs a GitHub account. Both are true of filing a bug here already.
 */

/** The public releases repo. This repo is private — never link to it. */
export const ISSUE_REPO = 'bilo-io/midnite-apps';

const NEW_ISSUE_URL = `https://github.com/${ISSUE_REPO}/issues/new`;

/**
 * The issue form to open, or `null` for the plain title/body URL.
 *
 * **Set by the build, not by this file.** `WEBSITE_ISSUE_TEMPLATE` is inlined
 * as `__ISSUE_TEMPLATE__` by `vite.config.ts`, and unset — the default, and the
 * state today — means `null`. That is deliberate rather than fussy: whether the
 * form works is a fact about a *different repo*, and this one cannot see it.
 * `bilo-io/midnite-apps` must be carrying
 * `.github/ISSUE_TEMPLATE/early-access.yml`, and until it is, naming a
 * `template=` GitHub cannot find gets the visitor the template *chooser* with
 * every prefilled field silently dropped — strictly worse than the plain URL,
 * and a failure that looks fine right up until someone uses the form. A source
 * literal would have made "is the YAML merged yet?" a question answered by a
 * commit in this repo; an environment variable makes it answered by the deploy
 * that actually knows.
 *
 * The YAML is mirrored at `docs/website/early-access-issue-form.yml` and open
 * as `bilo-io/midnite-apps#4`; `docs/WEBSITE.md` § Early access has the flip.
 *
 * With an issue form GitHub reads the query string as `field-id=value` pairs
 * rather than `body`, which is why {@link composeIssueUrl} branches on this
 * instead of always sending both.
 */
export const ISSUE_TEMPLATE: string | null = __ISSUE_TEMPLATE__;

/** The label the issue is filed under, so the list is filterable. */
export const ISSUE_LABEL = 'early-access';

export type EarlyAccessRequest = {
  email: string;
  /** What they want it for. Optional — an empty string is fine. */
  useCase: string;
  /** Agent ids from the roster, in roster order. */
  agentIds: readonly string[];
};

/**
 * A deliberately boring email check.
 *
 * One `@`, something before it, a dotted something after it, no whitespace.
 * That is the whole useful range of client-side email validation: RFC 5322 is
 * satisfiable by addresses no provider will accept, and the only real proof an
 * address works is mail arriving at it. This exists to catch the typo — a
 * missing `@`, a trailing comma — not to adjudicate the spec.
 */
export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim());

/**
 * The issue body, as markdown. Also what the page shows in its preview, so the
 * text the visitor reads is byte-for-byte the text that gets posted.
 */
export const composeIssueBody = ({ email, useCase, agentIds }: EarlyAccessRequest): string => {
  const agents = agentIds.length ? agentIds.map(rosterLabel).join(', ') : 'Not specified';
  const useCaseLine = useCase.trim().length ? useCase.trim() : 'Not specified';
  return [
    '### Email',
    '',
    email.trim(),
    '',
    '### What I want it for',
    '',
    useCaseLine,
    '',
    '### Agents I use',
    '',
    agents,
    '',
    '---',
    '',
    'Filed from the Midnite Studio site’s early-access form.',
  ].join('\n');
};

/** The issue title. Carries the address so the list is scannable. */
export const composeIssueTitle = (email: string): string => `Early access: ${email.trim()}`;

/**
 * The full `issues/new` URL for one request.
 *
 * Built with `URLSearchParams`, not string concatenation, so every value is
 * percent-encoded once and correctly — an `&` in the free-text field would
 * otherwise truncate the body at that character and silently drop the rest.
 *
 * `template` defaults to {@link ISSUE_TEMPLATE}, which the build sets. It is a
 * parameter at all so both branches are testable in one run: the constant is
 * inlined by `define`, so a test cannot flip it, and a suite that only ever saw
 * the value the current build happens to carry would leave the other half of
 * this function unexercised until the day it went live.
 */
export const composeIssueUrl = (
  request: EarlyAccessRequest,
  template: string | null = ISSUE_TEMPLATE,
): string => {
  const params = new URLSearchParams();
  params.set('title', composeIssueTitle(request.email));
  params.set('labels', ISSUE_LABEL);

  if (template) {
    // An issue form takes one query parameter per field id, matching the ids in
    // `docs/website/early-access-issue-form.yml`. `app` is not among them: its
    // dropdown has one option and is preselected, and it exists only so the
    // other repo's `issue-app-label.yml` can find an `### App` heading in the
    // body — see the comment on that field in the YAML.
    params.set('template', template);
    params.set('email', request.email.trim());
    params.set('use-case', request.useCase.trim());
    params.set('agents', request.agentIds.map(rosterLabel).join(', '));
  } else {
    params.set('body', composeIssueBody(request));
  }

  return `${NEW_ISSUE_URL}?${params.toString()}`;
};
