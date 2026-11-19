export async function openBrowserAsync(url: string, options?: unknown) {
  return openBrowserAsyncRecorded(url, options);
}
export async function openAuthSessionAsync(_url: string) {
  return { type: 'cancel' as const };
}

// Theme J
export const WebBrowserPresentationStyle = { FULL_SCREEN: 'fullScreen' } as const;
export const openedBrowsers: { url: string; options: unknown }[] = [];
let nextOpenFails = false;
/** Make the next `openBrowserAsync` reject once, as when no browser can be presented. */
export function failNextOpen() {
  nextOpenFails = true;
}
export async function openBrowserAsyncRecorded(url: string, options?: unknown) {
  openedBrowsers.push({ url, options });
  if (nextOpenFails) {
    nextOpenFails = false;
    throw new Error('no browser');
  }
  return { type: 'opened' as const };
}
