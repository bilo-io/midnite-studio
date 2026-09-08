import { useCallback, useEffect, useRef, useState } from 'react';
import { LuChevronRight, LuExternalLink } from 'react-icons/lu';

import { Eyebrow, Heading, Lede, Reveal, Section } from '../../components';

import { FAQ, faqFragment, faqSlugFromHash, type FaqEntry } from './faq';

/**
 * The lane colours, one per question, cycling. Borrowed from the commit graph's
 * palette (`--ws-lane-*`) so the FAQ's rail is drawn in the product's own hues
 * rather than in eight shades of the accent.
 */
const LANE_BORDER = ['border-l-lane-1', 'border-l-lane-2', 'border-l-lane-3', 'border-l-lane-4'];
const LANE_TEXT = ['text-lane-1', 'text-lane-2', 'text-lane-3', 'text-lane-4'];

const tabId = (slug: string) => `faq-tab-${slug}`;
const panelId = (slug: string) => `faq-panel-${slug}`;

/**
 * Where the arrow keys move from `index`, given a key. `null` means "not a key
 * this list handles" — the event is then left alone rather than swallowed, which
 * matters for Tab and for the browser's own find-as-you-type.
 *
 * Wrapping is deliberate: eight items in a loop is how a vertical tablist is
 * expected to behave, and it means Up from the first question lands on the last
 * rather than on nothing.
 */
export const nextFaqIndex = (key: string, index: number, count: number): number | null => {
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
};

