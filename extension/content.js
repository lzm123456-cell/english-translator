// ===== 状态 =====
let translationCache = null;       // [{ original, translated }, ...]
let tooltipEl = null;
let statusEl = null;
let visible = false;

// ===== 消息监听（来自 popup） =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'startTranslation':
      startTranslation();
      break;
    case 'setTranslationCache':
      translationCache = request.paragraphs;
      break;
  }
});

// ===== 预翻译：提取全部可见文本 → 分割为句子 =====

function isVisible(el) {
  if (!el || el === document.body) return true;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0' &&
         el.offsetParent !== null;
}

function isNoise(el) {
  return !!el.closest(
    'nav, header, footer, .nav, .menu, .sidebar, [role="navigation"], ' +
    '[role="menubar"], .navbar, .footer, .header'
  );
}

function splitSentences(text) {
  // 保护常见缩写中的句点
  let s = text.replace(
    /\b(Fig|Figs|e\.g|i\.e|et al|vs|Dr|Mr|Mrs|Ms|Prof|St|Ave|Dept|Univ|Inc|Ltd|Co|Corp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./g,
    (m) => m.replace('.', '\u0000')
  );

  // 分割：英文 .!? + 空格 + 大写字母 ｜ 中文句号感叹号问号
  const raw = s.split(
    /(?<=[.!?])\s+(?=[A-Z"'(])|(?<=[。！？])/
  );

  return raw
    .map(p => p.replace(/\u0000/g, '.').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 15);
}

function extractSentences() {
  // 覆盖面更广的选择器，捕获所有文本承载元素
  const selector = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'blockquote', 'td', 'th', 'dd', 'dt',
    'figcaption', 'caption', 'label', 'legend',
    'article', 'section', 'main', 'aside',
    'div', 'span', 'a', 'small', 'strong', 'em',
    'b', 'i', 'u', 'cite', 'q', 'sup', 'sub',
    'abbr', 'dfn', 'code'
  ].join(', ');

  const elements = document.querySelectorAll(selector);
  const allSentences = [];
  const seen = new Set();

  for (const el of elements) {
    if (!isVisible(el)) continue;
    if (isNoise(el)) continue;

    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (text.length < 20) continue;
    if (/^[\d\s\-•·.,;:!?()'"《》【】\[\]]+$/.test(text)) continue;

    // 拆分为句子
    const parts = splitSentences(text);
    for (const part of parts) {
      // 去重
      const key = part.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      allSentences.push(part);
    }
  }

  return allSentences;
}

async function startTranslation() {
  const sentences = extractSentences();
  if (sentences.length === 0) {
    showStatus('未找到可翻译的文本内容');
    setTimeout(hideStatus, 2000);
    return;
  }

  showStatus(`正在逐句翻译 ${sentences.length} 句...`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'translate',
      paragraphs: sentences,
      url: window.location.href
    });

    if (response.success) {
      translationCache = response.paragraphs;
      showStatus(`✓ 翻译完成，共 ${response.paragraphs.length} 句`);
      setTimeout(hideStatus, 2500);
    } else {
      showStatus('✗ ' + response.error);
      setTimeout(hideStatus, 4000);
    }
  } catch (error) {
    showStatus('✗ 请求失败: ' + error.message);
    setTimeout(hideStatus, 4000);
  }
}

// ===== J 键查译 =====

let keyDownTimer = null;

document.addEventListener('keydown', (e) => {
  if ((e.key === 'j' || e.key === 'J') &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {

    if (keyDownTimer) return;
    keyDownTimer = setTimeout(() => { keyDownTimer = null; }, 200);

    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length === 0) return;

    e.preventDefault();

    if (visible) {
      hideTooltip();
    } else {
      showTranslation(text, selection);
    }
  }

  if (e.key === 'Escape' && visible) {
    hideTooltip();
  }
});

document.addEventListener('mousedown', (e) => {
  if (visible && tooltipEl && !tooltipEl.contains(e.target)) {
    hideTooltip();
  }
});

function showTranslation(selectedText, selection) {
  if (!translationCache) {
    showStatus('提示：请先点击插件图标 → 翻译本文');
    setTimeout(hideStatus, 3000);
    return;
  }

  // 先找精确句子匹配
  let match = findExactMatch(selectedText);

  // 找不到则找模糊匹配
  if (!match) {
    match = findFuzzyMatch(selectedText);
  }

  if (!match) {
    showStatus('未找到对应的译文，试试多选几个词');
    setTimeout(hideStatus, 2500);
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  showTooltip(match.translated, match.original, rect);
}

// ===== 句子级文本匹配 =====

function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function findExactMatch(text) {
  if (!translationCache) return null;
  const clean = normalize(text).toLowerCase();

  for (const item of translationCache) {
    const orig = normalize(item.original).toLowerCase();
    // 选中是原文子串，或原文是选中子串
    if (orig.includes(clean) || clean.includes(orig)) {
      return item;
    }
  }
  return null;
}

function findFuzzyMatch(text) {
  if (!translationCache) return null;
  const clean = normalize(text).toLowerCase();
  const wordsA = clean.split(/\s+/).filter(w => w.length > 2);
  if (wordsA.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const item of translationCache) {
    const orig = normalize(item.original).toLowerCase();
    const wordsB = orig.split(/\s+/).filter(w => w.length > 2);
    if (wordsB.length === 0) continue;

    // Jaccard 相似度
    let intersect = 0;
    for (const w of wordsA) {
      if (wordsB.includes(w)) intersect++;
    }
    const union = wordsA.length + wordsB.length - intersect;
    const jaccard = union > 0 ? intersect / union : 0;

    // 得分 = Jaccard × 句子长度（偏向匹配更长的原文）
    const score = jaccard * orig.length;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore > 3 ? best : null;
}

// ===== 悬浮框 =====

function showTooltip(translatedText, originalText, rect) {
  hideTooltip();

  tooltipEl = document.createElement('div');
  tooltipEl.id = 'trans-tooltip';
  tooltipEl.className = 'trans-tooltip';

  // 标签
  const label = document.createElement('div');
  label.className = 'trans-tooltip-label';
  label.textContent = '译文';
  tooltipEl.appendChild(label);

  // 译文内容
  const content = document.createElement('div');
  content.className = 'trans-tooltip-content';
  content.textContent = translatedText;
  tooltipEl.appendChild(content);

  // 原文引用
  const orig = document.createElement('div');
  orig.className = 'trans-tooltip-original';
  const shortOrig = originalText.length > 120
    ? originalText.slice(0, 117) + '...'
    : originalText;
  orig.textContent = '原文: ' + shortOrig;
  tooltipEl.appendChild(orig);

  // 关闭按钮
  const closeBtn = document.createElement('span');
  closeBtn.className = 'trans-tooltip-close';
  closeBtn.textContent = '✕';
  tooltipEl.appendChild(closeBtn);

  document.body.appendChild(tooltipEl);
  positionTooltip(tooltipEl, rect);
  visible = true;
}

function positionTooltip(el, rect) {
  const maxWidth = Math.min(520, window.innerWidth - 40);
  el.style.maxWidth = maxWidth + 'px';

  let top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;

  if (left + maxWidth > window.innerWidth - 20) {
    left = Math.max(16, window.innerWidth - maxWidth - 16);
  }
  if (left < 16) left = 16;

  el.style.left = left + 'px';
  el.style.top = top + 'px';

  const viewportBottom = window.scrollY + window.innerHeight;
  const elBottom = top + el.offsetHeight + 16;
  if (elBottom > viewportBottom) {
    top = rect.top + window.scrollY - el.offsetHeight - 8;
    if (top < window.scrollY + 8) {
      top = window.scrollY + 8;
    }
    el.style.top = top + 'px';
  }

  requestAnimationFrame(() => {
    el.classList.add('visible');
  });
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.classList.remove('visible');
    tooltipEl.remove();
    tooltipEl = null;
  }
  visible = false;
}

// ===== 状态提示 =====

function showStatus(msg) {
  hideStatus();
  statusEl = document.createElement('div');
  statusEl.id = 'trans-status';
  statusEl.className = 'trans-status';
  statusEl.textContent = msg;
  document.body.appendChild(statusEl);

  requestAnimationFrame(() => {
    statusEl.classList.add('visible');
  });
}

function hideStatus() {
  if (statusEl) {
    statusEl.classList.remove('visible');
    statusEl.remove();
    statusEl = null;
  }
}
