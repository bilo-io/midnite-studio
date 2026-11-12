import type { IconType } from 'react-icons';

/** A rail view's empty state — centred glyph, heading and one line of body. Themes C-F fill the real views. */
export function EmptyView({ id, icon: Icon, title, body }: { id: string; icon: IconType; title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid={`${id}-empty`}>
      <Icon size={48} className="text-[#f43f5e]" aria-hidden />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm opacity-70">{body}</p>
    </div>
  );
}
