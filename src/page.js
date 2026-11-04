// Runs only in Chrome's isolated content-script world after an explicit page action.
(() => {
  if (globalThis.__yiCunPage) return;
  const SKIP = 'script,style,noscript,textarea,input,select,button,pre,svg,canvas,math,iframe,[contenteditable]:not([contenteditable="false"]),[translate="no"],[hidden],[inert],[aria-hidden="true"],[data-ai-translation],[data-ai-toolbar]';
  const INLINE_CONTEXT = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,dt,dd,figcaption';
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
    const groups = [];
    let currentGroup;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const isBreak = node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR';
      if (node.nodeType === Node.ELEMENT_NODE && !isBreak) continue;
      const parent = node.parentElement;
      if (!parent || (!isBreak && !node.textContent) || parent.closest(SKIP) || !visible(parent)) continue;
      const literal = parent.closest('code,kbd,samp');
      if (literal && !literal.closest(INLINE_CONTEXT)) continue;
      const block = parent.closest(BLOCK) || parent;
      if (!currentGroup || currentGroup.element !== block) {
        currentGroup = { element: block, nodes: [] };
        groups.push(currentGroup);
      }
      currentGroup.nodes.push(node);
    }
    const items = []; let characters = 0; let limited = false;
    for (const { element, nodes } of groups) {
      const text = textOf(nodes);
      if (!/\p{L}/u.test(text)) continue;
      if (items.length >= 300 || characters + text.length > 120000) { limited = true; continue; }
      characters += text.length;
      items.push({ element, nodes, text });
    }
    return { items, limited };
  }
  function createToolbar(target) {
    const host = document.createElement('div');
    host.dataset.aiToolbar = ''; host.setAttribute('translate', 'no');
    host.style.cssText = 'all:initial!important;position:fixed!important;right:max(16px,env(safe-area-inset-right))!important;bottom:max(16px,env(safe-area-inset-bottom))!important;z-index:2147483647!important;display:block!important;max-width:calc(100vw - 32px)!important';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host{color-scheme:light dark;--paper:#fffef9;--ink:#233c34;--muted:#68786c;--line:#dce3d8;--accent:#dbeaab;--track:#e9eee3}
      *{box-sizing:border-box} [hidden]{display:none!important}
      section,.reopen{font:13px/1.6 "Avenir Next","PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:normal;text-align:start;text-transform:none;color:var(--ink);background:var(--paper);border:1px solid var(--line);box-shadow:0 8px 32px #152b2120,0 2px 6px #152b2110}
      section{width:320px;max-width:calc(100vw - 32px);padding:16px;border-radius:14px;animation:arrive .18s ease-out}
      header{display:flex;align-items:center;gap:10px}.mark{display:grid;place-items:center;width:30px;height:34px;border-radius:5px;background:var(--ink);color:var(--accent);font:23px "Songti SC",serif}
      .identity{flex:1}.name{font-size:14px;font-weight:650}.language{color:var(--muted);font-size:10px;margin-top:1px}.state{font-size:10px;color:var(--muted);white-space:nowrap}.state::before{content:"";display:inline-block;width:5px;height:5px;margin-inline-end:5px;border-radius:50%;background:#739450}
      p{margin:14px 0 10px;font-size:12px;line-height:1.65;overflow-wrap:anywhere;max-height:120px;overflow:auto}
      progress{display:block;appearance:none;width:100%;height:4px;border:0;border-radius:4px;overflow:hidden;background:var(--track);accent-color:#739450;margin:0 0 14px}progress::-webkit-progress-bar{background:var(--track)}progress::-webkit-progress-value{background:#739450;border-radius:4px}
      .actions{display:flex;align-items:center;gap:8px}button{font:inherit;cursor:pointer;transition:background .15s,border-color .15s}button:focus-visible{outline:2px solid #7b9559;outline-offset:3px}
      .restore,.stop{padding:7px 12px;border-radius:6px;font-size:11px}.restore{background:var(--ink);color:var(--accent);border:1px solid var(--ink);flex:1}.restore:hover{filter:brightness(1.15)}.stop{background:transparent;border:1px solid var(--line);color:var(--ink)}.stop:hover{background:var(--track)}button:disabled{opacity:.45;cursor:default}
      .minimize{display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:5px;background:transparent;color:var(--muted);font-size:18px}.minimize:hover{background:var(--track)}
      .reopen{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:24px;font-size:12px}.reopen::before{content:"译";font-family:"Songti SC",serif;color:var(--muted)}
      section[data-state="error"] .state{color:#a84737}section[data-state="error"] .state::before{background:#b65643}
      @keyframes arrive{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-color-scheme:dark){:host{--paper:#202b25;--ink:#edf1e6;--muted:#abb9a6;--line:#405044;--accent:#263921;--track:#354337}.mark{background:#dbeaab;color:#233c34}.restore{background:#dbeaab;border-color:#dbeaab;color:#233c34}}
      @media(max-width:420px){section{width:288px;padding:14px}.restore,.stop{min-height:36px}}
      @media(prefers-reduced-motion:reduce){section{animation:none}button{transition:none}}
    `;
    const section = document.createElement('section'); section.setAttribute('aria-label', '译存网页翻译');
    const header = document.createElement('header');
    const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = '译'; mark.setAttribute('aria-hidden', 'true');
    const identity = document.createElement('div'); identity.className = 'identity';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = '译存 · 双语阅读';
    const language = document.createElement('div'); language.className = 'language'; language.textContent = `自动识别 → ${target}`;
    identity.append(name, language);
    const badge = document.createElement('span'); badge.className = 'state';
    const minimize = document.createElement('button'); minimize.className = 'minimize'; minimize.textContent = '−'; minimize.setAttribute('aria-label', '收起翻译工具栏'); minimize.title = '收起工具栏，翻译继续';
    header.append(mark, identity, badge, minimize);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const progress = document.createElement('progress'); progress.setAttribute('aria-label', '网页翻译进度'); progress.max = 1; progress.value = 0;
    const actions = document.createElement('div'); actions.className = 'actions';
    const stop = document.createElement('button'); stop.className = 'stop'; stop.textContent = '停止';
    const reset = document.createElement('button'); reset.className = 'restore'; reset.textContent = '恢复原文'; reset.onclick = restore;
    const reopen = document.createElement('button'); reopen.className = 'reopen'; reopen.hidden = true; reopen.setAttribute('aria-label', '展开翻译工具栏');
    const setState = state => {
      section.dataset.state = state;
      const label = { running: '翻译中', paused: '已停止', complete: '已完成', error: '需重试', empty: '无正文' }[state];
      badge.textContent = label; reopen.textContent = `译存 · ${label}`;
      stop.hidden = state !== 'running';
    };
    stop.onclick = () => { runId++; status.textContent = '已停止，已显示的译文会保留。'; stop.disabled = true; setState('paused'); };
    minimize.onclick = () => { section.hidden = true; reopen.hidden = false; reopen.focus(); };
    reopen.onclick = () => { section.hidden = false; reopen.hidden = true; minimize.focus(); };
    setState('running');
    actions.append(stop, reset); section.append(header, status, progress, actions); shadow.append(style, section, reopen); document.documentElement.append(host);
    toolbar = host;
    return { status, stop, progress, setState };
  }
  async function translateText(text, token) {
    const response = await chrome.runtime.sendMessage({ type: 'pageTranslate', token, text });
    if (!response?.ok) throw new Error(response?.error || '插件连接失败，请刷新网页后重试。');
    return response.data.text;
  }
  function showTranslation(item, text, target) {
    const host = document.createElement('span'); host.dataset.aiTranslation = ''; host.setAttribute('translate', 'no');
    const heading = /^H[1-6]$/.test(item.element.tagName);
    const compact = !heading && item.text.length < 65 && !!item.element.closest('nav,header,footer,dt,th');
    const sourceStyle = getComputedStyle(item.element);
    const fontSize = Math.max(13, Math.min(parseFloat(sourceStyle.fontSize) || 16, heading ? 30 : 20));
    host.dataset.kind = heading ? 'heading' : compact ? 'compact' : 'body';
    host.style.cssText = 'all:initial!important;display:block!important;max-inline-size:100%!important;letter-spacing:normal!important;word-spacing:normal!important;text-transform:none!important;text-indent:0!important;white-space:normal!important';
    host.style.setProperty('color', sourceStyle.color, 'important');
    host.style.setProperty('font-size', `${fontSize}px`, 'important');
    host.style.setProperty('margin', compact ? '3px 0 5px' : heading ? '6px 0 8px' : '9px 0 14px', 'important');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      span{display:block;box-sizing:border-box;max-inline-size:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:.94em;line-height:1.85;font-weight:400;letter-spacing:normal;word-spacing:normal;text-align:start;color:inherit;border-inline-start:2px solid #94a77a;padding:8px 12px;background:color-mix(in srgb,currentColor 4%,transparent);border-radius:0 5px 5px 0}
      :host([data-kind="heading"]) span{font-size:.84em;font-weight:500;line-height:1.5;border:0;padding:0;background:none;border-radius:0}
      :host([data-kind="compact"]) span{font-size:.9em;line-height:1.5;border:0;padding:0;background:none;border-radius:0}
      @media(forced-colors:active){span{border-color:CanvasText;background:Canvas;color:CanvasText}}
    `;
    const span = document.createElement('span'); span.textContent = text;
    const langs = { '简体中文': 'zh-CN', '繁體中文': 'zh-TW', English: 'en', '日本語': 'ja', '한국어': 'ko', Français: 'fr', Deutsch: 'de', Español: 'es' };
    span.lang = langs[target] || ''; span.dir = 'auto';
    shadow.append(style, span);
    let anchor = item.nodes.findLast(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    while (anchor && anchor.parentNode !== item.element) anchor = anchor.parentNode;
    if (!anchor) return;
    anchor.after(host); inserted.add(host);
  }
  function start(token, target) {
    restore();
    const current = runId;
    const { items, limited } = collect();
    const ui = createToolbar(target);
    let next = 0; let done = 0; let changed = 0; let failure = '';
    const progress = () => { ui.status.textContent = `正在翻译 ${done} / ${items.length} 段`; ui.progress.max = items.length; ui.progress.value = done; };
    if (!items.length) { ui.status.textContent = '没有找到可翻译的网页文字。'; ui.stop.disabled = true; ui.setState('empty'); ui.progress.hidden = true; return; }
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
      ui.stop.disabled = true; ui.setState(failure ? 'error' : 'complete');
      ui.status.textContent = failure ? `已完成 ${done} / ${items.length} 段。${failure} 可重新点击「翻译当前网页」重试。` : `翻译完成 · ${done - changed} 段${changed ? `，${changed} 段因网页变化跳过` : ''}${limited ? '（达到单页 300 段 / 120,000 字符上限）' : ''}。`;
    }).catch(error => { if (current === runId) { ui.status.textContent = error.message; ui.stop.disabled = true; ui.setState('error'); } });
  }
  globalThis.__yiCunPage = { start, restore };
})();
