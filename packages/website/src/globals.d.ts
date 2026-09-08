/**
 * The year the site was built, inlined as a literal by both configs' `define`.
 *
 * The footer's copyright line reads this. A build-time constant rather than
 * `new Date().getFullYear()` at runtime, because the year is a fact about the
 * published artefact: two visitors loading the same deployed bundle should see
 * the same page, and a component that reads the clock quietly makes the
 * rendered output depend on when it is looked at rather than on what shipped.
 * Every push to `main` touching the site rebuilds it, so it never lags by more
 * than one deploy.
 */
declare const __BUILD_YEAR__: number;

/**
 * The GitHub issue form the early-access section prefills, or `null` for the
 * plain `?title=&body=` URL. Inlined by both configs' `define`.
 *
 * A build-time constant because the answer is a fact about a *different* repo:
 * the form only exists once `.github/ISSUE_TEMPLATE/early-access.yml` is
 * committed in `bilo-io/midnite-apps`, and this repo cannot see whether it is.
 * So the deploy that knows sets `WEBSITE_ISSUE_TEMPLATE=early-access.yml` and
 * every other build gets `null` — which is the safe end, because naming a
 * `template=` GitHub cannot find drops every prefilled field without an error.
 *
 * `vitest.config.ts` pins it to `null` rather than mirroring the environment;
 * see the comment there.
 */
declare const __ISSUE_TEMPLATE__: string | null;

/**
 * The `WEBSITE_ORIGIN` **override**, inlined the same way — and the empty string
 * when it is unset, which is the usual case.
 *
 * Read it through `src/site-origin.ts`'s `SITE_ORIGIN`, never directly: that is
 * where the default lives and where the trailing slash is stripped.
 */
declare const __SITE_ORIGIN__: string;
