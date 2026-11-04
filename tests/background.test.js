import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/core.js';

const storage = {};
let listener; let requests = 0; let allowed = true; let defer;
globalThis.chrome = {
  storage: {
    local: { setAccessLevel: async () => {}, get: async key => structuredClone({ [key]: storage[key] }), set: async obj => Object.assign(storage, structuredClone(obj)), remove: async key => { delete storage[key]; } },
    session: { get: async () => ({}), remove: async () => {}, set: async () => {} }
  },
  permissions: { contains: async () => allowed },
  runtime: { id: 'unit-test', getURL: path => `chrome-extension://unit-test/${path}`, onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
  contextMenus: { onClicked: { addListener() {} } }
};
globalThis.fetch = async () => { requests++; if (defer) await defer; return Response.json({ choices: [{ message: { content: '你好' } }] }); };
await import('../src/background.js');
const send = (type, values = {}) => new Promise(resolve => listener({ type, ...values }, { id: 'unit-test', url: 'chrome-extension://unit-test/popup.html', tab: { id: 1 } }, resolve));
async function ok(type, values) { const response = await send(type, values); assert.equal(response.ok, true, response.error); return response.data; }

test('background lifecycle: permissions, cache, single flight, clear during fetch, disabled cache', async () => {
  const config = { ...DEFAULTS, url: 'https://provider.example/v1', key: 'secret' };
  await ok('saveSettings', { settings: config });
  assert.equal((await ok('translate', { text: 'Hello' })).cached, false);
  assert.equal((await ok('translate', { text: 'Hello' })).cached, true);
  assert.equal(requests, 1);
  assert.ok(!JSON.stringify(storage.cache).includes('secret'));
  allowed = false;
  assert.equal((await ok('translate', { text: 'Hello' })).cached, true);
  assert.equal((await send('translate', { text: 'New text' })).ok, false);
  allowed = true;
  await ok('clearCache');
  let release; defer = new Promise(resolve => { release = resolve; });
  const one = ok('translate', { text: 'Concurrent' });
  const two = ok('translate', { text: 'Concurrent' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(requests, 2);
  await ok('clearCache');
  release(); await Promise.all([one, two]); defer = null;
  assert.equal((await ok('stats')).count, 0);
  await ok('saveSettings', { settings: { ...config, cacheDays: 0 } });
  await ok('translate', { text: 'Uncached' }); await ok('translate', { text: 'Uncached' });
  assert.equal(requests, 4);
  assert.equal((await ok('stats')).count, 0);
  assert.equal(listener({ type: 'settings' }, { id: 'unit-test', url: 'https://untrusted.example', tab: { id: 1 } }, () => {}), false);
});
