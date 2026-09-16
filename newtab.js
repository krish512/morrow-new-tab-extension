import { readLocal, writeLocal, hasExtensionStorage } from './storage.js';
import { initChat } from './chat.js';
import { normalizeEndpoint, testConnection, requestLocalPermission, connectionError } from './ollama.js';
import { recentFavouriteDomains } from './history.js';
import { searchDestination } from './navigation.js';
import { openDialog, closeDialog } from './dialog-motion.js';
import './panels.js';

const YOUTUBE_DEFAULT = { name: 'YouTube', url: 'https://www.youtube.com/' };
const DEFAULTS = {
  name: '', engine: 'google', theme: 'system', use24Hour: false, note: '',
  favouritesSeeded: false,
  links: [YOUTUBE_DEFAULT]
};
const engines = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' }
};
const $ = selector => document.querySelector(selector);
const themeMedia = matchMedia('(prefers-color-scheme: dark)');
let state = structuredClone(DEFAULTS);
let clearedNote = null;
let noteRevision = 0;
let saveQueue = Promise.resolve();
let ready = false;
let statusTimer;
let statusMotion;
let chatController;
let ollamaEndpoint = '';
let linksRevision = 0;

function notify(message) {
  clearTimeout(statusTimer);
  statusMotion?.cancel();
  $('#app-status').textContent = message;
  $('#app-status').hidden = false;
  statusTimer = setTimeout(async () => {
    const status = $('#app-status');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      statusMotion = status.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
      try { await statusMotion.finished; } catch { return; }
    }
    status.hidden = true;
    statusMotion?.cancel();
  }, 6000);
}

function webAddress(value) {
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an http or https website address without a username or password.');
  }
  return url.href;
}

function cleanState(saved = {}) {
  const next = { ...structuredClone(DEFAULTS), ...saved };
  next.name = typeof next.name === 'string' ? next.name.slice(0, 28) : '';
  next.engine = Object.hasOwn(engines, next.engine) ? next.engine : 'google';
  next.theme = ['light', 'dark', 'system'].includes(next.theme) ? next.theme : 'system';
  next.use24Hour = next.use24Hour === true;
  next.note = typeof next.note === 'string' ? next.note.slice(0, 1000) : '';
  next.links = Array.isArray(next.links) ? next.links.filter(link => {
    try { return typeof link.name === 'string' && link.name.trim() && webAddress(link.url); } catch { return false; }
  }).map(link => ({ name: link.name.slice(0, 32), url: webAddress(link.url) })) : DEFAULTS.links;
  next.favouritesSeeded = next.favouritesSeeded === true;
  return next;
}

