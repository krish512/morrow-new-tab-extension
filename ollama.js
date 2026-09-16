// Ollama's native API: https://docs.ollama.com/api/chat
export function normalizeEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a local address such as http://localhost:11434.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Use localhost or 127.0.0.1 to connect to Ollama on this computer.');
  }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Use the server address only, without a path, password, or query.');
  }
  return url.origin;
}

export async function requestLocalPermission(endpoint) {
  const url = new URL(normalizeEndpoint(endpoint));
  if (!globalThis.chrome?.permissions?.request) return true;
  const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
  if (!granted) throw new Error('Local connection permission was not granted.');
  return true;
}

async function request(endpoint, path, options = {}) {
  const response = await fetch(`${normalizeEndpoint(endpoint)}${path}`, {
    ...options, credentials: 'omit', redirect: 'error', cache: 'no-store'
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error('Ollama blocked this extension. Allow its origin with OLLAMA_ORIGINS and restart Ollama. See README for setup.');
    let detail = '';
    try { detail = (await response.json()).error || ''; } catch { /* Some proxies return plain text. */ }
    throw new Error(detail ? `Ollama: ${String(detail).slice(0, 220)}` : `Ollama returned HTTP ${response.status}. Check the endpoint and try again.`);
  }
  return response;
}

export async function listModels(endpoint, signal) {
  const response = await request(endpoint, '/api/tags', { signal });
  const data = await response.json();
  if (!Array.isArray(data.models)) throw new Error('This address did not return an Ollama model list.');
  const models = [...new Set(data.models.map(item => item.name).filter(name => typeof name === 'string' && name))];
  if (!models.length) throw new Error('Ollama is running, but no models are installed. Pull a model in Ollama, then connect again.');
  return models;
}

export async function testConnection(endpoint, signal) {
  const models = await listModels(endpoint, signal);
  // Ollama can allow GET /api/tags while rejecting POST /api/chat for an
  // extension origin. OPTIONS checks that route without running a model.
  await request(endpoint, '/api/chat', { method: 'OPTIONS', signal });
  return models;
}

export async function streamChat({ endpoint, model, messages, signal, onChunk }) {
  const response = await request(endpoint, '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ model, messages, stream: true })
  });
  if (!response.body) throw new Error('Ollama returned an empty response. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  const consume = line => {
    if (!line.trim()) return;
    let chunk;
    try { chunk = JSON.parse(line); } catch { throw new Error('Ollama returned an unreadable response. Please try again.'); }
    if (chunk.error) throw new Error(`Ollama: ${String(chunk.error).slice(0, 220)}`);
    if (typeof chunk.message?.content === 'string') onChunk(chunk.message.content);
    if (chunk.done === true) complete = true;
  };
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (done) { consume(buffer); break; }
    }
    if (!complete) throw new Error('The connection ended before the reply finished. Please try again.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function connectionError(error) {
  if (error.name === 'TimeoutError') return 'Ollama took too long to respond. Check that it is running, or try a smaller model.';
  if (error instanceof TypeError) return 'Could not reach Ollama. Check the address, start Ollama, and allow this extension in OLLAMA_ORIGINS if needed.';
  return error.message || 'The connection failed. Please try again.';
}
