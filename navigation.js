// Search terms stay with the selected engine; recognizable web addresses open directly.
export function searchDestination(rawValue, engineUrl) {
  const value = rawValue.trim();
  if (!value) return null;
  const localHost = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value);
  const domain = /^(?:[a-z\d-]+\.)+[a-z\d-]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value);
  const explicitWebUrl = /^https?:\/\//i.test(value);
  if (!/\s/.test(value) && (localHost || domain || explicitWebUrl)) {
    try {
      const prefix = explicitWebUrl ? '' : localHost ? 'http://' : 'https://';
      const url = new URL(`${prefix}${value}`);
      if (['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password) return url.href;
    } catch { /* Invalid addresses can still be searched. */ }
  }
  return `${engineUrl}${encodeURIComponent(value)}`;
}
