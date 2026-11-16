import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { renderTestLab } from '../src/testlab.js';

const origin = 'https://test-worker.example.workers.dev';

test('Testlab is served as a private-token-free standalone HTML page', async () => {
  const response = await worker.fetch(new Request(origin + '/testlab'), {
    APP_ORIGIN: 'https://gregncheese.github.io'
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const html = await response.text();
  assert.equal(html, renderTestLab());
  assert.match(html, /Gemini Testlab/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /Start één zoektest/);
  assert.ok(!html.includes('localStorage'));
  assert.ok(!html.includes('sessionStorage'));
});

test('Testlab origin is allowed for same-origin preflight requests', async () => {
  const response = await worker.fetch(new Request(origin + '/lookup', {
    method: 'OPTIONS',
    headers: { Origin: origin }
  }), { APP_ORIGIN: 'https://gregncheese.github.io' });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
});

test('untrusted cross-origin preflight remains denied', async () => {
  const response = await worker.fetch(new Request(origin + '/lookup', {
    method: 'OPTIONS',
    headers: { Origin: 'https://other.example' }
  }), { APP_ORIGIN: 'https://gregncheese.github.io' });
  assert.equal(response.status, 403);
});

test('Testlab does not bypass Bearer authentication for /lookup', async () => {
  const response = await worker.fetch(new Request(origin + '/lookup', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName: 'Paldean Fates Booster Bundle', productType: 'bundle' })
  }), {
    APP_ORIGIN: 'https://gregncheese.github.io',
    KEEPFLIP_ACCESS_TOKEN: 'secret-only-for-test'
  });
  assert.equal(response.status, 401);
});
