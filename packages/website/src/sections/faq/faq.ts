/**
 * The FAQ, as data.
 *
 * Kept out of the component for two reasons that both bite later. The slugs are
 * **published URL fragments** — `#faq-open-source` is a link someone can paste
 * into a bug report — so they are a contract, and a contract belongs in a file
 * with a test asserting it (`faq.test.ts` checks uniqueness and that no answer
 * is empty). And the answers are the part most likely to go stale: a version of
 * this page whose "which agents" answer lags the roster is worse than no answer,
 * and a flat array is what makes that diff readable.
 *
 * **Every answer below is checked against the repo, not written from memory.**
 * Where the honest answer is "we have not said yet" — pricing — it says that.
 * Nothing in this repo's docs states a price or promises a free tier, and a
 * marketing page is the last place to invent one.
 */

export type FaqEntry = {
  /**
   * The URL fragment, deep-linked as `#faq-<slug>`. Stable: changing one breaks
   * every link to it that already exists.
   */
  slug: string;
  /** The tab's label — short enough to read down a column at a glance. */
  question: string;
  /**
   * The panel body. Plain strings, one per paragraph, because the answers are
   * prose and a rich-text pipeline for eight of them is a dependency nobody
   * needs. Links go in `links`.
   */
  answer: readonly string[];
  /** Optional further reading, rendered under the answer. */
  links?: readonly { label: string; href: string }[];
};

/** Where the public artefacts live. This repo is private — never link to it. */
const APPS_REPO = 'https://github.com/bilo-io/midnite-apps';

export const FAQ: readonly FaqEntry[] = [
  {
    slug: 'what-is-it',
    question: 'What is Midnite Studio?',
    answer: [
      'A desktop workspace for the whole loop around a repository, in one window: a commit graph with worktrees nested under the repositories they belong to, your real login shell, an embedded browser, and the forge — pull requests, checks, reviews, project boards — beside them rather than in a browser tab you have to go and find.',
      'It is a git client first. Everything else in the window is there because the work you do around a commit does not happen inside a git client today, and switching applications to do it is the cost the product is trying to remove.',
    ],
  },
  {
    slug: 'platforms',
    question: 'Which platforms does it run on?',
    answer: [
      'macOS on Apple silicon, and only that, today. The published build is an arm64 dmg/zip; the installer refuses anything else rather than downloading a binary that cannot run.',
      'Nothing in the app is macOS-specific by design — it is Electron, and the git layer is the real git CLI — so Intel Macs, Linux and Windows are a build-and-test problem rather than a porting one. There is no date for them.',
    ],
    links: [{ label: 'Read install.sh before you pipe it into sh', href: `${APPS_REPO}/blob/main/midnite-studio/install.sh` }],
  },
  {
    slug: 'agents',
    question: 'Which coding agents does it support?',
    answer: [
      'Ten out of the box: Claude, Antigravity, Codex, Cursor, Copilot, OpenClaude, OpenCode, Kilo Code, Aider and Cline. Each gets a named entry in the agent roster with its own launch command, its resume flags and its own colour, so a pane tells you which agent is in it at a glance.',
      'They are not integrations. Each one is the vendor’s own CLI, running in a real pty against your real login shell, which is why your credentials, config files and any flag the tool grew last week work with no adapter of ours in the way. Adding an eleventh is an edit to a JSON file in the app’s data directory, not a release.',
    ],
  },
  {
    slug: 'terminal',
    question: 'Does it replace my terminal?',
    answer: [
      'No. It hosts one — your login shell, with your PATH, your prompt and your aliases — and it is the same shell whether you open it from the terminal panel, from a kanban card or from an agent launcher. Nothing is emulated and no command is intercepted.',
      'The terminal sessions also outlive the window: they run under a broker process, so reloading the app or closing the window does not kill a build. Keep using your own terminal alongside it if you prefer; a commit you make there shows up in the graph without a refresh, because the UI follows the repository rather than its own cache.',
    ],
  },
  {
    slug: 'loops-and-boards',
    question: 'How do loops and the kanban board actually run agents?',
    answer: [
      'A loop is a named, repeatable agent invocation — Guard, Concepts, Develop, Patrol, Medic, Overhaul — composed from a base prompt plus the run settings you tick before pressing Start: which jobs it does, whether it works in a worktree, whether it may open PRs or only report. Press Start and it spawns the agent in a real terminal session on an interval, and every run is recorded with the exact prompt it carried.',
      'The board is the same mechanism aimed at one card. A card on the project board can own a terminal, so the agent runs against that card’s branch or worktree and the card shows its live state — thinking, waiting on you, or done — while it does. There is no hidden queue, no server doing the work somewhere else, and no prompt you cannot read before it is sent.',
    ],
  },
  {
    slug: 'open-source',
    question: 'Is it open source?',
    answer: [
      'Not today. The application source is in a private repository, so there is nothing public to link you to and no license to read.',
      'Everything you would actually need is public, though, and lives in one repo for every midnite app: the installers, the release notes, the update feed, and the issue tracker. If you want to file a bug or ask for a feature, that is where it goes.',
    ],
    links: [
      { label: 'Releases and downloads', href: `${APPS_REPO}/releases` },
      { label: 'Issues — bugs and feature requests', href: `${APPS_REPO}/issues` },
    ],
  },
  {
    slug: 'updates',
    question: 'How do updates arrive?',
    answer: [
      'From a generic update feed published alongside the builds — a `latest-mac.yml` manifest in the public releases repo, which electron-updater reads directly. Deliberately not GitHub’s own release provider: that repo distributes several apps, and "the latest release" there is whichever app shipped most recently, which would happily hand Midnite Studio a sibling’s update.',
      'Builds are ad-hoc signed rather than notarized today, so re-running the one-line installer is the reliable update path. It installs the newest version over the old one, verifying the new bundle before anything in /Applications is touched and keeping the previous copy until it does.',
    ],
    links: [{ label: 'The install command', href: `${APPS_REPO}/blob/main/midnite-studio/install.sh` }],
  },
  {
    slug: 'pricing',
    question: 'What will it cost?',
    answer: [
      'Not yet announced. There is no price, no tier list and no trial length to tell you about, and rather than invent one for a marketing page: it is not decided.',
      'What is true today is that the build is free to download and install, and that early access costs nothing but the issue you file to ask for it. If you want to be told when that changes, the early-access form below is the list.',
    ],
    links: [{ label: 'Ask for early access', href: '#early-access' }],
  },
];

/** The fragment for one entry — the one place the `faq-` prefix is written. */
export const faqFragment = (slug: string): string => `faq-${slug}`;

/**
 * Which entry a URL fragment selects, or `null` for one that names none.
 *
 * Tolerates a leading `#` because both `location.hash` (which carries one) and a
 * hand-written call site (which usually does not) reach this.
 */
export const faqSlugFromHash = (hash: string): string | null => {
  const bare = hash.replace(/^#/, '');
  if (!bare.startsWith('faq-')) return null;
  const slug = bare.slice('faq-'.length);
  return FAQ.some((entry) => entry.slug === slug) ? slug : null;
};
