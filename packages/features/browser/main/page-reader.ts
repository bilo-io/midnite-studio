import type { AgentTargetFacts, RawPageCapture } from '@midnite/studio-shared';

/**
 * The fixed scripts the agent session runs in a page (Phase 117 Theme G).
 *
 * A browser tab never gets a preload (the phase's first guardrail). These run with
 * `executeJavaScriptInIsolatedWorld`: a world of their own that shares the DOM but not the page's
 * JavaScript globals, so a page cannot monkey-patch `getComputedStyle` or `querySelector` to lie to
 * them. Each script is a fixed string. The only value spliced in is a selector or text from the
 * agent's call, which goes in through `JSON.stringify` and is never evaluated as code. Each returns
 * a plain value and installs nothing.
 */

/** Our world id. 0 is the page's main world; Electron uses 999 for preloads. */
export const AGENT_WORLD_ID = 1170;

/** Cap on what the reader returns before the envelope's own byte cap (it is cut again there). */
const READ_MAX_CHARS = 200_000;

/**
 * Reads the visible text and the text of elements a user cannot see. "Cannot see" means
 * `display: none`, `visibility: hidden`, zero opacity, a near-zero box or font size, clipped,
 * positioned far off-screen, or coloured the same as the background behind it. Those last checks
 * are the carriers in the published Comet and Atlas write-ups.
 */
export const READ_PAGE_SCRIPT = `(() => {
  const MAX = ${READ_MAX_CHARS};
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'HEAD', 'META', 'LINK']);
  const bgOf = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*0\\s*\\)/.test(c)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const hiddenWhy = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return true;
    if (Number(cs.opacity) === 0) return true;
    if (parseFloat(cs.fontSize) < 2) return true;
    if (cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)') return true;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return true;
    if (r.right < -1000 || r.bottom < -1000 || r.left > 100000) return true;
    if (cs.color === bgOf(el)) return true;
    return false;
  };
  const hidden = [];
  let budget = 50;
  const walk = (el, parentHidden) => {
    if (budget <= 0 || SKIP.has(el.tagName)) return;
    const isHidden = parentHidden || hiddenWhy(el);
    let own = '';
    for (const child of el.childNodes) if (child.nodeType === 3) own += child.nodeValue;
    own = own.replace(/\\s+/g, ' ').trim();
    if (isHidden && own.length >= 8 && !parentHidden) {
      hidden.push((el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 2000));
      budget -= 1;
    }
    for (const child of el.children) walk(child, isHidden);
  };
  if (document.body) walk(document.body, false);
  const text = document.body ? document.body.innerText : '';
  return { url: location.href, title: document.title || '', text: text.slice(0, MAX), hidden };
})()`;

/** Facts about one element, for `classifyAgentAction`: is it a password field, does clicking it submit a form. */
export function targetFactsScript(selector: string): string {
  return `((sel) => {
  let el = null;
  try { el = document.querySelector(sel); } catch { return { found: false }; }
  if (!el) return { found: false };
  const tag = el.tagName;
  const type = (el.getAttribute('type') || '').toLowerCase();
  const form = el.form || el.closest('form');
  const isPassword = tag === 'INPUT' && type === 'password';
  const submitsForm = !!form && ((tag === 'BUTTON' && (type === '' || type === 'submit')) || (tag === 'INPUT' && (type === 'submit' || type === 'image')));
  return { found: true, isPassword, submitsForm };
})(${JSON.stringify(selector)})`;
}

export function clickScript(selector: string): string {
  return `((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  el.click();
  return true;
})(${JSON.stringify(selector)})`;
}

export function typeScript(selector: string, text: string, submit: boolean): string {
  return `((sel, text, submit) => {
  const el = document.querySelector(sel);
  if (!el || !('value' in el)) return false;
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (submit && el.form) el.form.requestSubmit();
  return true;
})(${JSON.stringify(selector)}, ${JSON.stringify(text)}, ${submit ? 'true' : 'false'})`;
}

/** How many times `needle` occurs in the visible text, case-insensitive. A count, never the text. */
export function findScript(needle: string): string {
  return `((needle) => {
  const hay = (document.body ? document.body.innerText : '').toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  for (let i = hay.indexOf(n); i !== -1 && count < 10000; i = hay.indexOf(n, i + n.length)) count += 1;
  return count;
})(${JSON.stringify(needle)})`;
}

/** Narrows what the read script returned. Anything malformed becomes an empty capture. */
export function asRawCapture(value: unknown, fallbackUrl: string): RawPageCapture {
  const v = (value ?? {}) as Partial<Record<keyof RawPageCapture, unknown>>;
  return {
    url: typeof v.url === 'string' ? v.url : fallbackUrl,
    title: typeof v.title === 'string' ? v.title : '',
    text: typeof v.text === 'string' ? v.text : '',
    hidden: Array.isArray(v.hidden) ? v.hidden.filter((s): s is string => typeof s === 'string').slice(0, 50) : [],
  };
}

export function asTargetFacts(value: unknown): (AgentTargetFacts & { found: boolean }) | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  return { found: v.found === true, isPassword: v.isPassword === true, submitsForm: v.submitsForm === true };
}
