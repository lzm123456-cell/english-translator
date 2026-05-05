# 英文翻译助手 🐾

Chrome 浏览器插件 —— 预翻译英文文章，选中即看中文，零延迟。

## 用法

1. 打开一篇英文文章
2. 点右上角插件图标 → 输入 DeepSeek API Key → 点「翻译本文」
3. 选中任意段落，按 **J** 键查看译文
4. 再按 **J** 或 **ESC** 关闭

## 架构（0.1.1）

```
打开文章 → 一次 API 调用预翻译全部 → 构建映射表
  ↓
选中段落按 J → 从缓存模糊匹配 → 零延迟显示
  ↓
新段落滚动到 → 后台静默补翻
```

**不每次选中都调 API。** 只翻一次，后面全走缓存。

## 技术栈

- Chrome Extension Manifest V3
- DeepSeek API（`deepseek-chat` 模型）
- JavaScript（无框架）

## 安装

1. `chrome://extensions/`
2. 打开「开发者模式」
3. 加载已解压的扩展程序 → 选择 `extension/` 目录

## 许可

MIT
