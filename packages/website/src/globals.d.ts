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
