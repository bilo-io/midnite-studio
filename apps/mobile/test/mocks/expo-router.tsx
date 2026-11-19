import type { ReactNode } from 'react';

export function Slot({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function useRouter() {
  return { push() {}, replace() {}, back() {} };
}
export function Link({ children }: { children?: ReactNode; href?: string }) {
  return <>{children}</>;
}
export function Redirect({ href }: { href: string }) {
  return <>{`redirect:${href}`}</>;
}
export function useSegments(): string[] {
  return [];
}
