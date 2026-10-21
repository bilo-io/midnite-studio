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

export const FAQ: readonly FaqEntry[] = [
  {
    slug: 'what-is-it',
    question: 'What is Midnite Apps?',
    answer: [
      'The launcher for the midnite suite: one desktop app that lists, installs, updates and opens every midnite app. Coder for the loop around a repository, Agents for every agent CLI you use, Gamer, Creator, Media, Money and Mind for the rest of the day, and four small utilities (Cleaner, Vault, Capture and Monitor) for the machine underneath.',
      'Every app is built on the same frame, so the things you reach for constantly come with each of them: a terminal that survives restarts, a docked browser, the companion, recurring agent loops, and the commit graph for any repo you open.',
    ],
  },
  {
    slug: 'apps-and-studio',
    question: 'How do the apps relate to Midnite Studio?',
    answer: [
      'Midnite Studio is the superset: every app beside every other one, in one window with one rail. Today it is also what the others run inside. Opening Coder from the launcher opens Studio on Coder, so installing the launcher and Studio gives you the whole suite.',
      'As each app ships as its own bundle, the launcher installs that one instead, and nothing about its tile changes for you. Studio stays, for anyone who would rather have all of it at once.',
    ],
  },
  {
    slug: 'platforms',
    question: 'Which platforms does it run on?',
    answer: [
      'macOS on Apple silicon, and only that, today. The builds are arm64; the installer refuses anything else rather than downloading a binary that cannot run.',
      'Nothing in the apps is macOS-specific by design: they are Electron, and the git layer is the real git CLI, so Intel Macs, Linux and Windows are a build-and-test problem rather than a porting one. There is no date for them.',
    ],
  },
  {
    slug: 'agents',
    question: 'Which coding agents does it support?',
    answer: [
      'Ten out of the box: Claude, Antigravity, Codex, Cursor, Copilot, OpenClaude, OpenCode, Kilo Code, Aider and Cline. Each gets a named entry in the agent roster with its own launch command, its resume flags and its own colour, so a pane tells you which agent is in it at a glance.',
      'They are not integrations. Each one is the vendor’s own CLI, running in a real pty against your real login shell, which is why your credentials, config files and any flag the tool grew last week work with no adapter of ours in the way.',
    ],
  },
  {
    slug: 'privacy',
    question: 'Does anything leave my Mac?',
    answer: [
      'There is no analytics, no telemetry and no crash reporting: when something crashes, the record stays on your disk. The launcher checks for updates and for the list of apps, and a few features fetch public data when they show it, such as the weather in the title bar or market prices in Money.',
      'Everything you make stays where you put it: notes, chats, documents and media are files on your disk, not rows in our cloud, because there is no cloud of ours to put them in. Keys and logins you save are encrypted with a key held in the macOS Keychain.',
    ],
  },
  {
    slug: 'updates',
    question: 'How do updates arrive?',
    answer: [
      'Through the launcher. It reads a small update feed for each app, downloads the new build, checks it against the release’s published SHA-256 checksum, and only then swaps it into /Applications, keeping the previous copy until the new one verifies.',
      'The feeds are per app on purpose, so one app is never handed a sibling’s update.',
    ],
  },
  {
    slug: 'open-source',
    question: 'Is it open source?',
    answer: [
      'Not today: the apps are not published under an open-source licence.',
      'Access is by invitation for now. If you want to report a bug or ask for a feature, say so when you request early access and it will find its way to us.',
    ],
    links: [{ label: 'Ask for early access', href: '#early-access' }],
  },
  {
    slug: 'pricing',
    question: 'What will it cost?',
    answer: [
      'Three tiers. Starter is free for public repositories, forever. Pro is $6 a month (or $60 a year, ~17% less) and unlocks private repositories, the one paid boundary in the product. Max is $10 per seat a month (or $100 per seat a year), for a team that wants multiple seats and shared billing.',
      'The launcher and the apps are free to install regardless of tier, and early access costs nothing but the request you send to ask for it.',
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
 * hand-written call site (which usually does not) reach this. `entries`
 * defaults to the landing page's own `FAQ` so every existing call site
 * (including this file's own use elsewhere) is unaffected; `faq-section.tsx`
 * passes its own list for a page — like pricing — that renders a different
 * one.
 */
export const faqSlugFromHash = (hash: string, entries: readonly FaqEntry[] = FAQ): string | null => {
  const bare = hash.replace(/^#/, '');
  if (!bare.startsWith('faq-')) return null;
  const slug = bare.slice('faq-'.length);
  return entries.some((entry) => entry.slug === slug) ? slug : null;
};
