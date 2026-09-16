export const YOUTUBE = { name: 'YouTube', url: 'https://www.youtube.com/' };

export function isYouTube(url) {
  try { return /^(www\.|m\.)?youtube\.com$/i.test(new URL(url).hostname); }
  catch { return false; }
}

export function withYouTube(links) {
  return [YOUTUBE, ...links.filter(link => !isYouTube(link.url))];
}

export function displayName(hostname) {
  return hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ').replace(/^\w/, letter => letter.toUpperCase());
}

export async function recentFavouriteDomains(historyApi, now = Date.now()) {
  if (!historyApi?.search || !historyApi?.getVisits) return [];
  const since = now - 30 * 24 * 60 * 60 * 1000;
  // Zero asks Chromium for all matching URLs, rather than its 100-result default.
  const items = await historyApi.search({ text: '', startTime: since, endTime: now, maxResults: 0 });
  const candidates = items.filter(item => {
    try {
      const url = new URL(item.url);
      return ['https:', 'http:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname);
    } catch { return false; }
  });
  const scores = new Map();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(12, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const item = candidates[cursor++];
      try {
        const visits = await historyApi.getVisits({ url: item.url });
        const count = visits.filter(visit => visit.visitTime >= since && visit.visitTime <= now &&
          !['auto_subframe', 'manual_subframe'].includes(visit.transition)).length;
        if (!count) continue;
        const host = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase();
        const current = scores.get(host) || { count: 0, latest: 0 };
        current.count += count;
        current.latest = Math.max(current.latest, item.lastVisitTime || 0);
        scores.set(host, current);
      } catch { /* An individual history entry may have disappeared. */ }
    }
  });
  await Promise.all(workers);
  return [...scores.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([host]) => ({ name: displayName(host), url: `https://${host}/` }));
}
