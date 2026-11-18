export const store = new Map<string, string>();
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';
export const optionsByKey = new Map<string, unknown>();
export async function getItemAsync(key: string) {
  return store.get(key) ?? null;
}
export async function setItemAsync(key: string, value: string, options?: unknown) {
  optionsByKey.set(key, options);
  store.set(key, value);
}
export async function deleteItemAsync(key: string) {
  store.delete(key);
}