// Queue writes so a slow save cannot overwrite a later clear/undo action.
function persist(changes) {
  state = { ...state, ...changes };
  const snapshot = structuredClone(state);
  const task = saveQueue.catch(() => {}).then(() => writeLocal('morrow-settings', snapshot));
  saveQueue = task;
  return task;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme === 'system'
    ? (themeMedia.matches ? 'dark' : 'light') : state.theme;
}
function updateTime() {
  const now = new Date();
  $('#date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: !state.use24Hour }).formatToParts(now);
  const clock = $('#clock');
  clock.replaceChildren();
  clock.dateTime = now.toISOString();
  for (const part of parts) {
    if (part.type === 'dayPeriod') {
      const period = document.createElement('span');
      period.className = 'clock-period';
      period.textContent = part.value;
      clock.append(period);
    } else clock.append(document.createTextNode(part.value.trim() ? part.value : ''));
  }
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  $('#greeting').textContent = `Good ${timeOfDay}${state.name ? `, ${state.name}` : ''}.`;
  $('#search-engine').textContent = engines[state.engine].label;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}
function renderLinks(focusIndex) {
  const list = $('#links-list');
  list.replaceChildren();
  $('#link-count').textContent = `${state.links.length} ${state.links.length === 1 ? 'place' : 'places'}`;
  if (!state.links.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-links';
    empty.textContent = 'Add a favourite to make this space yours.';
    list.append(empty);
  }
  state.links.forEach((link, index) => {
    const item = document.createElement('li');
    item.className = 'link-card';
    item.style.setProperty('--item-delay', `${Math.min(index, 6) * 35}ms`);
    const anchor = document.createElement('a');
    anchor.className = 'quick-link';
    anchor.href = link.url;
    anchor.title = `${link.name} · ${new URL(link.url).hostname}`;
    const initial = document.createElement('span');
    initial.className = 'favicon';
    initial.setAttribute('aria-hidden', 'true');
    initial.textContent = [...link.name][0].toUpperCase();
    const image = document.createElement('img');
    image.width = 32;
    image.height = 32;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', () => {
      if (image.naturalWidth >= 8 && image.naturalHeight >= 8) image.style.visibility = 'visible';
      else image.remove();
    });
    image.addEventListener('error', () => {
      if (globalThis.chrome?.runtime?.getURL && !image.dataset.cachedFallback) {
        image.dataset.cachedFallback = 'true';
        const favicon = new URL(chrome.runtime.getURL('/_favicon/'));
        favicon.searchParams.set('pageUrl', link.url);
        favicon.searchParams.set('size', '32');
        image.src = favicon.href;
      } else image.remove();
    });
    image.src = `${new URL(link.url).origin}/favicon.ico`;
    initial.append(image);
    const title = document.createElement('span');
    title.className = 'link-title';
    title.textContent = link.name;
    anchor.append(initial, title);
    item.append(anchor);
    const remove = document.createElement('button');
    remove.className = 'icon-button remove-link';
    remove.type = 'button';
    remove.append(icon('close'));
    remove.setAttribute('aria-label', `Remove ${link.name}`);
    remove.title = `Remove ${link.name}`;
    remove.addEventListener('click', async () => {
      const oldLinks = state.links;
      remove.disabled = true;
      try {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          await item.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' }).finished;
        }
        await persist({ links: state.links.filter((_, i) => i !== index), favouritesSeeded: true });
        linksRevision++;
        renderLinks(Math.min(index, state.links.length - 1));
        notify(`${link.name} removed from favourites.`);
      } catch {
        state.links = oldLinks;
        remove.disabled = false;
        notify('Could not save the change. Please try again.');
      }
    });
    item.append(remove);
    list.append(item);
  });
  if (focusIndex !== undefined) (list.querySelectorAll('.quick-link')[focusIndex] || $('#add-link')).focus();
}
function updateNoteUI() {
  const value = $('#note').value;
  $('#clear-note').disabled = !value.length;
  $('#note-count').textContent = `${value.length.toLocaleString()} / 1,000`;
  $('#undo-note').hidden = clearedNote === null;
}
async function saveNote() {
  const revision = ++noteRevision;
  updateNoteUI();
  $('#save-status').textContent = 'Saving…';
  try {
    await persist({ note: $('#note').value });
    if (revision === noteRevision) $('#save-status').textContent = 'Saved';
  } catch {
    if (revision === noteRevision) $('#save-status').textContent = 'Could not save';
    notify('Your note could not be saved. Keep this tab open and try again.');
  }
}
function openSettings() {
  if (!ready || $('#settings-dialog').open) return;
  $('#setting-name').value = state.name;
  $('#setting-engine').value = state.engine;
  document.querySelector(`input[name="theme"][value="${state.theme}"]`).checked = true;
  $('#setting-24hour').checked = state.use24Hour;
  $('#setting-ollama-endpoint').value = ollamaEndpoint;
  $('#ollama-test-status').textContent = '';
  $('#ollama-origin').hidden = true;
  $('#settings-error').hidden = true;
  openDialog($('#settings-dialog'));
}
$('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  const target = searchDestination($('#search').value, engines[state.engine].url);
  if (target) location.assign(target);
});
$('.wordmark').addEventListener('click', event => { event.preventDefault(); $('#search').focus(); });
$('#note').addEventListener('input', () => { if (ready) { clearedNote = null; void saveNote(); } });
$('#clear-note').addEventListener('click', () => {
  clearedNote = $('#note').value;
  $('#note').value = '';
  void saveNote();
  $('#note').focus();
});
$('#undo-note').addEventListener('click', () => {
  if (clearedNote === null) return;
  $('#note').value = clearedNote;
  clearedNote = null;
  void saveNote();
  $('#note').focus();
});
$('.settings-trigger').addEventListener('click', openSettings);
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { void closeDialog($('#settings-dialog')); return; }
  const submit = $('#settings-form button[value="save"]');
  let nextEndpoint = '';
  const entered = $('#setting-ollama-endpoint').value.trim();
  if (entered) {
    try { nextEndpoint = normalizeEndpoint(entered); }
    catch (error) { $('#settings-error').textContent = error.message; $('#settings-error').hidden = false; return; }
  }
  submit.disabled = true;
  const previous = { ...state };
  try {
    await persist({ name: $('#setting-name').value.trim(), engine: $('#setting-engine').value,
      theme: document.querySelector('input[name="theme"]:checked').value, use24Hour: $('#setting-24hour').checked });
    const oldEndpoint = ollamaEndpoint;
    ollamaEndpoint = nextEndpoint;
    if (oldEndpoint !== nextEndpoint) await chatController.updateEndpoint(nextEndpoint);
    applyTheme(); updateTime(); void closeDialog($('#settings-dialog'));
  } catch {
    state = previous;
    $('#settings-error').textContent = 'Could not save your settings. Please try again.';
    $('#settings-error').hidden = false;
  } finally { submit.disabled = false; }
});
$('#test-ollama').addEventListener('click', async () => {
  const input = $('#setting-ollama-endpoint');
  const status = $('#ollama-test-status');
  const button = $('#test-ollama');
  $('#ollama-origin').hidden = true;
  let endpoint;
  try { endpoint = normalizeEndpoint(input.value.trim()); }
  catch (error) { status.textContent = error.message; return; }
  button.disabled = true;
  status.textContent = 'Testing…';
  try {
    // Request the exact loopback host while the Test click has user activation.
    const permission = requestLocalPermission(endpoint);
    await permission;
    const models = await testConnection(endpoint, AbortSignal.timeout(10000));
    status.textContent = `Connected · ${models.length} ${models.length === 1 ? 'model' : 'models'}`;
  } catch (error) {
    status.textContent = connectionError(error);
    if (status.textContent.includes('OLLAMA_ORIGINS') && globalThis.chrome?.runtime?.getURL) {
      $('#ollama-origin').textContent = `OLLAMA_ORIGINS=${new URL(chrome.runtime.getURL('/')).origin}`;
      $('#ollama-origin').hidden = false;
    }
  }
  finally { button.disabled = false; }
});
$('#reset-settings').addEventListener('click', () => {
  $('#setting-name').value = '';
  $('#setting-engine').value = 'google';
  document.querySelector('input[name="theme"][value="system"]').checked = true;
  $('#setting-24hour').checked = false;
});
$('#add-link').addEventListener('click', () => {
  if (!ready) return;
  $('#link-form').reset();
  $('#link-url').setCustomValidity('');
  $('#link-name').setCustomValidity('');
  $('#link-error').hidden = true;
  openDialog($('#link-dialog'));
  $('#link-name').focus();
});
$('#link-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { void closeDialog($('#link-dialog')); return; }
  const name = $('#link-name').value.trim();
  if (!name) { $('#link-name').setCustomValidity('Enter a name for this favourite.'); $('#link-name').reportValidity(); return; }
  let url;
  try { url = webAddress($('#link-url').value.trim()); } catch {
    $('#link-url').setCustomValidity('Enter a valid http or https website address.');
    $('#link-url').reportValidity();
    return;
  }
  const submit = $('#link-form button[value="save"]');
  const oldLinks = state.links;
  submit.disabled = true;
  try {
    await persist({ links: [...state.links, { name, url }], favouritesSeeded: true });
    linksRevision++;
    renderLinks(); void closeDialog($('#link-dialog'));
  } catch {
    state.links = oldLinks;
    $('#link-error').textContent = 'Could not save this favourite. Please try again.';
    $('#link-error').hidden = false;
  } finally { submit.disabled = false; }
});
for (const id of ['link-url', 'link-name']) $(`#${id}`).addEventListener('input', event => event.target.setCustomValidity(''));
document.addEventListener('keydown', event => {
  if (event.isComposing) return;
  const editing = document.activeElement.matches('input, textarea, select, [contenteditable="true"]');
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !editing && !document.querySelector('dialog[open]')) {
    event.preventDefault(); $('#search').focus();
  }
  if (event.key === ',' && (event.metaKey || event.ctrlKey) && !document.querySelector('dialog[open]')) {
    event.preventDefault(); openSettings();
  }
});
themeMedia.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTime(); });
setInterval(updateTime, 1000);

