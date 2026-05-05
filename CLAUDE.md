# 英文翻译助手 — Chrome 浏览器插件

## 项目概述
Chrome 插件，帮助用户阅读英文文章（如 Superlinear）。选中文本按 J 键显示翻译。

## 核心技术选择
- **翻译引擎**: DeepSeek API（不用 MyMemory/Google Translate）
- **架构**: 预翻译整篇 → 构建映射表 → 选中后零延迟取结果
- **API 格式**: Anthropic 兼容格式（`https://api.deepseek.com/anthropic`）

## 核心规则（必须遵守，不得违背）

### 规则 1：预翻译模式（0.1.1 版本）
```
不要每次选中文本都调 API！
不要每次选中文本都调 API！
不要每次选中文本都调 API！
```

正确的流程：
1. 页面加载/激活时 → 检测到英文内容 → 分段 → 调用 DeepSeek API 一次翻译全文
2. 构建映射表：`Map<原文段落, 译文>` 存在内存里（LRU 缓存，限制 100 条）
3. 用户选中文本 → 从映射表模糊匹配 → 0 延迟显示翻译
4. 滚动到未缓存的新段落 → 后台静默补翻

### 规则 2：翻译质量
- 使用 DeepSeek API（用户已有 key）
- 翻译 prompt 要强调"自然流畅的中文，不要机翻腔"
- 长句要断句，不要逐词翻译

### 规则 3：架构分层
- `background.js` — 翻译引擎层（API 调用、缓存管理、限流）
- `content.js` — 页面交互层（选中检测、J 键监听、UI 显示）
- background 和 content 之间用 chrome.runtime.sendMessage 通信

### 规则 4：快捷键
- 默认 J 键翻译选中文本
- 需要排除 input/textarea/contentEditable 区域
- 快捷键冲突提示（Gmail/Twitter/Reddit 的 J 键冲突）

### 规则 5：UI 设计
- 翻译气泡：紫色渐变，显示原文+译文，鼠标悬停不消失
- 点击外部关闭
- 不要遮挡太多页面内容
- 支持设置面板（popup.html）：切换语言、开关自动翻译、配置 API Key

## 项目文件结构
```
D:\claude-workspace\英文翻译助手\
├── manifest.json          # Chrome 扩展配置（v3）
├── background.js          # 翻译引擎（DeepSeek API + 缓存）
├── content.js             # 页面脚本（选中→翻译→显示）
├── popup.html             # 设置面板
├── styles.css             # 翻译气泡样式
├── icons/                 # 图标（16/48/128）
└── CLAUDE.md              # 本文件
```

## 不要做
- ❌ 不要用 MyMemory Translate API
- ❌ 不要每次选中都调 API
- ❌ 不要在 content.js 里直接发 API 请求（走 background）
- ❌ 不要用 chrome.tts / 语音功能（暂时不需要）

## 测试
完成后提供 test.html 用于独立测试翻译功能。
