/**
 * Preview-deployment URLs, spotted in free text (Phase 71 Theme D).
 *
 * A check run or a PR comment from Vercel, Netlify and the like posts a
 * throwaway URL somewhere in its prose — never in a field this app's forge
 * types model on its own — so the only way to offer it is to scan the text a
 * check or a comment actually carries and pull out anything that looks like
 * one of a known set of preview-hosting domains.
 *
 * **This is a heuristic over an allowlist, not a parser.** It will miss a
 * self-hosted preview host nobody has added to the list. That is the
 * deliberate failure mode: a false negative is an absent "Open preview"
 * button, which teaches nothing wrong; a false positive would be a button
 * that opens a marketing page instead of the deployment it claims to.
 */

/** The seven public preview hosts this app knows about out of the box. */
export const PREVIEW_DEPLOY_HOSTS: readonly string[] = [
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'surge.sh',
  'render.com',
  'fly.dev',
  'onrender.com',
];

function escapeForRegex(host: string): string {
  return host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the match pattern from a host list.
 *
 * Exported so the allowlist can be a setting: `browser-store` seeds it with
 * {@link PREVIEW_DEPLOY_HOSTS} and lets it grow with self-hosted domains,
 * which are the common case in a private repo — this one included.
 *
 * The subdomain group (`([a-zA-Z0-9-]+\.)+`) is what keeps the match on
 * **suffix boundaries**: a bare `vercel.app` alternative would also match
 * inside `myvercel.app.com`, which is a different, unrelated host that merely
 * contains the same characters. Requiring at least one `label.` before the
 * allowed suffix is what makes that string a miss instead of a false
 * positive.
 */
export function buildPreviewDeployPattern(hosts: readonly string[]): RegExp {
  const alternation = hosts.map(escapeForRegex).join('|');
  return new RegExp(
    `https?://([a-zA-Z0-9-]+\\.)+(${alternation})(:\\d+)?(/[^\\s"'!.,)|\`]*)?`,
    'gi',
  );
}

/**
 * Extract every preview-deployment URL `text` mentions, deduplicated and in
 * the order first seen.
 *
 * `hosts` defaults to {@link PREVIEW_DEPLOY_HOSTS} so a caller with no
 * opinion — a unit test, mainly — gets the seeded list; a real caller passes
 * `browser-store`'s `previewDeployHosts`, which starts out identical but can
 * grow.
 */
export function matchPreviewDeploy(
  text: string,
  hosts: readonly string[] = PREVIEW_DEPLOY_HOSTS,
): string[] {
  if (!text || hosts.length === 0) return [];
  const matches = text.match(buildPreviewDeployPattern(hosts));
  if (!matches) return [];
  return Array.from(new Set(matches));
}
