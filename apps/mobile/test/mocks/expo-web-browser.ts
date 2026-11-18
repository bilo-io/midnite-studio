export async function openBrowserAsync(_url: string) {
  return { type: 'opened' as const };
}
export async function openAuthSessionAsync(_url: string) {
  return { type: 'cancel' as const };
}
