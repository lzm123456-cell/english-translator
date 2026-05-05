// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const BATCH_SIZE = 8;

// 监听来自 content.js 和 popup.js 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'translate':
      handleTranslate(request.paragraphs, request.url, sendResponse);
      return true; // 异步响应
    case 'getCachedStatus':
      handleGetCachedStatus(request.url, sendResponse);
      return true;
    case 'clearCache':
      handleClearCache(request.url, sendResponse);
      return true;
  }
});

// ===== 翻译处理 =====

async function handleTranslate(paragraphs, url, sendResponse) {
  try {
    const cacheKey = `translations:${url}`;
    const cached = await chrome.storage.local.get(cacheKey);
    const existingMap = new Map();

    // 加载已有缓存
    if (cached[cacheKey]?.paragraphs) {
      for (const p of cached[cacheKey].paragraphs) {
        existingMap.set(p.original, p.translated);
      }
    }

    // 过滤出未翻译的段落
    const toTranslate = paragraphs.filter(p => !existingMap.has(p));

    if (toTranslate.length > 0) {
      const { apiKey } = await chrome.storage.local.get('apiKey');
      if (!apiKey) {
        throw new Error('请先点击插件图标设置 API Key');
      }

      // 分批翻译
      for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
        const batch = toTranslate.slice(i, i + BATCH_SIZE);
        const translatedBatch = await translateBatch(batch, apiKey);

        for (let j = 0; j < batch.length; j++) {
          existingMap.set(batch[j], translatedBatch[j] || '');
        }
      }
    }

    // 保存到缓存
    const allParagraphs = [];
    for (const [original, translated] of existingMap) {
      allParagraphs.push({ original, translated });
    }
    await chrome.storage.local.set({
      [cacheKey]: { paragraphs: allParagraphs, timestamp: Date.now() }
    });

    sendResponse({ success: true, paragraphs: allParagraphs });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function translateBatch(paragraphs, apiKey) {
  const prompt = paragraphs.map((p, i) => `[T${i + 1}]\n${p}`).join('\n\n');

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一个英文学术翻译助手，擅长翻译学术论文和技术文章。\n\n要求：\n1. 保持学术严谨性，术语翻译准确\n2. 译文通顺自然，符合中文表达习惯\n3. 保持原文的段落结构和逻辑关系\n4. 专业术语首次出现时，在括号中标注英文原文'
        },
        {
          role: 'user',
          content: `请将以下英文段落逐段翻译成中文。按顺序返回，每段用 [T序号] 标注。\n\n${prompt}`
        }
      ],
      temperature: 0.3
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `API 请求失败 (${response.status})`);
  }

  return parseTranslations(data.choices[0].message.content, paragraphs.length);
}

function parseTranslations(text, expectedCount) {
  const results = [];
  // 匹配 [T1] [T2] ... 格式
  const regex = /\[T(\d+)\]\s*([\s\S]*?)(?=\n\[T\d+\]|$)/g;
  let match;

  const map = new Map();
  while ((match = regex.exec(text)) !== null) {
    const idx = parseInt(match[1]) - 1;
    const translation = match[2].trim();
    map.set(idx, translation);
  }

  // 按序号排列
  for (let i = 0; i < expectedCount; i++) {
    results.push(map.get(i) || '');
  }

  // 如果正则没匹配到，尝试按行数均分（兜底）
  if (results.every(r => r === '')) {
    const lines = text.split('\n').filter(l => l.trim());
    const perChunk = Math.max(1, Math.floor(lines.length / expectedCount));
    for (let i = 0; i < expectedCount; i++) {
      results[i] = lines.slice(i * perChunk, (i + 1) * perChunk).join('\n').trim();
    }
  }

  return results;
}

// ===== 缓存管理 =====

async function handleGetCachedStatus(url, sendResponse) {
  const cacheKey = `translations:${url}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]?.paragraphs) {
    sendResponse({
      success: true,
      cached: true,
      count: cached[cacheKey].paragraphs.length,
      timestamp: cached[cacheKey].timestamp
    });
  } else {
    sendResponse({ success: true, cached: false, count: 0 });
  }
}

async function handleClearCache(url, sendResponse) {
  if (url) {
    await chrome.storage.local.remove(`translations:${url}`);
  } else {
    // 清除所有翻译缓存（保留 API Key 等设置）
    const all = await chrome.storage.local.get(null);
    for (const key of Object.keys(all)) {
      if (key.startsWith('translations:')) {
        await chrome.storage.local.remove(key);
      }
    }
  }
  sendResponse({ success: true });
}
