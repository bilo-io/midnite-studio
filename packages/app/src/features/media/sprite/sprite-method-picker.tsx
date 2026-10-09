import type { SpriteMethod } from '@midnite/studio-shared';
import { useRef } from 'react';
import { LuBox, LuPencil } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';

type Card = Exclude<SpriteMethod, 'one-shot'>;

const CARDS: ReadonlyArray<{ id: Card; label: string; icon: IconComponent; hint: string }> = [
  { id: 'hand-drawn', label: 'Hand-drawn', icon: LuPencil, hint: 'Frame by frame from a locked reference character.' },
  { id: 'rendered', label: 'Rendered from 3D', icon: LuBox, hint: 'A rigged Models character, rendered from 1, 4 or 8 directions.' },
];

/**
 * The three ways to make a sheet. The form *recommends* one of the first two (a badge and a one-line
 * reason, from `recommendSpriteMethod`); **one-shot** is never recommended and is only ever the
 * checkbox beneath them. Ticking it switches the method and dims the cards; unticking restores the
 * card that was selected before.
 */
export function SpriteMethodPicker({
  method,
  onMethod,
  recommended,
}: {
  method: SpriteMethod;
  onMethod: (method: SpriteMethod) => void;
  recommended: { method: Card; reason: string };
}) {
  const oneShot = method === 'one-shot';
  // The card to come back to when one-shot is unticked.
  const lastCard = useRef<Card>(recommended.method);
  if (!oneShot) lastCard.current = method;
  const selected: Card = oneShot ? lastCard.current : method;

  const move = (event: React.KeyboardEvent, index: number) => {
    if (oneShot) return;
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = CARDS[(index + step + CARDS.length) % CARDS.length]!;
    onMethod(next.id);
    (event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[(index + step + CARDS.length) % CARDS.length])?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Method" className={`grid grid-cols-2 gap-2 ${oneShot ? 'opacity-50' : ''}`}>
        {CARDS.map((card, index) => {
          const active = selected === card.id;
          const isRecommended = recommended.method === card.id;
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={oneShot}
              tabIndex={active ? 0 : -1}
              onClick={() => onMethod(card.id)}
              onKeyDown={(event) => move(event, index)}
              className={`flex flex-col gap-1 rounded-md border p-2 text-left transition-colors ${
                active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                {card.label}
              </span>
              {isRecommended ? (
                <span data-testid="method-recommended" className="w-fit rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  Recommended
                </span>
              ) : null}
              <span className="text-[11px] text-muted-foreground">{isRecommended ? recommended.reason : card.hint}</span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={oneShot}
          onChange={(event) => onMethod(event.target.checked ? 'one-shot' : lastCard.current)}
          className="accent-[hsl(var(--primary))]"
        />
        Try generating the whole sheet in one image
      </label>
    </div>
  );
}
