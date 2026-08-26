import type { Remote } from '@midnite/git-shared';
import { forgeIssueUrl, pickForgeRemote } from '@midnite/git-shared';
import { useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ExternalLink } from '../markdown/external-link';
import { LinkedText } from './linked-text';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { rehypeLinkify, SHA_ATTR, type LinkifyOptions } from './linkify-rehype';
import { splitTrailers, type Trailer } from './parse-trailers';

/**
 * A commit message, rendered.
 *
 * Two passes, in this order: markdown first (`react-markdown` + `remark-gfm`),
 * then a rehype plugin that linkifies references in the resulting text nodes.
 * Doing it the other way round would mean linkifying markdown *source*, where a
 * sha inside a fenced block is indistinguishable from one in a sentence.
 *
 * **No `rehype-raw`, deliberately.** A commit message arrives in a clone and is
 * attacker-authored text; allowing raw HTML through would make sanitisation this
 * component's problem. Leaving it inert as text removes the problem instead of
 * solving it — and a commit message containing literal `<div>` is far more often
 * a quoted code sample than an intended element.
 */
export function CommitMessage({
  body,
  remotes,
  onSelectSha,
}: {
  /** `%B` — the whole message, subject included. */
  body: string;
  /** Used only to resolve `#123`; an empty list means those stay plain text. */
  remotes: readonly Remote[];
  /** Called with the matched hex when a linkified sha is activated. */
  onSelectSha: (rev: string) => void;
}) {
  const { body: prose, trailers } = useMemo(() => splitTrailers(body), [body]);

  /**
   * Where `#123` points.
   *
   * Recomputed only when the remotes change, because it is handed to the rehype
   * plugin: a new function identity on every render would rebuild the plugin,
   * and with it the whole message tree, on each keystroke elsewhere in the app.
   */
  const issueUrl = useMemo(() => {
    const forge = pickForgeRemote(remotes)?.forge ?? null;
    if (forge === null) return undefined;
    return (issue: number) => forgeIssueUrl(forge, issue);
  }, [remotes]);

  // Annotated as a mutable tuple array: inferred, the inner array widens to a
  // union element type and unified's `Pluggable` only accepts `[plugin, ...args]`.
  /**
   * Memoised, because react-markdown keys its element mapping by component
   * IDENTITY. Building `shaButton(onSelectSha)` inline hands it a new component
   * type on every render, so React unmounts and remounts every sha button —
   * which drops keyboard focus to `<body>` the moment anything else in the panel
   * re-renders.
   */
  const components = useMemo(
    () => ({ a: MessageLink, button: shaButton(onSelectSha) }),
    [onSelectSha],
  );

  const plugins = useMemo(
    (): [typeof rehypeLinkify, LinkifyOptions][] => [[rehypeLinkify, { issueUrl }]],
    [issueUrl],
  );

  return (
    <div data-selectable data-testid="commit-message">
      {prose.length > 0 ? (
        <div className={`max-w-none text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}>
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={plugins}
            components={components}
          >
            {prose}
          </Markdown>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">No commit message.</p>
      )}

      {trailers.length > 0 ? <TrailerList trailers={trailers} /> : null}
    </div>
  );
}

/** Every anchor in a message — from markdown, from gfm autolinking, or from us. */
const MessageLink = ({ children, href }: { children?: ReactNode; href?: string }) => (
  <ExternalLink href={href}>{children}</ExternalLink>
);

/**
 * The control a linkified sha becomes.
 *
 * A `<button>`, not an `<a>`: activating it selects a commit *inside* the app.
 * An anchor would need a fake href to be focusable, and a real one would be a
 * navigation waiting to happen — see the note in `external-link.tsx` about what
 * a same-window navigation costs in a `file://` SPA.
 *
 * Curried so the handler is captured without giving react-markdown a new
 * component identity per render.
 */
const shaButton =
  (onSelectSha: (rev: string) => void) =>
  (props: ComponentPropsWithoutRef<'button'>) => {
    // Read through a record cast because `data-*` is not on the intrinsic props
    // type; react-markdown passes hast properties through verbatim, so the
    // attribute the plugin set is here even though TS cannot see it.
    const rev = (props as Record<string, unknown>)[SHA_ATTR];
    if (typeof rev !== 'string') return <>{props.children}</>;

    return (
      <button
        type="button"
        title={`Show commit ${rev}`}
        onClick={() => onSelectSha(rev)}
        className="rounded bg-muted px-1 font-mono text-xs text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        {props.children}
      </button>
    );
  };

/**
 * The trailer block as metadata rather than prose.
 *
 * A definition list, because that is what it is: each row is a key and a value,
 * and a screen reader announcing "Co-Authored-By, Claude" is the correct reading
 * of a line that as prose announces as a sentence fragment.
 */
function TrailerList({ trailers }: { trailers: Trailer[] }) {
  return (
    <dl
      className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground"
      data-testid="commit-trailers"
    >
      {trailers.map((trailer, index) => (
        // Keyed by index as well as name: `Co-Authored-By` legitimately repeats,
        // and a duplicate key silently drops every occurrence after the first.
        <div key={`${trailer.key}-${index}`} className="col-span-2 grid grid-cols-subgrid">
          <dt className="font-medium">{trailer.key}</dt>
          <dd className="min-w-0 break-words">
            {/* Linkified without a markdown pass: `<s@example.com>` is an
                address in angle brackets, which markdown reads as a tag. */}
            <LinkedText text={trailer.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
