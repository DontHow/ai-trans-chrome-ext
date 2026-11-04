# 译存 · AI Translate

Chrome AI 翻译插件，支持自定义 API 地址、API Key 和模型，并在本机缓存译文。你可以在插件弹窗中输入文本，也可以在网页中选择文字后，通过右键菜单打开翻译页。

## 安装并配置

1. 下载本仓库，或执行 `git clone https://github.com/DontHow/ai-trans-chrome-ext.git`。
2. 在 Chrome 地址栏打开 `chrome://extensions`。
3. 开启右上角的「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的项目目录。
5. 点击工具栏中的译存图标，然后点击「接口设置」。
6. 填写 API 地址、API Key 和模型名称。
7. 点击「保存设置」，允许访问你配置的接口域名。

接口须支持 OpenAI Chat Completions 格式，即返回 `choices[0].message.content`。地址可填写基础路径，例如 `https://api.openai.com/v1`，插件会补上 `/chat/completions`；也可填写完整端点。模型名称须与你的服务商一致。默认模型名仅作为可编辑的初始值，插件不提供账号或额度。

远程接口需要 HTTPS。本机服务可使用 `http://localhost:端口/v1` 或 `http://127.0.0.1:端口/v1`；不需要认证时，API Key 可留空。

## 翻译文本

在弹窗中粘贴原文，选择目标语言，点击「翻译文本」。你也可以按 `⌘ + Enter`（macOS）或 `Ctrl + Enter`（Windows、Linux），再点击「复制」取得译文。

在网页中选择文字，右键点击「用译存翻译选中文本」，插件会在独立标签页中填入原文。点击「翻译文本」才会发送请求。单次最多翻译 12,000 个字符，超过限制的右键选区只带入前 12,000 个字符。

## 管理缓存和隐私

默认缓存保留 30 天。你可以在设置中选择其他保留时间或关闭缓存。有效缓存按接口地址、模型、原文及目标语言匹配，命中时不请求 AI 接口，因此已有缓存可在离线时使用。修改保留时间只影响之后写入的缓存；关闭缓存后，已有条目仍占用空间，但不会被读取。

缓存最多保留 200 条，并限制在约 4 MiB 内，超限时优先保留最近使用的译文。点击「清空缓存」并确认，可以删除所有缓存。卸载插件会删除本地设置和缓存。

API Key 及设置保存在当前浏览器的扩展本地存储中，不通过插件同步到其他设备。Key 未额外加密，请勿在共享浏览器配置中保存私人 Key。原文仅在主动翻译且未命中缓存时发送给配置的 AI 接口；原文不存入持久缓存，缓存包含原文的哈希和译文。右键带入的原文暂存在浏览器会话内，打开翻译页后删除，未打开的条目会在后续划词操作时清理。

插件不自动读取网页全文，不向网页注入脚本。域名访问权限在保存设置时按需申请。切换接口后，旧域名授权仍保留，你可以在 Chrome 的扩展详情中管理权限。

## 排查连接问题

- 「请先在设置中保存接口」：打开「接口设置」，保存并允许域名权限。
- 「API Key 无效或已过期」：检查 Key，并确认它属于配置的服务商。
- 「接口或模型不存在」：核对基础路径和模型名称，避免重复填写 `/chat/completions`。
- 「请求过于频繁或余额不足」：检查服务商额度，或稍后重试。
- 「翻译请求超时」：请求在 25 秒后超时，可缩短文本后重试。
- 「接口未返回译文」：确认接口支持上述响应格式。插件暂不支持原生 Anthropic Messages、Gemini API 或流式响应。

## 开发与验证

插件使用 Manifest V3 和原生 JavaScript，无需构建或安装运行依赖。加载后的代码变更需要在 `chrome://extensions` 点击刷新，并重新打开插件页面。

使用 Node.js 20 或更高版本运行检查：

```sh
npm run check
npm test
```

检查涵盖资源路径、JavaScript 语法、接口地址校验、错误处理、缓存隔离及过期清理。后台测试还验证离线缓存命中、重复请求合并、清空缓存时的并发请求，以及关闭缓存后的行为。GitHub Actions 在 push 和 pull request 时运行相同检查。

入口为 [manifest.json](manifest.json)，请求及缓存逻辑位于 [src/background.js](src/background.js) 和 [src/core.js](src/core.js)。权限及存储 API 可参阅 [Chrome 跨域请求文档](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)和 [Chrome 存储文档](https://developer.chrome.com/docs/extensions/reference/api/storage)。

可选的真实浏览器检查需要安装 Playwright 及其 Chromium：

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

该检查在临时浏览器配置中加载真实扩展，验证页面消息、输入校验、预置缓存的离线命中、设置页和缓存清空。它不调用实际 AI 服务。界面截图输出至被 Git 忽略的 `artifacts/`。如已有 Playwright 或 Chromium，可通过 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH` 指定本地路径。
