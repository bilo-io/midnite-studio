import { LuAlignCenter, LuMaximize2, LuMoveHorizontal } from 'react-icons/lu';

import type { IconComponent } from '@midnite/studio-frame';
import type { ChatWidthMode } from '@midnite/studio-shared';

import { IconButton } from './ui';

/**
 * The thread's width switch — three pressed-state icon buttons in one group,
 * the same shape the diff toolbar's layout toggles take. Each button's label
 * is its tooltip (that is what `IconButton`'s `label` is), and `aria-pressed`
 * carries the choice for a screen reader and the test alike.
 */

const OPTIONS: readonly { id: ChatWidthMode; label: string; icon: IconComponent }[] = [
  { id: 'default', label: 'Default width', icon: LuAlignCenter },
  { id: 'wider', label: 'Wider thread', icon: LuMoveHorizontal },
  { id: 'full', label: 'Full width', icon: LuMaximize2 },
];

export function ChatWidthToggle({ mode, onChange, className = '' }: { mode: ChatWidthMode; onChange: (mode: ChatWidthMode) => void; className?: string }) {
  return (
    <div role="group" aria-label="Thread width" data-testid="chat-width-toggle" className={`flex shrink-0 items-center rounded-md border border-border p-0.5 ${className}`}>
      {OPTIONS.map((option) => {
        const pressed = option.id === mode;
        return (
          <IconButton
            key={option.id}
            icon={option.icon}
            label={option.label}
            size="sm"
            aria-pressed={pressed}
            data-testid={`chat-width-${option.id}`}
            className={pressed ? 'bg-accent text-foreground' : ''}
            onClick={() => {
              if (!pressed) onChange(option.id);
            }}
          />
        );
      })}
    </div>
  );
}