const AnswerBody = ({ entry, lane }: { entry: FaqEntry; lane: number }) => (
  <>
    <h3 className={`text-lg font-semibold sm:text-xl ${LANE_TEXT[lane]}`}>{entry.question}</h3>
    <div className="mt-4 space-y-4">
      {entry.answer.map((paragraph) => (
        <p key={paragraph.slice(0, 32)} className="max-w-prose text-sm leading-relaxed text-fg-muted sm:text-base">
          {paragraph}
        </p>
      ))}
    </div>
    {entry.links?.length ? (
      <ul className="mt-6 flex flex-col gap-2 border-t border-line pt-5">
        {entry.links.map((link) => {
          const external = link.href.startsWith('http');
          return (
            <li key={link.href}>
              <a
                href={link.href}
                {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="inline-flex items-center gap-2 text-sm text-accent underline decoration-dotted underline-offset-4 transition duration-fast hover:decoration-solid"
              >
                {link.label}
                {external ? <LuExternalLink aria-hidden="true" className="shrink-0" /> : null}
              </a>
            </li>
          );
        })}
      </ul>
    ) : null}
  </>
);

/**
 * The FAQ: a sticky list of questions on the left, one answer panel on the
 * right that cross-fades between them.
 *
 * **Why not an accordion.** Eight disclosure rows means eight chances to push
 * the rest of the page down, the reader loses their place every time they open
 * one, and comparing two answers is impossible without scrolling. A tablist
 * keeps every question visible and on screen while the answer changes beside
 * it, and the questions are the part a visitor scans — they are looking for
 * theirs, not reading all eight.
 *
 * **How the cross-fade is done, and why it is not `key`-remounting.** Every
 * panel is rendered, all of them stacked into the *same* CSS grid cell
 * (`gridArea: '1 / 1'`). The grid therefore sizes itself to the tallest answer
 * once, so switching questions never moves anything — and both the outgoing and
 * incoming panel are on screen during the transition, which is what makes it a
 * cross-fade rather than a flicker. Each panel carries the card styling and
 * `align-self: start`, rather than the grid carrying it: the reserved height is
 * still the tallest answer's, but the *visible* card hugs the answer in it, so
 * a short answer does not sit in a box with 300px of nothing under it. The unselected ones carry
 * `visibility: hidden`, not `display: none`: visibility removes them from the
 * accessibility tree and the tab order (so their links are not reachable) while
 * still being transitionable, which `display` is not.
 *
 * Reduced motion needs no branch here. There is no JS animation to gate — the
 * fade is one CSS transition on the duration tokens, and `tokens.css` zeroes
 * those under `prefers-reduced-motion`, so the swap simply lands instantly.
 *
 * **Deep links.** `#faq-<slug>` selects a question on load and on
 * `hashchange`, and selecting one rewrites the fragment with `replaceState` —
 * so the address bar is always copyable, without eight history entries
 * accumulating behind the Back button or the browser re-scrolling the page to
 * an anchor it thinks it has just been sent to.
 */
export const Faq = () => {
  const [selected, setSelected] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const fromHash = faqSlugFromHash(window.location.hash);
      if (fromHash) return fromHash;
    }
    return FAQ[0]!.slug;
  });

  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const onHashChange = () => {
      const slug = faqSlugFromHash(window.location.hash);
      if (slug) setSelected(slug);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /**
   * Select by index, move focus with it, and record it in the URL.
   *
   * Focus follows selection because that is the automatic-activation tablist
   * pattern: with one panel and no expensive content behind it, making the
   * reader press Enter after every arrow key is ceremony. `replaceState` is
   * wrapped because a `file://` document and some embedded contexts throw on
   * it, and a FAQ that cannot be deep-linked is still a working FAQ.
   */
  const select = useCallback((index: number, moveFocus: boolean) => {
    const entry = FAQ[index];
    if (!entry) return;
    setSelected(entry.slug);
    if (moveFocus) tabRefs.current.get(entry.slug)?.focus();
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      try {
        window.history.replaceState(null, '', `#${faqFragment(entry.slug)}`);
      } catch {
        /* Deep-linking is a nicety; losing it must not break selection. */
      }
    }
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextFaqIndex(event.key, index, FAQ.length);
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  };

  return (
    <Section id="faq" label="FAQ">
      <div className="flex flex-col gap-4">
        <Eyebrow>Questions</Eyebrow>
        <Heading level={2} typeIn>
          The honest answers
        </Heading>
        <Lede typeIn>
          Including the ones with no good news in them — what it does not run on, what is not
          open source, and what has not been decided yet.
        </Lede>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
        {/*
          The question list. Sticky from `lg` up, where there is room beside the
          panel for it to stay put; below that it is an ordinary block above the
          answer, because a sticky sidebar on a phone is just a thing covering
          the content.
        */}
        <div
          role="tablist"
          aria-label="Frequently asked questions"
          aria-orientation="vertical"
          data-testid="faq-tablist"
          className="flex flex-col gap-1.5 self-start lg:sticky lg:top-24"
        >
          {FAQ.map((entry, index) => {
            const isSelected = entry.slug === selected;
            const lane = index % LANE_BORDER.length;
            return (
              <button
                key={entry.slug}
                ref={(node) => {
                  if (node) tabRefs.current.set(entry.slug, node);
                  else tabRefs.current.delete(entry.slug);
                }}
                type="button"
                role="tab"
                id={tabId(entry.slug)}
                aria-selected={isSelected}
                aria-controls={panelId(entry.slug)}
                /* One stop for the whole list: Tab enters at the selected
                   question and leaves, and the arrows move within it. */
                tabIndex={isSelected ? 0 : -1}
                data-testid={`faq-tab-${entry.slug}`}
                onClick={() => select(index, false)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={[
                  'group flex items-center justify-between gap-3 rounded-md border-l-2 px-4 py-3 text-left text-sm transition duration-base',
                  isSelected
                    ? `bg-bg-elevated text-fg shadow-glow-soft ${LANE_BORDER[lane]}`
                    : 'border-l-transparent text-fg-muted hover:bg-bg-elevated/60 hover:text-fg',
                ].join(' ')}
              >
                <span className="font-medium">{entry.question}</span>
                <LuChevronRight
                  aria-hidden="true"
                  className={`shrink-0 transition duration-base ${
                    isSelected ? `translate-x-0 opacity-100 ${LANE_TEXT[lane]}` : '-translate-x-1 opacity-0'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/*
          The answer stack. `display: grid` with every panel in cell 1/1 — see
          the component note: this is what makes the box the height of the
          tallest answer, so nothing on the page moves when the reader switches
          questions, and what lets two panels overlap for the length of a fade.
        */}
        <Reveal>
          <div className="grid">
            {FAQ.map((entry, index) => {
              const isSelected = entry.slug === selected;
              return (
                <div
                  key={entry.slug}
                  role="tabpanel"
                  id={panelId(entry.slug)}
                  aria-labelledby={tabId(entry.slug)}
                  data-testid={`faq-panel-${entry.slug}`}
                  data-selected={isSelected}
                  /* Focusable so a keyboard reader can Tab from the question
                     list straight into the prose it just selected. */
                  tabIndex={isSelected ? 0 : -1}
                  className="rounded-lg bg-bg-elevated p-6 shadow-glow-soft sm:p-8"
                  style={{
                    gridArea: '1 / 1',
                    /* `start`, so the card is the height of *its own* answer.
                       The grid still reserves the tallest one — nothing on the
                       page moves when the reader switches — but the slack shows
                       as page background rather than as an empty card with 300px
                       of nothing under the last paragraph. */
                    alignSelf: 'start',
                    opacity: isSelected ? 1 : 0,
                    visibility: isSelected ? 'visible' : 'hidden',
                    transition:
                      'opacity var(--ws-dur-slow) var(--ws-ease), visibility var(--ws-dur-slow) var(--ws-ease)',
                  }}
                >
                  <AnswerBody entry={entry} lane={index % LANE_TEXT.length} />
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </Section>
  );
};
