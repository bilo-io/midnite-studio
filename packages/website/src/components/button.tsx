import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

type Common = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Rendered before the label, at the label's own size. */
  icon?: ReactNode;
};

export type ButtonProps = Common &
  (
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>)
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>)
  );

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium ' +
  'transition duration-base disabled:cursor-not-allowed disabled:opacity-50';

const SIZES: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

const VARIANTS: Record<ButtonVariant, string> = {
  /*
    A rainbow *fill*, not a rainbow border with a dark middle — the other option
    the brief offered, and the wrong one here.

    This button's job is to be found on top of the hero's video, which is dark,
    moving, and full of the app's own violets and blues. A 1px border around a
    dark fill has almost no figure against that: the border is one pixel of
    colour competing with a whole moving frame behind it, and the label loses
    contrast the moment a light passage of video slides under it. A filled slab
    is unambiguous at any point in the video, gives the label a background that
    does not move, and is the one place on the page allowed to shout.

    `--ws-rainbow-ink` is the label colour, near-black on the dark theme and
    white on the light one, and it clears 4.5:1 against every stop in both — see
    `tokens.css`. `.ws-neon` adds the breath and, through it, the slow rotation
    of the fill.
  */
  primary: 'ws-rainbow-fill ws-neon hover:brightness-110 active:brightness-95',
  ghost:
    'border border-line-strong bg-bg-elevated/60 text-fg hover:border-accent hover:text-accent',
};

/**
 * The site's one button, in two weights.
 *
 * **It renders an `<a>` when given `href` and a `<button>` otherwise**, which is
 * the whole reason it exists rather than a class string: a "Download" that
 * navigates must be a link (middle-click, copy address, keyboard activation all
 * come free), and a "Copy" that runs script must be a button. Getting that
 * wrong is invisible in a screenshot and obvious to anyone not using a mouse,
 * so the element follows from the props and cannot be chosen by accident.
 *
 * `primary` carries the accent glow and there should be at most one per
 * viewport; `ghost` is for everything beside it.
 */
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  ...rest
}: ButtonProps) => {
  const classes = `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
  const body = (
    <>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </>
  );

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorProps } = rest as { href: string } & AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a href={href} className={classes} {...anchorProps}>
        {body}
      </a>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={buttonProps.type ?? 'button'} className={classes} {...buttonProps}>
      {body}
    </button>
  );
};
