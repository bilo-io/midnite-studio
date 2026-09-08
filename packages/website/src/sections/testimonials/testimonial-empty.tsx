import { LuGithub, LuMail, LuMessageSquare, LuPlus } from 'react-icons/lu';

import { TESTIMONIALS_IMG_DIR, TESTIMONIALS_PATH } from './testimonial';

/**
 * The schema, as a human reads it — printed on the placeholder card so whoever
 * has the quote in front of them does not have to find a type definition.
 *
 * Kept as a string rather than derived from the type, deliberately: this is
 * documentation aimed at a person editing JSON, and a generated version would
 * either lose the comments or gain a code generator nobody asked for. It sits
 * next to `Testimonial` in `testimonial.ts`, and the test asserts every field
 * name in the type appears here — that is the coupling that matters.
 */
const SCHEMA = `{
  "quote": "…",              // verbatim. Never tidied.
  "name": "…",
  "role": "…",
  "avatar": "img/…",         // optional
  "source": "slack",         // optional: slack | github | email
  "screenshot": "img/…"      // optional
}`;

/**
 * What each of the three cards asks for. Three because that is the width of the
 * finished row — the empty state is the shape of the real one, so the section's
 * proportions are decided before the copy exists rather than after.
 */
const PROMPTS = [
  {
    Icon: LuMessageSquare,
    title: 'A Slack message',
    body: 'Screenshot the message, drop the PNG in the images folder and point `screenshot` at it.',
  },
  {
    Icon: LuGithub,
    title: 'A GitHub comment',
    body: 'Paste the comment as `quote`, set `source` to `github`, and link nothing — the quote stands alone.',
  },
  {
    Icon: LuMail,
    title: 'An email or a DM',
    body: 'Ask first. Then `quote`, `name`, `role`, and `source: "email"`.',
  },
] as const;

/**
 * The section's state until somebody has actually said something.
 *
 * **This is the whole point of the section as shipped.** A marketing page with
 * invented testimonials is a lie about the product, and a marketing page with a
 * "coming soon" ribbon over an empty band tells a visitor nothing and the team
 * nothing either. So the empty state is a *work order*: three dashed cards that
 * name the file to edit, the folder the images go in, and the exact shape of an
 * entry — enough that whoever receives the first kind message can add it
 * without opening a single source file beyond the JSON.
 *
 * It is also unmistakably unfinished, which is the other half. Dashed borders,
 * a plus glyph, an explicit "no quotes yet" line, and the file path in a
 * monospace face: nobody reads this as content, and nobody ships it by accident
 * thinking it is content.
 */
export const TestimonialEmpty = () => (
  <div data-testid="testimonials-empty" className="flex flex-col gap-6">
    <p className="text-sm text-fg-subtle">
      No quotes yet — nothing here is a placeholder for something real, because there is
      nothing real to hold a place for. Add the first one by editing{' '}
      <code className="rounded-sm bg-bg-sunken px-1.5 py-0.5 font-mono text-xs text-accent">
        {TESTIMONIALS_PATH}
      </code>
      .
    </p>

    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PROMPTS.map(({ Icon, title, body }) => (
        <li
          key={title}
          className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong bg-bg-elevated/40 p-6"
        >
          <span className="flex items-center gap-2 text-fg-muted">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{title}</span>
          </span>
          <p className="text-sm leading-relaxed text-fg-subtle">{body}</p>
          <span className="mt-auto flex items-center gap-1.5 pt-2 text-xs font-medium text-accent">
            <LuPlus aria-hidden="true" className="h-3.5 w-3.5" />
            Add a testimonial
          </span>
        </li>
      ))}
    </ul>

    <div className="rounded-lg border border-line bg-bg-sunken p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
        One entry in {TESTIMONIALS_PATH}
      </p>
      <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed text-fg-muted">
        <code>{SCHEMA}</code>
      </pre>
      <p className="mt-3 text-xs text-fg-subtle">
        Image paths are relative to{' '}
        <code className="font-mono text-fg-muted">{TESTIMONIALS_IMG_DIR}</code>&rsquo;s
        parent — write <code className="font-mono text-fg-muted">img/testimonials/ana.png</code>
        , never a leading slash: the deployed site is served under a path prefix. See that
        folder&rsquo;s README.
      </p>
    </div>
  </div>
);
