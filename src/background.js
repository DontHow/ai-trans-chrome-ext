import { DEFAULTS, LANGUAGES, validateSettings, normalizeText, hostPattern, cacheKey, requestTranslation, pruneCache } from './core.js';

const ready = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
let queue = Promise.resolve();
let generation = 0;
const pending = new Map();
function exclusive(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; }
async function settings() { return { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings }; }
async function translate(message) {
  const config = await settings();
  const text = normalizeText(message.text);
  const target = message.target || config.target;
  if (!LANGUAGES.includes(target)) throw new Error('不支持的目标语言。');
  const id = await cacheKey(config, text, target);
  const cached = await exclusive(async () => {
    if (!config.cacheDays) return null;
    const { cache = {} } = await chrome.storage.local.get('cache');
    const item = cache[id];
    if (!item || item.expires <= Date.now()) return null;
    item.used = Date.now();
    await chrome.storage.local.set({ cache: pruneCache(cache) });
    return { text: item.translation, cached: true };
  });
  if (cached) return cached;
  if (!(await chrome.permissions.contains({ origins: [hostPattern(config.url)] }))) throw new Error('请先在设置中保存接口，并授予该域名的访问权限。');
  // Keys are part of in-flight identity, but never persisted in cache keys.
  const flightId = `${generation}:${id}:${config.key}`;
  if (pending.has(flightId)) return pending.get(flightId);
  const startedGeneration = generation;
  const task = (async () => {
    const translation = await requestTranslation(config, text, target);
    let cacheSaved = false;
    if (config.cacheDays) await exclusive(async () => {
      if (startedGeneration !== generation) return;
      const { cache = {} } = await chrome.storage.local.get('cache');
      const now = Date.now();
      cache[id] = { translation, used: now, expires: now + config.cacheDays * 86400000 };
      try { await chrome.storage.local.set({ cache: pruneCache(cache) }); cacheSaved = true; } catch { /* Return a usable translation even when local storage is full. */ }
    });
    return { text: translation, cached: false, cacheSaved };
  })().finally(() => pending.delete(flightId));
  pending.set(flightId, task);
  return task;
}
async function handle(message) {
  await ready;
  switch (message.type) {
    case 'settings': return settings();
    case 'saveSettings': return exclusive(async () => {
      const config = validateSettings(message.settings);
      if (!(await chrome.permissions.contains({ origins: [hostPattern(config.url)] }))) throw new Error('尚未授予接口域名的访问权限。');
      await chrome.storage.local.set({ settings: config }); generation++;
      return true;
    });
    case 'translate': return translate(message);
    case 'stats': return exclusive(async () => {
      const { cache = {} } = await chrome.storage.local.get('cache');
      const clean = pruneCache(cache);
      await chrome.storage.local.set({ cache: clean });
      return { count: Object.keys(clean).length, bytes: new TextEncoder().encode(JSON.stringify(clean)).length };
    });
    case 'clearCache': return exclusive(async () => { generation++; await chrome.storage.local.remove('cache'); return true; });
    default: throw new Error('未知操作。');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  handle(message).then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'translate-selection', title: '用译存翻译选中文本', contexts: ['selection'] });
  });
});
chrome.contextMenus.onClicked.addListener(async info => {
  if (info.menuItemId !== 'translate-selection' || !info.selectionText) return;
  const token = crypto.randomUUID();
  const existing = await chrome.storage.session.get(null);
  const expired = Object.keys(existing).filter(key => key.startsWith('selection:') && existing[key].expires < Date.now());
  await chrome.storage.session.remove(expired);
  await chrome.storage.session.set({ [`selection:${token}`]: { text: info.selectionText.slice(0, 12000), expires: Date.now() + 300000 } });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?selection=${token}`) });
});
