import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, endpoint, hostPattern, validateSettings, normalizeText, cacheKey, requestTranslation, pruneCache } from '../src/core.js';

test('normalizes API roots and full endpoints without guessing a version path', () => {
  assert.equal(endpoint(' https://example.com/v1/ '), 'https://example.com/v1/chat/completions');
  assert.equal(endpoint('https://example.com/custom/chat/completions'), 'https://example.com/custom/chat/completions');
  assert.equal(hostPattern('http://localhost:11434/v1'), 'http://localhost/*');
  for (const url of ['http://example.com', 'file:///tmp/key', 'https://user:pass@example.com', 'https://example.com?key=secret']) assert.throws(() => endpoint(url));
});
test('validates settings and text bounds', () => {
  assert.equal(validateSettings(DEFAULTS).model, DEFAULTS.model);
  assert.throws(() => validateSettings({ ...DEFAULTS, model: '' }));
  assert.throws(() => validateSettings({ ...DEFAULTS, cacheDays: -1 }));
  assert.throws(() => normalizeText(' '));
  assert.throws(() => normalizeText('a'.repeat(12001)));
  assert.equal(normalizeText(' hello\nworld '), 'hello\nworld');
});
test('cache partitions by provider, model, text, language, but not API key', async () => {
  const base = await cacheKey(DEFAULTS, 'Hello', '简体中文');
  assert.equal(base, await cacheKey({ ...DEFAULTS, key: 'new-key' }, 'Hello', '简体中文'));
  for (const [config, text, target] of [[{ ...DEFAULTS, url: 'https://other.example/v1' }, 'Hello', '简体中文'], [{ ...DEFAULTS, model: 'other' }, 'Hello', '简体中文'], [DEFAULTS, 'hello', '简体中文'], [DEFAULTS, 'Hello', 'English']]) assert.notEqual(base, await cacheKey(config, text, target));
});
test('sends compatible request and extracts translation', async () => {
  const result = await requestTranslation({ ...DEFAULTS, key: 'private-key' }, 'Hello', '简体中文', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer private-key');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.messages[1].content, 'Hello');
    assert.equal(body.stream, false);
    return Response.json({ choices: [{ message: { content: '  你好  ' } }] });
  });
  assert.equal(result, '你好');
});
test('handles HTTP, network, malformed and empty results without leaking response bodies', async () => {
  for (const code of [401, 403, 404, 429, 500]) await assert.rejects(requestTranslation(DEFAULTS, 'Hello', 'English', async () => new Response('sensitive upstream body', { status: code })), error => !error.message.includes('sensitive'));
  await assert.rejects(requestTranslation(DEFAULTS, 'Hello', 'English', async () => { throw new DOMException('', 'TimeoutError'); }), /超时/);
  await assert.rejects(requestTranslation(DEFAULTS, 'Hello', 'English', async () => { throw new TypeError(); }), /无法连接/);
  await assert.rejects(requestTranslation(DEFAULTS, 'Hello', 'English', async () => new Response('not json')), /JSON/);
  await assert.rejects(requestTranslation(DEFAULTS, 'Hello', 'English', async () => Response.json({})), /未返回译文/);
});
test('cache prunes expired, oldest, and oversized entries', () => {
  const cache = Object.fromEntries(Array.from({ length: 1005 }, (_, i) => [String(i), { used: i, expires: 1000, translation: '你好' }]));
  cache.expired = { used: 900, expires: 10, translation: 'gone' };
  const clean = pruneCache(cache, 20);
  assert.equal(Object.keys(clean).length, 1000);
  assert.ok(!clean.expired && !clean['0'] && clean['1004']);
  assert.deepEqual(pruneCache(cache, 20, 2), {});
});
