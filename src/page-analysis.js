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
  function heightConstrained(element, style) {
    if (style.maxHeight !== 'none') return true;
    // getComputedStyle resolves auto height to pixels. Typed OM preserves auto.
    let height = element.style.height;
    try { height = element.computedStyleMap?.().get('height')?.toString() || height; } catch { /* Fall back to the inline declaration and actual clipping. */ }
    return !!height && !['auto', 'min-content', 'max-content', 'fit-content'].includes(height) || element.scrollHeight > element.clientHeight + 1;
  }
  function modeFor(element, root) {
    if (element.closest('table,[role="grid"],[role="treegrid"],[role="table"],[role="feed"]')) return 'tooltip';
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (Number(style.webkitLineClamp) > 0) return 'tooltip';
      // A page's scroll/flex/grid shell is not a constraint on paragraph flow.
      if (node === root && node !== element) break;
      if (['absolute', 'fixed', 'sticky'].includes(style.position)) return 'tooltip';
      if (/hidden|clip|auto|scroll/.test(style.overflowY) && heightConstrained(node, style)) return 'tooltip';
      const layout = /^(inline-)?(flex|grid)$/.test(style.display);
      if (node === element && layout) return 'tooltip';
      if (node === element.parentElement && layout && node.children.length > 1) {
        const grid = style.display.includes('grid');
        const tracks = style.gridTemplateColumns.replace(/\[[^\]]*\]/g, '').trim().split(/\s+/);
        // Single-column, auto-height grids are ordinary vertical reading flow.
        if (grid ? tracks.length > 1 || style.gridAutoFlow.includes('column') : style.flexDirection !== 'column') return 'tooltip';
      }
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
