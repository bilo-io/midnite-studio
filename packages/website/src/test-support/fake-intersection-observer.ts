import { act } from '@testing-library/react';

/**
 * A stand-in for the browser's `IntersectionObserver`, for the scroll-spy tests.
 *
 * jsdom does not implement it, and even if it did there would be no layout to
 * intersect — so the only way to test `useActiveSection` is to *be* the browser:
 * install this, then hand the hook the entries a real observer would have
 * delivered. Every instance is recorded, so a test can also assert on the
 * options it was constructed with, which is where the band lives.
 *
 * It lives outside a `.test.tsx` file because two suites need it — the hook's
 * own and `site-nav`'s — and `vitest.config.ts` only collects `*.test.{ts,tsx}`,
 * so nothing here is mistaken for a suite with no assertions in it.
 */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly rootMargin: string;
  readonly threshold: number | number[] | undefined;
  readonly targets: Element[] = [];
  disconnected = false;

  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '';
    this.threshold = options?.threshold;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve(target: Element) {
    const at = this.targets.indexOf(target);
    if (at >= 0) this.targets.splice(at, 1);
  }

  disconnect() {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Deliver a change set, exactly as the browser would: only what changed. */
  emit(changes: readonly { id: string; isIntersecting: boolean }[]) {
    const entries = changes.map((change) => {
      const target = document.getElementById(change.id);
      if (target === null) throw new Error(`no element #${change.id} to intersect`);
      /*
        Two of the entry's twelve fields, because two are all the hook reads.
        Through `unknown`, since a partial entry does not structurally overlap
        the real interface — filling in `intersectionRect` and friends would be
        ten lines of numbers no assertion depends on.
      */
      return { target, isIntersecting: change.isIntersecting } as unknown as IntersectionObserverEntry;
    });
    act(() => {
      this.callback(entries, this as unknown as IntersectionObserver);
    });
  }
}

/** The instance the component under test is currently driving. */
export const latestObserver = (): FakeIntersectionObserver => {
  const observer = FakeIntersectionObserver.instances.at(-1);
  if (observer === undefined) throw new Error('no IntersectionObserver was constructed');
  return observer;
};

const realRect = Element.prototype.getBoundingClientRect;

/**
 * Install the fake, a fixed `innerHeight`, and a `getBoundingClientRect` that
 * answers from `tops` — the hook's fallback rule compares a section's top edge
 * against the viewport midline, and in jsdom every real rect is zero.
 *
 * `innerHeight` is pinned rather than taken from jsdom's default so the midline
 * a test reasons about is not a property of the runner's window size.
 */
export const installFakeIntersectionObserver = (
  tops: Record<string, number> = {},
  innerHeight = 1000,
) => {
  FakeIntersectionObserver.instances = [];
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element) {
      return { top: tops[this.id] ?? Number.POSITIVE_INFINITY } as DOMRect;
    },
  });
  for (const scope of [window, globalThis]) {
    Object.defineProperty(scope, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: FakeIntersectionObserver,
    });
  }
};

/** Undo `installFakeIntersectionObserver`'s rect override. */
export const restoreRects = () => {
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: realRect,
  });
};
