import { LANGUAGES } from './core.js';
export const $ = id => document.getElementById(id);
export async function send(type, values = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...values });
  if (!response?.ok) throw new Error(response?.error || '插件连接失败，请重新加载插件。');
  return response.data;
}
export function languageOptions() {
  for (const language of LANGUAGES) { const option = document.createElement('option'); option.value = language; option.textContent = language; $('target').append(option); }
}
export function status(message, kind = '') { $('status').textContent = message; $('status').className = kind; }
export async function cacheInfo() { const stats = await send('stats'); $('cache-info').textContent = `${stats.count} 条缓存 · ${(stats.bytes / 1024).toFixed(1)} KB`; }
