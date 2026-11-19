import type { ReactNode } from 'react';

export function Slot({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function useRouter() {
  return {
    push: (href: string) => routerCalls.push({ method: 'push', href }),
    navigate: (href: string) => routerCalls.push({ method: 'navigate', href }),
    replace() {},
    back() {},
  };
}
export function Link({ children }: { children?: ReactNode; href?: string }) {
  return <>{children}</>;
}
export function Redirect({ href }: { href: string }) {
  return <>{`redirect:${href}`}</>;
}
// A test sets the current route segments with `setSegments`; the default is a top-level tab.
let segments: string[] = ['(tabs)', 'history'];
export function setSegments(next: string[]) {
  segments = next;
}
export const routerCalls: { method: string; href: string }[] = [];
export function useSegments(): string[] {
  return segments;
}

// Theme H
let params: Record<string, string> = {};
export function setParams(next: Record<string, string>) {
  params = next;
}
export function useLocalSearchParams(): Record<string, string> {
  return params;
}
