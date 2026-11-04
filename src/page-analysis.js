// Content analysis stays in the isolated world; it never changes original page nodes.
(() => {
  if (globalThis.__yiCunContent) return;
  const OWN = '[data-ai-translation],[data-ai-toolbar],[data-ai-tooltip]';
  const SKIP = `nav,header:not(article header):not(main header):not([role="article"] header):not([role="main"] header),[role="banner"],footer,aside,time,[role="navigation"],[role="menu"],[role="menubar"],[role="tablist"],[role="button"],[role="textbox"],[role="dialog"],dialog,form,script,style,noscript,textarea,input,select,button,pre,svg,canvas,math,iframe,[contenteditable]:not([contenteditable="false"]),[translate="no"],[hidden],[inert],[aria-hidden="true"],${OWN}`;
  const SEMANTIC = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,caption,dt,dd,figcaption';
  const BLOCK = `${SEMANTIC},div,section,article,main,body`;
  function visible(element) {
    if (!element.getClientRects().length) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const clip = style.clip.match(/^rect\((.*)\)$/)?.[1].split(/[ ,]+/).map(parseFloat);
      if ((clip?.length === 4 && (clip[0] === clip[2] || clip[1] === clip[3])) || style.clipPath === 'inset(50%)') return false;
      if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') return false;
    }
    return true;
  }
  function textOf(nodes) {
    return nodes.map(node => node.nodeType === Node.ELEMENT_NODE ? '\n' : node.textContent).join('').replace(/[^\S\n]+/g, ' ').trim();
  }
  const topLevel = elements => elements.filter(element => !elements.some(other => other !== element && other.contains(element)));
  function roots() {
    // GitHub's rendered Markdown is content; repository controls and file tables are not.
    if (location.hostname === 'github.com') {
      const markdown = [...document.querySelectorAll('.markdown-body,[data-testid="issue-body"],[data-testid="comment-body"]')].filter(visible);
      if (markdown.length) return { elements: topLevel(markdown), label: 'GitHub 正文' };
    }
    const articles = [...document.querySelectorAll('article,[role="article"]')].filter(element => visible(element) && element.textContent.trim().length >= 160 && element.querySelector('p'));
    if (articles.length) return { elements: topLevel(articles), label: '文章正文' };
    const mains = [...document.querySelectorAll('main,[role="main"],#repos-split-pane-content')].filter(visible);
    if (mains.length) return { elements: topLevel(mains), label: '主要内容' };
    return { elements: document.body ? [document.body] : [], label: '通用正文' };
  }
  function modeFor(element, root) {
    if (element.closest('table,[role="grid"],[role="treegrid"],[role="table"],[role="feed"]')) return 'tooltip';
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (['absolute', 'fixed', 'sticky'].includes(style.position) || style.webkitLineClamp !== 'none' && Number(style.webkitLineClamp) > 0) return 'tooltip';
      if (/hidden|clip|auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)) return 'tooltip';
      // Adding a child changes flex/grid participation, even if it looks like prose.
      if (/^(inline-)?(flex|grid)$/.test(style.display) && (node === element || style.flexDirection !== 'column' && node.children.length > 1)) return 'tooltip';
      if (node === root) break;
    }
    return 'inline';
  }
  function collect() {
    const selected = roots();
    const groups = [];
    for (const root of selected.elements) {
      let current;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches(SKIP)) return NodeFilter.FILTER_REJECT;
            return node.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP) || !visible(parent)) continue;
        const literal = parent.closest('code,kbd,samp');
        if (literal && !literal.closest(SEMANTIC)) continue;
        const element = parent.closest(BLOCK) || parent;
        if (!root.contains(element) && element !== root) continue;
        if (!current || current.element !== element) { current = { element, nodes: [], root }; groups.push(current); }
        current.nodes.push(node);
      }
    }
    const items = []; let characters = 0; let limited = false;
    for (const group of groups) {
      const text = textOf(group.nodes);
      if (!/\p{L}/u.test(text)) continue;
      // Short generic labels are usually names, counters, or application chrome.
      if (text.length < 24 && !group.element.matches(SEMANTIC) && !/[.!?。！？]/u.test(text)) continue;
      if (items.length >= 300 || characters + text.length > 120000) { limited = true; continue; }
      characters += text.length;
      const key = group.nodes.find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (key) items.push({ ...group, key, text, mode: modeFor(group.element, group.root) });
    }
    return { items, limited, label: selected.label };
  }
  function fresh(item) {
    return item.element.isConnected && !item.element.closest(SKIP) && visible(item.element) && item.nodes.every(node => item.element.contains(node)) && textOf(item.nodes) === item.text;
  }
  globalThis.__yiCunContent = { collect, fresh, owned: node => !!(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest(OWN) };
})();
