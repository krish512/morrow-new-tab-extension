import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEndpoint, listModels, testConnection, streamChat } from '../ollama.js';

test('only loopback HTTP(S) server roots are accepted', () => {
  assert.equal(normalizeEndpoint('http://localhost:11434/'), 'http://localhost:11434');
  assert.equal(normalizeEndpoint('https://127.0.0.1:443'), 'https://127.0.0.1');
  for (const address of ['https://example.com', 'file:///tmp/test', 'http://localhost@evil.test', 'http://localhost:11434/api', 'http://localhost/?secret=1', 'http://user:pass@localhost']) {
    assert.throws(() => normalizeEndpoint(address));
  }
});

test('model discovery handles duplicates, missing models, and permission errors', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ models: [{ name: 'small' }, { name: 'small' }, { name: 'large' }, {}] }));
  assert.deepEqual(await listModels('http://localhost:11434'), ['small', 'large']);
  globalThis.fetch = async () => Response.json({ models: [] });
  await assert.rejects(listModels('http://localhost:11434'), /no models/);
  globalThis.fetch = async () => new Response('', { status: 403 });
  await assert.rejects(listModels('http://localhost:11434'), /OLLAMA_ORIGINS/);
});

test('connection test checks chat access without running a model', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options.method || 'GET']);
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: 'small' }] });
    return new Response('', { status: 403 });
  });
  await assert.rejects(testConnection('http://localhost:11434'), /OLLAMA_ORIGINS/);
  assert.deepEqual(requests, [
    ['http://localhost:11434/api/tags', 'GET'],
    ['http://localhost:11434/api/chat', 'OPTIONS']
  ]);
});

function responseFromChunks(chunks) {
  return new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); }
  }));
}

test('streaming handles fragmented JSON, split Unicode, and a final line without newline', async t => {
  const encoded = new TextEncoder().encode([
    JSON.stringify({ message: { content: 'Hello café ' }, done: false }),
    JSON.stringify({ message: { content: '☀' }, done: true })
  ].join('\n'));
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options };
    return responseFromChunks([...encoded].map(byte => new Uint8Array([byte])));
  });
  let answer = '';
  await streamChat({ endpoint: 'http://localhost:11434', model: 'small', messages: [{ role: 'user', content: 'Hi' }], onChunk: text => { answer += text; } });
  assert.equal(answer, 'Hello café ☀');
  assert.equal(request.url, 'http://localhost:11434/api/chat');
  assert.equal(request.options.redirect, 'error');
  assert.equal(JSON.parse(request.options.body).stream, true);
});

test('stream errors and premature EOF are reported without claiming completion', async t => {
  t.mock.method(globalThis, 'fetch', async () => responseFromChunks([new TextEncoder().encode('{"message":{"content":"partial"},"done":false}\n')]));
  const args = { endpoint: 'http://localhost:11434', model: 'small', messages: [], onChunk() {} };
  await assert.rejects(streamChat(args), /before the reply finished/);
  globalThis.fetch = async () => responseFromChunks([new TextEncoder().encode('{"error":"model unavailable"}\n')]);
  await assert.rejects(streamChat(args), /model unavailable/);
  globalThis.fetch = async () => responseFromChunks([new TextEncoder().encode('not json\n')]);
  await assert.rejects(streamChat(args), /unreadable response/);
});

test('stopping forwards the abort signal and cancels an in-progress read', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Response(new ReadableStream({
    start(stream) { options.signal.addEventListener('abort', () => stream.error(options.signal.reason)); }
  })));
  const pending = streamChat({ endpoint: 'http://localhost:11434', model: 'small', messages: [], signal: controller.signal, onChunk() {} });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
