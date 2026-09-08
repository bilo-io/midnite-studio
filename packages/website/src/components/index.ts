/**
 * The site's shared vocabulary — one import site for every wave-2 section.
 *
 * Anything a section needs to look like the rest of the page belongs here. If
 * a wave-2 section reaches for a raw hex, a hand-rolled observer or its own
 * button, something is missing from this barrel and should be added to it
 * rather than worked around locally.
 */
export { Button } from './button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './button';
export { Container } from './container';
export type { ContainerProps } from './container';
export { GlowCard } from './glow-card';
export type { GlowCardProps, GlowVariant } from './glow-card';
export { Logo } from './logo';
export type { LogoProps } from './logo';
export { Reveal } from './reveal';
export type { RevealProps } from './reveal';
export { Section } from './section';
export type { SectionProps } from './section';
export { Eyebrow, Heading, Lede } from './text';
export type { EyebrowProps, HeadingProps, LedeProps } from './text';
export {
  DELETE_MS,
  GAP_MS,
  HOLD_MS,
  nextTypedChangeAt,
  TYPE_MS,
  Typewriter,
  TypewriterCaret,
  typedLength,
} from './typewriter';
export type { TypedPassOptions, TypewriterCaretProps, TypewriterProps } from './typewriter';
export { Wordmark } from './wordmark';
export type { WordmarkProps, WordmarkTone } from './wordmark';
export { useInView } from '../hooks/use-in-view';
export type { UseInView, UseInViewOptions } from '../hooks/use-in-view';
export { useReducedMotion } from '../hooks/use-reduced-motion';
