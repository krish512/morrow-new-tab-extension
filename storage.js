export const hasExtensionStorage = Boolean(globalThis.chrome?.storage?.local);

export async function readLocal(key, fallback) {
  if (hasExtensionStorage) return (await chrome.storage.local.get(key))[key] ?? fallback;
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw);
}

export async function writeLocal(key, value) {
  if (hasExtensionStorage) await chrome.storage.local.set({ [key]: value });
  else localStorage.setItem(key, JSON.stringify(value));
}
