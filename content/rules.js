// 内置默认规则（纯数据，不含函数 —— 满足商店「远程只更数据、不更代码」的合规要求）。
// 远程热更会用同构 JSON 覆盖此数据（见 background/service-worker.js）。
// 字段说明见 .temp/chatgpt-adblock-chrome-extension-design.md §5.1。
window.__CBAD_DEFAULT_RULES__ = {
  version: "2026-09-29.1",
  // 广告卡片右上角徽标文本（全等匹配，多语言）
  badgeTexts: ["广告", "Sponsored", "Ad", "Promoted", "Advertisement"],
  // 广告卡片容器 class 子串（实测为 tailwind 的 group/image-card）
  cardClassHints: ["image-card"],
  // 官方 SDK 占位锚点（data-* 属性名）
  sdkAnchors: ["data-ad-card-root", "data-assistant-ads"],
  // 新版无标记广告卡的识别指纹：React props 里的广告数据字段名。
  // 由 fiber-marker.js（MAIN world）在组件数据里查找，命中即标记卡片。
  adFiberKeys: ["ad_cards", "advertiser_brand"],
  // 从徽标向上定位卡片的最大层级（防止越出回复容器）
  maxDepth: 6
};
