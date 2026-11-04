import { $, send, languageOptions, status, cacheInfo } from './ui.js';
languageOptions();
let busy = false;
let revision = 0;
let result = '';
function changed() { revision++; result = ''; $('copy').disabled = true; $('result').textContent = ''; $('origin').textContent = 'AI 翻译 · 本地缓存'; $('counter').textContent = `${$('source').value.length.toLocaleString()} / 12,000`; }
$('source').addEventListener('input', changed);
$('target').addEventListener('change', changed);
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('clear').addEventListener('click', () => { $('source').value = ''; changed(); status('已清空，可以输入新的文本。'); $('source').focus(); });
$('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(result); status('译文已复制。', 'success'); } catch { status('复制失败，请手动选择译文复制。', 'error'); } });
async function translate() {
  if (busy) return;
  busy = true; $('translate').disabled = true; $('translate').textContent = '正在翻译…';
  const started = revision;
  status('正在翻译，请稍候…'); result = ''; $('copy').disabled = true; $('result').textContent = '';
  try {
    const response = await send('translate', { text: $('source').value, target: $('target').value });
    if (started !== revision) { status('原文或语言已更改，请重新翻译。'); return; }
    result = response.text; $('result').textContent = result; $('copy').disabled = false;
    $('origin').textContent = response.cached ? '● 来自本地缓存' : response.cacheSaved ? '● AI 翻译 · 已缓存' : '● AI 翻译 · 未缓存';
    status(response.cached ? '命中缓存，本次未请求 AI 接口。' : '翻译完成。', 'success');
    await cacheInfo();
  } catch (error) { status(error.message, 'error'); }
  finally { busy = false; $('translate').disabled = false; $('translate').textContent = '翻译文本 ↗'; }
}
$('translate').addEventListener('click', translate);
$('source').addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); translate(); } });
async function init() {
  try {
    const config = await send('settings'); $('target').value = config.target;
    const allowed = await chrome.permissions.contains({ origins: [(await import('./core.js')).hostPattern(config.url)] });
    status(allowed ? `使用 ${config.model} · 准备就绪` : '首次使用，请先设置 AI 接口。');
    const token = new URLSearchParams(location.search).get('selection');
    if (token) {
      const id = `selection:${token}`;
      const selection = (await chrome.storage.session.get(id))[id];
      await chrome.storage.session.remove(id);
      if (selection?.expires > Date.now()) {
        if (selection.error) status(selection.error, 'error');
        else { $('source').value = selection.text; changed(); }
      }
      else status('选中文本已过期，请重新在网页中选择。', 'error');
    }
    await cacheInfo();
  } catch (error) { status(error.message, 'error'); }
}
init();

for (const [id, type] of [['translate-page', 'startPage'], ['restore-page', 'restorePage']]) {
  $(id).addEventListener('click', async () => {
    $(id).disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await send(type, { tabId: tab?.id, target: $('target').value });
      status(type === 'startPage' ? '网页翻译已启动，可关闭弹窗并在网页查看进度。' : '已恢复网页原文。', 'success');
    } catch (error) { status(error.message, 'error'); }
    finally { $(id).disabled = false; }
  });
}
