import test from 'node:test';
import assert from 'node:assert/strict';
import { recentFavouriteDomains } from '../history.js';

test('top domains count actual visits within the last 30 days, not lifetime counts', async () => {
  const now = Date.UTC(2026, 8, 16);
  const day = 86400000;
  const entries = [
    'https://alpha.test/a', 'https://www.alpha.test/b',
    'https://beta.test/a', 'https://gamma.test/a', 'chrome://settings',
    'http://localhost:3000/', 'https://old.test/'
  ];
  const visits = {
    'https://alpha.test/a': [now - day, now - 40 * day],
    'https://www.alpha.test/b': [now - 2 * day, now - day],
    'https://beta.test/a': [now - day],
    'https://gamma.test/a': [now - 3 * day, now - 3 * day, now - 3 * day, now - 3 * day],
    'https://old.test/': [now - 40 * day]
  };
  const api = {
    search: async query => {
      assert.equal(query.startTime, now - 30 * day);
      assert.equal(query.maxResults, 0);
      return entries.map(url => ({ url, lastVisitTime: now - day, visitCount: 999 }));
    },
    getVisits: async ({ url }) => (visits[url] || []).map(visitTime => ({ visitTime, transition: 'link' }))
  };
  assert.deepEqual((await recentFavouriteDomains(api, now)).map(link => link.url), [
    'https://gamma.test/', 'https://alpha.test/', 'https://beta.test/'
  ]);
});

test('YouTube is ranked like any other visited domain', async () => {
  const now = Date.UTC(2026, 8, 16);
  const url = 'https://www.youtube.com/watch?v=example';
  const api = {
    search: async () => [{ url, lastVisitTime: now }],
    getVisits: async () => [{ visitTime: now, transition: 'link' }]
  };
  assert.deepEqual(await recentFavouriteDomains(api, now), [{ name: 'Youtube', url: 'https://youtube.com/' }]);
});
