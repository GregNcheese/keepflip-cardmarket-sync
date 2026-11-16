import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const base = 'https://late-smoke-2a21.chokorii.workers.dev';
const env = { APP_ORIGIN: 'https://example.com', KEEPFLIP_ACCESS_TOKEN: 'unit-test-secret' };

test('root and /health advertise version 2.1.4 without revealing secrets', async () => {
  for (const path of ['/', '/health']) {
    const response = await worker.fetch(new Request(base + path), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.version, '2.1.4');
    assert.equal(body.status, 'online');
    assert.equal(body.accessConfigured, true);
    assert.doesNotMatch(JSON.stringify(body), /unit-test-secret/);
  }
});

test('private lookup endpoints require authentication', async () => {
  for (const path of ['/lookup', '/image-lookup']) {
    const response = await worker.fetch(new Request(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }), env);
    assert.equal(response.status, 401);
  }
});

test('private image relay requires authentication', async () => {
  const response = await worker.fetch(new Request(base + '/image?url=https%3A%2F%2Fexample.com%2Fx.jpg'), env);
  assert.equal(response.status, 401);
});

test('unrecognized route is not found', async () => {
  const response = await worker.fetch(new Request(base + '/unrecognized'), env);
  assert.equal(response.status, 404);
});
