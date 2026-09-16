import test from 'node:test';
import assert from 'node:assert/strict';
import { searchDestination } from '../navigation.js';

const engine = 'https://www.google.com/search?q=';

test('opens recognizable websites directly', () => {
  assert.equal(searchDestination('youtube.com', engine), 'https://youtube.com/');
  assert.equal(searchDestination('example.com/docs?q=one', engine), 'https://example.com/docs?q=one');
  assert.equal(searchDestination('https://example.com/path', engine), 'https://example.com/path');
  assert.equal(searchDestination('http://example.com', engine), 'http://example.com/');
  assert.equal(searchDestination('localhost:3000/docs', engine), 'http://localhost:3000/docs');
  assert.equal(searchDestination('127.0.0.1:8080', engine), 'http://127.0.0.1:8080/');
});

test('searches phrases and unsafe or invalid addresses', () => {
  assert.equal(searchDestination('calm workspace', engine), `${engine}calm%20workspace`);
  assert.equal(searchDestination('https://name:secret@example.com', engine), `${engine}https%3A%2F%2Fname%3Asecret%40example.com`);
  assert.equal(searchDestination('example.com:99999', engine), `${engine}example.com%3A99999`);
  assert.equal(searchDestination('   ', engine), null);
});
