# ChatGPT 广告屏蔽（Chrome 插件）

自动屏蔽 ChatGPT（chatgpt.com）对话流内嵌的原生广告卡片，彻底无痕、零误伤，规则支持远程热更。

## 功能

- **精确屏蔽**：按「广告/Sponsored/Ad/Promoted」徽标文本 + 卡片容器复合识别，不误伤代码块、图片、搜索结果、正文含"广告"二字的普通句子
- **彻底无痕**（默认）：连广告上方的分隔线一并隐藏，视觉上"广告从未存在"
- **持续生效**：MutationObserver 监听 SPA 动态插入，新回复中的广告自动清除，无需刷新
- **可开关/可统计**：Popup 一键开关、模式切换、累计屏蔽数、本页计数
- **规则热更**：改版后更新远程规则 JSON 即可恢复拦截，无需重新上架

## 安装（开发者模式）

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录（`chatgpt-ad-blocker/`）
4. 打开/刷新 `chatgpt.com` 会话页即可生效

## 目录结构

```
chatgpt-ad-blocker/
├── manifest.json              # MV3 清单
├── _locales/                  # 国际化文案（zh_CN 默认 / en）
├── icons/                     # 图标
├── content/
│   ├── rules.js               # 内置默认规则（纯数据）
│   ├── content.js             # 识别引擎 + 观察器 + 打标
│   ├── fiber-marker.js        # 新版无标记广告卡识别（MAIN world，读 React 数据字段）
│   └── content.css            # 隐藏规则
├── popup/                     # 设置面板
├── background/
│   └── service-worker.js      # 规则热更 + 累计统计 + 角标（本页拦截数）
├── docs/                      # 官网 + 隐私政策（GitHub Pages 源）
│   ├── index.html             # 官网首页
│   ├── privacy.html           # 隐私政策（中英双语）
│   └── assets/
│       ├── style.css
│       └── store/             # 商店素材（screenshots + promo tiles，中英双语）
├── tools/
│   ├── promo-templates/       # 宣传图 HTML 模板（中英共用，?lang=zh|en）
│   ├── pack.mjs               # 跨平台打包脚本（npm run package）
│   └── release.mjs            # 发布 GitHub Release（npm run release）
├── eslint.config.mjs          # ESLint 扁平配置
├── package.json               # 开发脚本（lint / package）
└── rules.json                 # 远程热更规则
```

## 开发

```bash
npm install        # 安装 ESLint
npm run lint       # 代码规范检查
npm run package    # 打包为 chatgpt-ad-blocker-v<version>.zip（跨平台）
npm run release    # 打包并发布为 GitHub Release（tag = v<version>，需先 gh auth login）
```

> `npm run release` 依赖 [GitHub CLI](https://cli.github.com/)：先执行 `gh auth login`。Release 基于远端分支 HEAD 创建，请先 `git push` 确保提交已同步。

## 规则热更配置

识别规则是纯数据（见 `content/rules.js` 与根目录 `rules.json`）。远程热更已就绪：

- `background/service-worker.js` 顶部的 `RULES_URL` 已指向本仓库 `rules.json`
- ChatGPT 改版后，只需更新本仓库 `rules.json` 并提升 `version` 字段，插件会在下次启动或 6 小时周期自动拉取生效

**合规要点**：远程只更新数据（纯 JSON），不含任何函数/代码，符合 Chrome 商店政策；拉取失败自动回退内置默认规则。

## 屏蔽模式

| 模式 | 行为 |
|---|---|
| 彻底无痕（默认） | 隐藏广告卡片 + 上分隔线 |
| 安全 | 仅隐藏广告卡片，保留分隔线 |

## 说明

- 仅桌面 `chatgpt.com` 起步，如需覆盖 `chat.com` 等域名，在 `manifest.json` 的 `matches` 加一行即可
- 内置默认规则（`content/rules.js`）与远程热更规则（`rules.json`）需保持一致：改其一须同步另一份并提升 `version`

## 官网与隐私政策

官网与隐私政策源文件在 `docs/` 目录，已部署到 **Vercel**（生产地址）：

- 首页：<https://chatgpt-ad-blocker.vercel.app/>
- 隐私政策：<https://chatgpt-ad-blocker.vercel.app/privacy.html>

Vercel 项目配置：**Root Directory = `docs`**、Framework = Other（纯静态），已连接 GitHub 仓库，`main` 分支 push 后自动部署。

> 也可同时启用 GitHub Pages 作为备用：仓库 Settings → Pages → Source 选 `Deploy from a branch` → Branch `main` / Folder `/docs`。