async function boot() {
  $('#note').disabled = true;
  try {
    // Preserve the original extension's synced data on the first local-only launch.
    let saved = await readLocal('morrow-settings', null);
    if (saved === null && hasExtensionStorage && chrome.storage.sync) saved = await chrome.storage.sync.get(DEFAULTS);
    state = cleanState(saved || {});
    await writeLocal('morrow-settings', state);
  } catch { notify('Storage is unavailable. Changes may not survive closing this tab.'); }
  try {
    const chatSettings = await readLocal('morrow-ollama', {});
    ollamaEndpoint = chatSettings.endpoint ? normalizeEndpoint(chatSettings.endpoint) : '';
  } catch { ollamaEndpoint = ''; }
  applyTheme(); updateTime(); renderLinks();
  $('#note').value = state.note;
  $('#note').disabled = false;
  updateNoteUI();
  ready = true;
  $('#search').focus({ preventScroll: true });
  chatController = await initChat(ollamaEndpoint);
  $('#chat-toggle').hidden = !ollamaEndpoint;
  void seedFavourites();
}
async function seedFavourites() {
  if (state.favouritesSeeded) return;
  const startingRevision = linksRevision;
  const legacyDefaults = ['mail.google.com', 'calendar.google.com', 'drive.google.com'];
  const isOldDefault = state.links.length === legacyDefaults.length + 1 &&
    state.links[0].url === YOUTUBE_DEFAULT.url &&
    state.links.slice(1).every((link, index) => new URL(link.url).hostname === legacyDefaults[index]);
  let suggested = [];
  try { suggested = await recentFavouriteDomains(globalThis.chrome?.history); }
  catch { notify('Recent sites could not be loaded. You can still add favourites.'); }
  if (linksRevision !== startingRevision) return;
  const base = isOldDefault && suggested.length ? [YOUTUBE_DEFAULT] : state.links;
  const hosts = new Set(base.map(link => new URL(link.url).hostname.replace(/^www\./, '')));
  const newLinks = suggested.filter(link => !hosts.has(new URL(link.url).hostname.replace(/^www\./, '')));
  try {
    await persist({ links: [...base, ...newLinks], favouritesSeeded: true });
    renderLinks();
  } catch { notify('Could not save suggested favourites. You can try again on the next tab.'); }
}
void boot();
