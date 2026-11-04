import { $, send, languageOptions, status, cacheInfo } from './ui.js';
import { validateSettings, hostPattern } from './core.js';
languageOptions();
$('toggle-key').addEventListener('click', () => { const show = $('key').type === 'password'; $('key').type = show ? 'text' : 'password'; $('toggle-key').textContent = show ? '隐藏' : '显示'; $('toggle-key').setAttribute('aria-pressed', String(show)); });
$('config').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const config = validateSettings(Object.fromEntries(['url', 'key', 'model', 'target', 'cacheDays'].map(id => [id, $(id).value])));
    // Invoke permissions.request directly inside the user gesture.
    const permission = chrome.permissions.request({ origins: [hostPattern(config.url)] });
    $('save').disabled = true;
    if (!(await permission)) throw new Error('未授予接口域名的访问权限，设置未保存。');
    await send('saveSettings', { settings: config });
    $('url').value = config.url;
    status('设置已保存，可以开始翻译。', 'success');
  } catch (error) { status(error.message, 'error'); }
  finally { $('save').disabled = false; }
});
$('clear-cache').addEventListener('click', async () => {
  if (!confirm('清空全部本地译文缓存？下次翻译将重新请求 AI 接口。')) return;
  try { await send('clearCache'); await cacheInfo(); status('本地缓存已清空。', 'success'); } catch (error) { status(error.message, 'error'); }
});
async function init() {
  try { const config = await send('settings'); for (const id of ['url', 'key', 'model', 'target', 'cacheDays']) $(id).value = config[id]; await cacheInfo(); }
  catch (error) { status(error.message, 'error'); }
}
init();
