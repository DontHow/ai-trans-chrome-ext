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
async function pageAction(message) {
  if (!Number.isInteger(message.tabId)) throw new Error('未找到当前网页，请从网页上打开插件。');
  const tab = await chrome.tabs.get(message.tabId);
  if (!tab.url || !/^https?:\/\//.test(tab.url)) throw new Error('此页面无法翻译，请在普通 HTTP 或 HTTPS 网页上使用。');
  const sessionKey = `page:${tab.id}`;
  try {
    if (message.type === 'restorePage') {
      await chrome.storage.session.remove(sessionKey);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { globalThis.__yiCunPage?.restore(); } });
      return true;
    }
    const target = message.target || (await settings()).target;
    if (!LANGUAGES.includes(target)) throw new Error('不支持的目标语言。');
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/page.js'] });
    const token = crypto.randomUUID();
    const documentId = injected[0]?.documentId;
    if (!documentId) throw new Error('无法识别网页，请刷新网页后重试。');
    await chrome.storage.session.set({ [sessionKey]: { token, documentId, target, expires: Date.now() + 1800000 } });
    await chrome.scripting.executeScript({ target: { tabId: tab.id, documentIds: [documentId] }, func: (token, target) => { globalThis.__yiCunPage.start(token, target); }, args: [token, target] });
    return true;
  } catch (error) {
    await chrome.storage.session.remove(sessionKey);
    throw new Error(`无法操作此网页，请刷新后重新点击插件。Chrome 内部页面、扩展商店和 PDF 等页面不支持网页翻译。${error.message.includes('目标语言') ? error.message : ''}`);
  }
}
async function pageTranslation(message, sender) {
  await ready;
  const key = `page:${sender.tab.id}`;
  const session = (await chrome.storage.session.get(key))[key];
  if (!session || session.token !== message.token || session.documentId !== sender.documentId || session.expires < Date.now()) throw new Error('网页翻译授权已失效，请重新点击「翻译当前网页」。');
  return translate({ text: message.text, target: session.target });
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
    case 'startPage':
    case 'restorePage': return pageAction(message);
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
  if (sender.id !== chrome.runtime.id) return false;
  let action;
  if (sender.url?.startsWith(chrome.runtime.getURL(''))) action = () => handle(message);
  else if (sender.tab && sender.frameId === 0 && message.type === 'pageTranslate') action = () => pageTranslation(message, sender);
  else return false;
  Promise.resolve().then(action).then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'translate-page', title: '用译存翻译此网页', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'restore-page', title: '译存：恢复网页原文', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'translate-selection', title: '用译存翻译选中文本', contexts: ['selection'] });
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (['translate-page', 'restore-page'].includes(info.menuItemId)) {
    try { await pageAction({ type: info.menuItemId === 'translate-page' ? 'startPage' : 'restorePage', tabId: tab?.id }); }
    catch (error) {
      // Context menus have no popup; show the actionable failure in a dedicated extension page.
      const token = crypto.randomUUID();
      await chrome.storage.session.set({ [`selection:${token}`]: { error: error.message, expires: Date.now() + 300000 } });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?selection=${token}`) });
    }
    return;
  }
  if (info.menuItemId !== 'translate-selection' || !info.selectionText) return;
  const token = crypto.randomUUID();
  const existing = await chrome.storage.session.get(null);
  const expired = Object.keys(existing).filter(key => key.startsWith('selection:') && existing[key].expires < Date.now());
  await chrome.storage.session.remove(expired);
  await chrome.storage.session.set({ [`selection:${token}`]: { text: info.selectionText.slice(0, 12000), expires: Date.now() + 300000 } });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?selection=${token}`) });
});

chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(`page:${tabId}`).catch(() => {}); });
