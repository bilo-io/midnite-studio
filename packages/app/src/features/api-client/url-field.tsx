import { useRef, useState } from 'react';

/**
 * The `{{var}}`-highlighted URL field (Phase 66 Theme D). Not a Monaco
 * instance — the phase doc is explicit that one editor per open tab's URL
 * field is a real cost for a field with no language, given Monaco's smallest
 * useful height. Instead: a plain `<input>` laid over a `<div aria-hidden>`
 * mirror that re-renders the same text with `<mark>` spans, scroll-synced on
 * `onScroll` — the mirror's own text is transparent, so only its `<mark>`
 * backgrounds show through behind the input's real, visible text.
 */

type Token = { text: string; isVar: boolean; name?: string };

const TOKEN_RE = /\{\{([^{}]*)\}\}/g;

function tokenize(value: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: value.slice(lastIndex, index), isVar: false });
    tokens.push({ text: match[0], isVar: true, name: match[1] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) tokens.push({ text: value.slice(lastIndex), isVar: false });
  return tokens;
}

export function UrlField({
  value,
  onChange,
  onBlur,
  variableNames,
  placeholder = 'https://api.example.com/{{path}}',
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** The collection's own `variable[]` keys — a token not in this set gets a warning tone. */
  variableNames: ReadonlySet<string>;
  placeholder?: string;
}) {
  const [scrollLeft, setScrollLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokens = tokenize(value);

  return (
    <div className="relative h-7 min-w-0 flex-1 rounded-md border border-border bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-2 font-mono text-xs"
      >
        <span style={{ transform: `translateX(-${scrollLeft}px)`, display: 'inline-flex' }}>
          {tokens.map((token, index) =>
            token.isVar ? (
              <mark
                key={index}
                title={
                  token.name && !variableNames.has(token.name)
                    ? `No collection variable named ${token.name}`
                    : undefined
                }
                className={`rounded text-transparent ${
                  token.name && !variableNames.has(token.name) ? 'bg-amber-500/40' : 'bg-primary/25'
                }`}
              >
                {token.text}
              </mark>
            ) : (
              <span key={index} className="text-transparent">
                {token.text}
              </span>
            ),
          )}
        </span>
      </div>
      <input
        ref={inputRef}
        aria-label="URL"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        placeholder={placeholder}
        className="absolute inset-0 h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 font-mono text-xs"
      />
    </div>
  );
}
