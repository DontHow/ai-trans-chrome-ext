import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdtemp, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const extension = process.cwd();
 await mkdir(join(extension, 'artifacts'), { recursive: true });
 const profile = await mkdtemp(join(tmpdir(), 'ai-trans-browser-'));
 const context = await chromium.launchPersistentContext(profile, { headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }), args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
 try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 720, height: 680 });
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.getByText('首次使用，请先设置 AI 接口。').waitFor({ timeout: 3000 });
  await page.getByRole('button', { name: '翻译文本' }).click();
  await page.getByText('请先输入需要翻译的文本。').waitFor();
  await page.getByRole('button', { name: '翻译当前网页', exact: true }).click();
  await page.getByText('此页面无法翻译，请在普通 HTTP 或 HTTPS 网页上使用。').waitFor();
  // Seed a valid cached translation to verify a real extension cache read without network access.
  await page.evaluate(async () => {
   const { cacheKey, DEFAULTS } = await import('./src/core.js');
   const key = await cacheKey(DEFAULTS, 'The world is a book, and those who do not travel read only one page.', '简体中文');
   await chrome.storage.local.set({ cache: { [key]: { translation: '世界是一本书，不旅行的人只读了其中一页。', used: Date.now(), expires: Date.now() + 86400000 } } });
  });
  await page.getByRole('textbox', { name: '原文' }).fill('The world is a book, and those who do not travel read only one page.');
  await page.getByRole('button', { name: '翻译文本' }).click();
  await page.getByText('命中缓存，本次未请求 AI 接口。').waitFor();
  assert.match(await page.locator('#result').innerText(), /世界是一本书/);
  await page.screenshot({ path: `${extension}/artifacts/translator.png`, fullPage: true });
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.locator('#url').waitFor();
  await page.waitForFunction(() => document.querySelector('#model').value.length > 0);
  assert.equal(await page.locator('#model').inputValue(), 'gpt-4o-mini');
  await page.getByRole('button', { name: '显示', exact: true }).click();
  assert.equal(await page.locator('#key').getAttribute('type'), 'text');
  await page.screenshot({ path: `${extension}/artifacts/settings.png`, fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清空缓存' }).click();
  await page.getByText('本地缓存已清空。', { exact: true }).waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: real Chromium MV3 load, worker messages, validation, offline cache hit, settings, key visibility, clear cache, no page errors.');
 } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
