import type { ReactNode } from 'react';

import { useInView } from '../hooks/use-in-view';

export type RevealProps = {
  children: ReactNode;
  /** Stagger, in ms, for a row of siblings. Applied as a transition delay. */
  delay?: number;
  className?: string;
};

/**
 * Fades its child up as it scrolls into view, once.
 *
 * A thin wrapper over `useInView` plus the `.ws-reveal` utilities, so a section
 * does not have to wire an observer to get the site's one entrance. Reduced
 * motion needs no branch here: `tokens.css` zeroes the duration tokens, so the
 * class swap lands instantly and the content simply appears.
 *
 * The delay rides on `transitionDelay` rather than an animation delay, because
 * the resting state is the hidden one — there is no keyframe whose backwards
 * fill could flash the element at full opacity while it waits.
 */
export const Reveal = ({ children, delay = 0, className = '' }: RevealProps) => {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`ws-reveal ${inView ? 'ws-reveal-in' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};
