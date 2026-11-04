// Runs only in Chrome's isolated content-script world after an explicit page action.
(() => {
  if (globalThis.__yiCunPage) return;
  const content = globalThis.__yiCunContent;
  const inserted = new Set();
  let runId = 0;
  let toolbar;
  let stopSession = () => {};
  function removeTranslation(host) {
    if (host) { host.remove(); inserted.delete(host); }
  }
  function restore() {
    stopSession(); runId++;
    for (const node of inserted) node.remove();
    inserted.clear();
    toolbar?.remove(); toolbar = null;
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
      const label = { running: '翻译中', paused: '已停止', complete: '已完成', waiting: '待阅读', hover: '待悬停', error: '需重试', empty: '无正文' }[state];
      badge.textContent = label; reopen.textContent = `译存 · ${label}`;
      stop.hidden = !['running', 'waiting', 'hover', 'empty'].includes(state);
    };
    stop.onclick = () => { stopSession(); runId++; status.textContent = '已停止，已显示的译文会保留。'; stop.disabled = true; setState('paused'); };
    minimize.onclick = () => { section.hidden = true; reopen.hidden = false; reopen.focus(); };
    reopen.onclick = () => { section.hidden = false; reopen.hidden = true; minimize.focus(); };
    setState('running');
    actions.append(stop, reset); section.append(header, status, progress, actions); shadow.append(style, section, reopen); document.documentElement.append(host);
    toolbar = host;
    return { status, stop, progress, setState, scope: language };
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
    return host;
  }
  function createTooltip() {
    const host = document.createElement('div'); host.dataset.aiTooltip = ''; host.setAttribute('translate', 'no');
    host.style.cssText = 'all:initial!important;display:none!important;position:fixed!important;z-index:2147483647!important;max-width:calc(100vw - 24px)!important';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `section{box-sizing:border-box;width:340px;max-width:calc(100vw - 24px);max-height:min(360px,60vh);overflow:auto;padding:14px 16px;border:1px solid #9eae91;border-radius:10px;background:#fffef9;color:#233c34;box-shadow:0 6px 28px #152b2133;font:14px/1.8 "PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:normal;text-align:start}header{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#68786c;margin-bottom:8px}button{font:inherit;border:0;background:transparent;color:inherit;cursor:pointer;padding:2px 5px}p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}@media(prefers-color-scheme:dark){section{background:#202b25;color:#edf1e6;border-color:#60735e}header{color:#abb9a6}}`;
    const box = document.createElement('section'); box.setAttribute('aria-label', '悬浮译文');
    const header = document.createElement('header'); const title = document.createElement('span'); title.textContent = '译存 · 悬浮译文';
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', '关闭悬浮译文');
    const body = document.createElement('p'); body.setAttribute('role', 'status'); body.setAttribute('aria-live', 'polite');
    header.append(title, close); box.append(header, body); shadow.append(style, box); document.documentElement.append(host);
    const hide = () => host.style.setProperty('display', 'none', 'important'); close.onclick = hide;
    return {
      host, hide,
      show(text, element) {
        body.textContent = text; host.style.setProperty('display', 'block', 'important');
        const anchor = element.getBoundingClientRect(); const bounds = host.getBoundingClientRect();
        host.style.setProperty('left', `${Math.max(12, Math.min(anchor.left, innerWidth - bounds.width - 12))}px`, 'important');
        host.style.setProperty('top', `${Math.max(12, Math.min(anchor.bottom + 8, innerHeight - bounds.height - 12))}px`, 'important');
      }
    };
  }
  function start(token, target) {
    restore();
    const current = runId;
    const ui = createToolbar(target);
    const records = new Map();
    const queue = [];
    const observed = new Set();
    const viewportPending = new Set();
    const budgeted = new Set();
    const route = () => location.origin + location.pathname + location.search + (/^#!?\//.test(location.hash) ? location.hash : '');
    const startRoute = route();
    let stopped = false; let active = 0; let characters = 0; let limited = false; let failure = '';
    let scanTimer; let firstMutation = 0; let hoverTimer; let hideTimer; let hovered; let tooltip;
    const comparable = value => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
    const alive = record => !stopped && current === runId && records.get(record.item.key) === record;
    function update() {
      if (stopped || current !== runId) return;
      const all = [...records.values()];
      const done = all.filter(record => ['done', 'identical'].includes(record.status)).length;
      const shown = all.filter(record => record.host?.isConnected).length;
      const same = all.filter(record => record.status === 'identical').length;
      const hoverReady = all.filter(record => record.item.mode === 'tooltip' && record.status === 'done').length;
      const hoverWaiting = all.filter(record => record.item.mode === 'tooltip' && record.status === 'idle').length;
      const inlineWaiting = all.filter(record => record.item.mode === 'inline' && record.status === 'idle').length;
      const inlineDone = all.some(record => record.item.mode === 'inline' && ['done', 'identical'].includes(record.status));
      const busy = active || queue.length;
      ui.progress.max = Math.max(1, all.length); ui.progress.value = done;
      ui.setState(failure ? 'error' : busy || viewportPending.size ? 'running' : !all.length ? 'empty' : all.every(record => record.item.mode === 'tooltip') ? 'hover' : 'waiting');
      const details = [`已识别 ${all.length} 段`];
      if (shown) details.push(`正文已显示 ${shown} 段`);
      if (hoverReady) details.push(`已备好 ${hoverReady} 段悬浮译文`);
      if (same) details.push(`${same} 段与原文相同已隐藏`);
      const counts = details.join('，');
      const pending = [inlineWaiting ? `${inlineWaiting} 段待滚动到正文后翻译` : '', hoverWaiting ? `${hoverWaiting} 段需将鼠标停留在原文上翻译` : ''].filter(Boolean).join('；');
      let message;
      if (failure) message = `${counts}。${failure} 重新点击「翻译当前网页」可重试。`;
      else if (busy) message = `正在翻译 ${done} / ${all.length} 段 · ${counts}`;
      else if (viewportPending.size) message = '正在识别可视正文…';
      else if (!all.length) message = '未找到可翻译正文，正在等待页面内容。也可使用划词翻译。';
      else if (inlineDone) message = `当前可见正文翻译完成 · ${counts}。${pending || '继续监听正文更新。'}`;
      else if (hoverReady || same) message = `悬浮翻译已就绪 · ${counts}。${pending || '停留在原文上查看。'}`;
      else message = `${counts}，尚未开始翻译。${pending}。`;
      ui.status.textContent = message + (limited ? '已达本次 300 段 / 120,000 字符上限。' : '');
    }
    function halt() {
      if (stopped) return;
      stopped = true; queue.length = 0;
      intersection.disconnect(); mutations.disconnect();
      clearTimeout(scanTimer); clearTimeout(hoverTimer); clearTimeout(hideTimer);
      document.removeEventListener('pointerover', onOver, true); document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('focusin', onOver, true); document.removeEventListener('focusout', onOut, true); document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', hideTooltip, true); window.removeEventListener('resize', hideTooltip); window.removeEventListener('popstate', checkRoute);
      tooltip?.host.remove(); stopSession = () => {};
    }
    stopSession = halt;
    function checkRoute() {
      if (route() === startRoute) return true;
      halt(); ui.setState('paused'); ui.status.textContent = '网页已切换，请重新点击「翻译当前网页」。'; return false;
    }
    function enqueue(record) {
      if (!alive(record) || failure || !checkRoute() || record.status !== 'idle') return;
      if (!budgeted.has(record.item.text)) {
        if (budgeted.size >= 300 || characters + record.item.text.length > 120000) { limited = true; update(); return; }
        budgeted.add(record.item.text); characters += record.item.text.length;
      }
      record.status = 'queued'; queue.push(record); pump();
    }
    async function execute(record) {
      const snapshot = record.item;
      try {
        const chunks = [];
        for (let offset = 0; offset < snapshot.text.length; offset += 12000) {
          if (!alive(record) || !checkRoute()) return;
          chunks.push(await translateText(snapshot.text.slice(offset, offset + 12000), token));
        }
        if (!alive(record) || !checkRoute()) return;
        if (!content.fresh(snapshot)) { record.status = 'stale'; scheduleScan(); return; }
        record.translation = chunks.join('\n');
        record.status = comparable(record.translation) === comparable(snapshot.text) ? 'identical' : 'done';
        if (record.status === 'done' && record.item.mode === 'inline') record.host = showTranslation(record.item, record.translation, target);
        if (hovered === record && tooltip) tooltip.show(record.status === 'identical' ? '与原文相同。' : record.translation, record.item.element);
      } catch (error) {
        if (alive(record)) { record.status = 'error'; failure = error.message; queue.length = 0; if (hovered === record) tooltip?.show(error.message, record.item.element); }
      } finally { active--; pump(); }
    }
    function pump() {
      if (stopped || current !== runId) return;
      while (!failure && active < 2 && queue.length) {
        const record = queue.shift();
        if (!alive(record)) continue;
        active++; record.status = 'running'; void execute(record);
      }
      update();
    }
    const intersection = new IntersectionObserver(entries => {
      for (const entry of entries) {
        viewportPending.delete(entry.target);
        if (!entry.isIntersecting) continue;
        for (const record of records.values()) if (record.item.element === entry.target && record.item.mode === 'inline') enqueue(record);
        intersection.unobserve(entry.target); observed.delete(entry.target);
      }
      update();
    }, { rootMargin: '200px 0px' });
    function scan() {
      scanTimer = undefined; firstMutation = 0;
      if (stopped || !checkRoute()) return;
      const result = content.collect(); limited ||= result.limited;
      ui.scope.textContent = `${result.label} → ${target}`;
      const seen = new Set();
      for (const item of result.items) {
        seen.add(item.key);
        let record = records.get(item.key);
        if (record && record.item.text !== item.text) { removeTranslation(record.host); records.delete(item.key); record = null; }
        if (!record) { record = { item, status: 'idle', host: null, translation: null }; records.set(item.key, record); }
        else {
          if (record.host && !record.host.isConnected) {
            record.remounts = (record.remounts || 0) + 1;
            if (record.remounts >= 2) record.forcedTooltip = true;
          }
          if (record.forcedTooltip) item.mode = 'tooltip';
          record.item = item;
          if (record.host && (!record.host.isConnected || item.mode !== 'inline')) { removeTranslation(record.host); record.host = null; }
          // Framework re-renders may remove only our node. Reuse the result without a new request.
          if (record.status === 'done' && !record.host && item.mode === 'inline') record.host = showTranslation(item, record.translation, target);
          if (record.status === 'stale') record.status = 'idle';
        }
        if (record.status === 'idle' && item.mode === 'inline' && !observed.has(item.element)) {
          observed.add(item.element); viewportPending.add(item.element); intersection.observe(item.element);
        }
      }
      for (const [key, record] of records) if (!seen.has(key)) {
        removeTranslation(record.host); records.delete(key);
        if (hovered === record) { hovered = null; tooltip?.hide(); }
      }
      const waitingElements = new Set([...records.values()].filter(record => record.status === 'idle' && record.item.mode === 'inline').map(record => record.item.element));
      for (const element of observed) if (!waitingElements.has(element)) { intersection.unobserve(element); observed.delete(element); viewportPending.delete(element); }
      update();
    }
    function scheduleScan() {
      if (stopped) return;
      firstMutation ||= Date.now(); clearTimeout(scanTimer);
      scanTimer = setTimeout(scan, Math.min(250, Math.max(0, 1000 - (Date.now() - firstMutation))));
    }
    const mutations = new MutationObserver(changes => {
      if (changes.some(change => {
        if (content.owned(change.target)) return false;
        return change.type !== 'childList' || change.removedNodes.length || [...change.addedNodes].some(node => !content.owned(node));
      })) scheduleScan();
    });
    function hideTooltip() { clearTimeout(hoverTimer); clearTimeout(hideTimer); hovered = null; tooltip?.hide(); }
    function onKey(event) { if (event.key === 'Escape') hideTooltip(); }
    function onOver(event) {
      if (stopped || content.owned(event.target) || !checkRoute()) return;
      let match;
      for (const record of records.values()) if (record.item.mode === 'tooltip' && record.item.element.contains(event.target) && (!match || match.item.element.contains(record.item.element))) match = record;
      if (!match) return;
      clearTimeout(hideTimer);
      if (hovered === match) return;
      tooltip?.hide();
      clearTimeout(hoverTimer); hovered = match;
      hoverTimer = setTimeout(() => {
        if (!alive(match) || hovered !== match || !content.fresh(match.item)) return;
        tooltip ||= createTooltip();
        tooltip.show(match.status === 'identical' ? '与原文相同。' : match.translation || '正在翻译…', match.item.element);
        enqueue(match);
      }, event.type === 'focusin' ? 0 : 350);
    }
    function onOut(event) {
      if (!hovered) return;
      const next = event.relatedTarget;
      if (next instanceof Node && (hovered.item.element.contains(next) || tooltip?.host.contains(next))) return;
      clearTimeout(hideTimer); hideTimer = setTimeout(hideTooltip, 160);
    }
    scan();
    mutations.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'translate', 'contenteditable'] });
    document.addEventListener('pointerover', onOver, true); document.addEventListener('pointerout', onOut, true);
    document.addEventListener('focusin', onOver, true); document.addEventListener('focusout', onOut, true); document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', hideTooltip, true); window.addEventListener('resize', hideTooltip); window.addEventListener('popstate', checkRoute);
  }
  globalThis.__yiCunPage = { start, restore };
})();
