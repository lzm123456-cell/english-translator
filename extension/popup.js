document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const translateBtn = document.getElementById('translateBtn');
  const statusEl = document.getElementById('status');

  // 加载已保存的 API Key
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }

  // 保存 API Key（输入时自动保存）
  let saveTimer;
  apiKeyInput.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ apiKey: apiKeyInput.value });
    }, 500);
  });

  // 翻译按钮
  translateBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showStatus('请先输入 API Key', 'error');
      return;
    }

    // 先保存 key
    await chrome.storage.local.set({ apiKey: key });

    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showStatus('无法获取当前标签页', 'error');
      return;
    }

    // 通知 content.js 开始翻译
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'startTranslation' });
      showStatus('已发送翻译请求，请查看页面状态', 'info');
      setTimeout(() => window.close(), 1000);
    } catch (error) {
      // 可能 content script 未注入
      showStatus('请刷新页面后重试（content script 未加载）', 'error');
    }
  });

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'status show ' + (type || 'info');
    setTimeout(() => {
      statusEl.className = 'status';
    }, 5000);
  }
});
