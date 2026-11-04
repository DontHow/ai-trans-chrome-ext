// Runs only in Chrome's isolated content-script world after an explicit page action.
(() => {
  if (globalThis.__yiCunPage) return;
  const SKIP = 'script,style,noscript,textarea,input,select,button,pre,code,kbd,samp,svg,canvas,math,iframe,[contenteditable]:not([contenteditable="false"]),[translate="no"],[hidden],[inert],[aria-hidden="true"],[data-ai-translation],[data-ai-toolbar]';
  const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,dt,dd,figcaption,div,section,article,main,header,footer,nav,aside,body';
  const inserted = new Set();
  let runId = 0;
  let toolbar;

  function restore() {
    runId++;
    for (const node of inserted) node.remove();
    inserted.clear();
    toolbar?.remove(); toolbar = null;
  }
  function visible(element) {
    if (!element.getClientRects().length) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return true;
  }
  function textOf(nodes) {
    return nodes.map(node => node.nodeType === Node.ELEMENT_NODE ? '\n' : node.textContent).join('').replace(/[^\S\n]+/g, ' ').trim();
  }
  function collect() {
    const groups = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const isBreak = node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR';
      if (node.nodeType === Node.ELEMENT_NODE && !isBreak) continue;
      const parent = node.parentElement;
      if (!parent || (!isBreak && !node.textContent) || parent.closest(SKIP) || !visible(parent)) continue;
      const block = parent.closest(BLOCK) || parent;
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block).push(node);
    }
    const items = []; let characters = 0; let limited = false;
    for (const [element, nodes] of groups) {
      const text = textOf(nodes);
      if (!/\p{L}/u.test(text)) continue;
      if (items.length >= 300 || characters + text.length > 120000) { limited = true; continue; }
      characters += text.length;
      items.push({ element, nodes, text });
    }
    return { items, limited };
  }
  function createToolbar() {
    const host = document.createElement('div');
    host.dataset.aiToolbar = ''; host.setAttribute('translate', 'no');
    host.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;display:block!important;max-width:calc(100vw - 40px)!important';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{color-scheme:light}section{font:13px/1.6 "PingFang SC",sans-serif;background:#233c34;color:#f5f3ed;border:1px solid #6a7d61;border-radius:9px;padding:13px 16px;box-shadow:0 4px 24px #0003;max-width:380px}p{margin:0 0 8px;overflow-wrap:anywhere}button{font:inherit;border:1px solid #91a080;border-radius:4px;padding:4px 10px;background:transparent;color:#dbed8d;cursor:pointer;margin:0 8px 0 0}button:focus-visible{outline:2px solid #dbed8d;outline-offset:2px}';
    const section = document.createElement('section'); section.setAttribute('aria-label', '译存网页翻译');
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const stop = document.createElement('button'); stop.textContent = '停止';
    stop.onclick = () => { runId++; status.textContent = '已停止，已显示的译文会保留。'; stop.disabled = true; };
    const reset = document.createElement('button'); reset.textContent = '恢复原文'; reset.onclick = restore;
    section.append(status, stop, reset); shadow.append(style, section); document.documentElement.append(host);
    toolbar = host;
    return { status, stop };
  }
  async function translateText(text, token) {
    const response = await chrome.runtime.sendMessage({ type: 'pageTranslate', token, text });
    if (!response?.ok) throw new Error(response?.error || '插件连接失败，请刷新网页后重试。');
    return response.data.text;
  }
  function showTranslation(item, text, target) {
    const host = document.createElement('span'); host.dataset.aiTranslation = ''; host.setAttribute('translate', 'no');
    host.style.cssText = 'display:block!important;margin:0.45em 0!important;white-space:normal!important';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = 'span{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-size:0.92em;line-height:1.7;font-weight:400;border-inline-start:2px solid #94a77a;padding-inline-start:0.7em;opacity:0.9}';
    const span = document.createElement('span'); span.textContent = text;
    const langs = { '简体中文': 'zh-CN', '繁體中文': 'zh-TW', English: 'en', '日本語': 'ja', '한국어': 'ko', Français: 'fr', Deutsch: 'de', Español: 'es' };
    span.lang = langs[target] || ''; span.dir = 'auto';
    shadow.append(style, span); item.element.append(host); inserted.add(host);
  }
  function start(token, target) {
    restore();
    const current = runId;
    const { items, limited } = collect();
    const ui = createToolbar();
    let next = 0; let done = 0; let changed = 0; let failure = '';
    const progress = () => { ui.status.textContent = `译存 · 正在翻译 ${done} / ${items.length} 段`; };
    if (!items.length) { ui.status.textContent = '没有找到可翻译的网页文字。'; ui.stop.disabled = true; return; }
    progress();
    async function worker() {
      while (current === runId && !failure && next < items.length) {
        const item = items[next++];
        try {
          const chunks = [];
          for (let offset = 0; offset < item.text.length; offset += 12000) {
            if (current !== runId || failure) return;
            chunks.push(await translateText(item.text.slice(offset, offset + 12000), token));
          }
          if (current !== runId) return;
          // Avoid placing stale text on pages that re-render while a request runs.
          const fresh = item.nodes.every(node => item.element.contains(node)) && textOf(item.nodes) === item.text;
          if (item.element.isConnected && fresh) showTranslation(item, chunks.join('\n'), target);
          else changed++;
          done++; progress();
        } catch (error) { failure = error.message; }
      }
    }
    Promise.all([worker(), worker()]).then(() => {
      if (current !== runId) return;
      ui.stop.disabled = true;
      ui.status.textContent = failure ? `已完成 ${done} / ${items.length} 段。${failure} 可重新点击「翻译当前网页」重试。` : `翻译完成 · ${done - changed} 段${changed ? `，${changed} 段因网页变化跳过` : ''}${limited ? '（达到单页 300 段 / 120,000 字符上限）' : ''}。`;
    }).catch(error => { if (current === runId) { ui.status.textContent = error.message; ui.stop.disabled = true; } });
  }
  globalThis.__yiCunPage = { start, restore };
})();
