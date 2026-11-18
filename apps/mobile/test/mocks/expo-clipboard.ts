let text = '';
export async function setStringAsync(value: string) {
  text = value;
  return true;
}
export async function getStringAsync() {
  return text;
}
