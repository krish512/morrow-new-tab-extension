import { normalizeEndpoint, testConnection, requestLocalPermission, streamChat, connectionError } from './ollama.js';
import { readLocal, writeLocal } from './storage.js';

export async function initChat(initialEndpoint) {
  const $ = selector => document.querySelector(selector);
  const panel = $('#chat-panel');
  const log = $('#chat-messages');
  const empty = $('#chat-empty');
  const stored = await readLocal('morrow-ollama', {}).catch(() => ({}));
  let endpoint = initialEndpoint;
  let model = stored.endpoint === endpoint ? stored.model || '' : '';
  let connected = false;
  let connecting = false;
  let controller = null;
  let messages = [];

  function showError(message = '') {
    $('#chat-error').textContent = message;
    $('#chat-error').hidden = !message;
  }
  function refreshControls() {
    const busy = Boolean(controller);
    $('#ollama-model').disabled = busy || !connected;
    $('#chat-input').disabled = !connected;
    $('#chat-input').placeholder = connected ? 'Ask anything…' : 'Connect in Customize to chat';
    $('#send-chat').disabled = !connected || busy || !$('#chat-input').value.trim();
    $('#send-chat').hidden = busy;
    $('#stop-chat').hidden = !busy;
    $('#clear-chat').disabled = busy || !log.querySelector('.chat-message');
  }
  function scrollToLatest() { log.scrollTop = log.scrollHeight; }
  function addMessage(role, content) {
    empty.remove();
    const article = document.createElement('article');
    article.className = 'chat-message';
    article.dataset.role = role;
    const label = document.createElement('p');
    label.className = 'message-role';
    label.textContent = role === 'user' ? 'You' : 'Morrow';
    const body = document.createElement('p');
    body.className = 'message-content';
    body.textContent = content;
    article.append(label, body);
    log.append(article);
    scrollToLatest();
    return { article, body, label };
  }
  async function connect() {
    if (!endpoint || connecting || connected) return;
    connecting = true;
    showError();
    $('#connection-status').textContent = 'Connecting…';
    try {
      // Called directly from the panel trigger's click event when permission is needed.
      await requestLocalPermission(endpoint);
      const models = await testConnection(endpoint, AbortSignal.timeout(10000));
      model = models.includes(model) ? model : models[0];
      $('#ollama-model').replaceChildren(...models.map(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      }));
      $('#ollama-model').value = model;
      $('#model-row').hidden = false;
      $('#connection-status').textContent = 'Connected';
      connected = true;
      await writeLocal('morrow-ollama', { endpoint, model });
      if (!panel.hidden) $('#chat-input').focus();
    } catch (error) {
      $('#connection-status').textContent = 'Connection failed';
      showError(connectionError(error));
    } finally { connecting = false; refreshControls(); }
  }
  panel.addEventListener('panelopen', () => { void connect(); });
  $('#clear-chat').addEventListener('click', () => {
    messages = [];
    log.replaceChildren(empty);
    showError();
    refreshControls();
    $('#chat-input').focus();
  });
  $('#chat-input').addEventListener('input', refreshControls);
  $('#chat-input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!$('#send-chat').disabled) $('#chat-form').requestSubmit();
    }
  });
  $('#stop-chat').addEventListener('click', () => controller?.abort());
  $('#ollama-model').addEventListener('change', async () => {
    model = $('#ollama-model').value;
    try { await writeLocal('morrow-ollama', { endpoint, model }); }
    catch { showError('Could not save this model selection.'); }
  });
  $('#chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const content = $('#chat-input').value.trim();
    if (!connected || controller || !content) return;
    showError();
    const userMessage = { role: 'user', content };
    addMessage('user', content);
    $('#chat-input').value = '';
    const reply = addMessage('assistant', 'Thinking…');
    reply.article.dataset.pending = 'true';
    controller = new AbortController();
    const abortController = controller;
    const timeout = setTimeout(() => abortController.abort(new DOMException('Response timed out', 'TimeoutError')), 180000);
    refreshControls();
    let result = '';
    log.setAttribute('aria-busy', 'true');
    try {
      await streamChat({ endpoint, model, messages: [...messages, userMessage], signal: abortController.signal,
        onChunk: chunk => {
          const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
          result += chunk;
          reply.body.textContent = result || 'Thinking…';
          reply.article.dataset.pending = String(!result);
          if (nearBottom) scrollToLatest();
        }
      });
      if (!result.trim()) throw new Error('The model returned no text. Try another model or rephrase your message.');
      messages.push(userMessage, { role: 'assistant', content: result });
    } catch (error) {
      const stopped = abortController.signal.aborted && abortController.signal.reason?.name !== 'TimeoutError';
      reply.label.textContent = stopped ? 'Morrow · Stopped' : 'Morrow · Incomplete';
      reply.body.textContent = result || (stopped ? 'Response stopped.' : 'No reply received.');
      if (!stopped) showError(connectionError(abortController.signal.reason || error));
      if (!$('#chat-input').value) $('#chat-input').value = content;
    } finally {
      clearTimeout(timeout);
      reply.article.dataset.pending = 'false';
      log.setAttribute('aria-busy', 'false');
      controller = null;
      refreshControls();
      if (!panel.hidden) $('#chat-input').focus();
    }
  });
  refreshControls();
  return {
    async updateEndpoint(value) {
      if (endpoint === value) return;
      controller?.abort();
      endpoint = value ? normalizeEndpoint(value) : '';
      model = '';
      connected = false;
      $('#connection-status').textContent = endpoint ? 'Connect to Ollama' : 'No endpoint';
      $('#model-row').hidden = true;
      $('#chat-toggle').hidden = !endpoint;
      if (!endpoint && !panel.hidden) panel.close();
      messages = [];
      log.replaceChildren(empty);
      showError();
      refreshControls();
      await writeLocal('morrow-ollama', { endpoint, model });
    }
  };
}
