// 新版无标记广告卡识别（运行在页面主世界 MAIN world）。
//
// 背景：ChatGPT 新版信息流广告卡（如 Fortinet / Infisical 赞助卡）不再带
// data-ad-card-root 锚点、无可见徽标、class 全部混淆，旧规则全部失效。
// 但其 React 组件数据里仍保留服务端广告字段（ad_cards / advertiser_brand 等），
// 这些字段挂在 DOM 节点的 __reactFiber$* 属性上——只有页面主世界能读到，
// 隔离世界的 content script 读不到，故本脚本必须以 world: "MAIN" 注入。
//
// 职责：只做「识别 + 打标」（data-cb-ad-fiber），隐藏与计数由 content.js 完成。
// 纯数据规则（adFiberKeys）来自 rules.js 内置默认 + content.js 通过
// postMessage 转发的远程热更值，本文件不含任何可配置代码。
(function () {
  'use strict';

  var MARK = 'data-cb-ad-fiber';
  var HIDDEN = 'data-cb-adhidden';
  var DEFAULT_KEYS = ['ad_cards', 'advertiser_brand'];

  var state = {
    enabled: true,
    adFiberKeys: (window.__CBAD_DEFAULT_RULES__ && window.__CBAD_DEFAULT_RULES__.adFiberKeys) || DEFAULT_KEYS
  };

  // fiber 上溯层数与 props 递归深度的硬上限（防失控，与规则热更解耦）
  var MAX_FIBER_LEVEL = 16;
  var MAX_PROP_DEPTH = 5;

  // 在对象树里查找广告字段名（仅比对 key，不执行任何值）
  function hasAdKey(obj, keys, depth) {
    if (!obj || depth > MAX_PROP_DEPTH) return false;
    if (typeof obj !== 'object') return false;
    var ks;
    try { ks = Object.keys(obj); } catch (e) { return false; }
    for (var i = 0; i < ks.length; i++) {
      if (keys.indexOf(ks[i]) >= 0) return true;
      try { if (hasAdKey(obj[ks[i]], keys, depth + 1)) return true; } catch (e) { /* ignore */ }
    }
    return false;
  }

  // 命中任一广告字段名 → 该卡片是广告
  function isAdCard(el) {
    var keys = state.adFiberKeys;
    if (!keys || !keys.length) return false;
    var fk = null;
    var ok = Object.keys(el);
    for (var i = 0; i < ok.length; i++) {
      if (ok[i].indexOf('__reactFiber') === 0) { fk = ok[i]; break; }
    }
    if (!fk) return false;
    var f = el[fk];
    var level = 0;
    while (f && level < MAX_FIBER_LEVEL) {
      if (f.memoizedProps && hasAdKey(f.memoizedProps, keys, 0)) return true;
      f = f.return;
      level++;
    }
    return false;
  }

  // 定位隐藏目标：卡片本身 + 文本完全相同的包裹层一起收掉（消除空壳残留）
  function collapseTarget(card) {
    var target = card;
    var text = (card.textContent || '').replace(/\s+/g, '');
    var cur = card.parentElement;
    for (var i = 0; cur && i < 6; i++) {
      if (cur.tagName !== 'DIV') break;
      if ((cur.textContent || '').replace(/\s+/g, '') !== text) break;
      target = cur;
      cur = cur.parentElement;
    }
    return target;
  }

  function scan(roots) {
    if (!state.enabled) return;
    var list = roots && roots.length ? roots : [document.querySelector('main') || document.body];
    list.forEach(function (root) {
      if (!root || !root.isConnected) return;
      var cards = root.matches && root.matches('div[role="link"]')
        ? [root].concat([].slice.call(root.querySelectorAll('div[role="link"]')))
        : [].slice.call(root.querySelectorAll('div[role="link"]'));
      cards.forEach(function (card) {
        if (card.hasAttribute(MARK)) return;
        if (card.closest('[' + MARK + ']') || card.closest('[' + HIDDEN + ']')) return;
        if (!isAdCard(card)) return;
        collapseTarget(card).setAttribute(MARK, '1');
      });
    });
  }

  // SPA 动态插入 → 只扫新增子树（rAF 节流），与 content.js 同款策略
  var scheduled = false;
  var pendingRoots = [];
  var MAX_PENDING = 200;

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      var roots = (!pendingRoots.length || pendingRoots.length > MAX_PENDING) ? null : pendingRoots;
      pendingRoots = [];
      scan(roots);
    });
  }

  function collectRoots(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var el = n.nodeType === 1 ? n : n.parentElement;
      if (el) pendingRoots.push(el);
    }
  }

  function start() {
    scan();
    var target = document.body || document.documentElement;
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        if (added && added.length) collectRoots(added);
      }
      scheduleScan();
    });
    mo.observe(target, { childList: true, subtree: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // 接收 content.js 转发的开关与远程规则（仅认同窗口事件，防外部页面伪造）
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.type !== 'CBAD_STATE') return;
    if (typeof event.data.enabled === 'boolean') state.enabled = event.data.enabled;
    if (Array.isArray(event.data.adFiberKeys)) state.adFiberKeys = event.data.adFiberKeys;
  });
})();
