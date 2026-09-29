(function () {
  'use strict';

  // 内置默认规则唯一来源为 content/rules.js（先于本文件加载）；
  // 此处仅保留最小兜底结构，避免规则缺失时报错——不再重复一份完整规则。
  var DEFAULT_RULES = window.__CBAD_DEFAULT_RULES__ || {
    version: "0",
    badgeTexts: [],
    cardClassHints: [],
    sdkAnchors: [],
    maxDepth: 6
  };

  var rules = DEFAULT_RULES;
  var enabled = true;
  var mode = 'clean'; // clean=彻底无痕(默认) | safe=仅隐藏卡片
  var pageCount = 0;

  function isBadgeText(t) {
    var s = (t || '').trim();
    return (rules.badgeTexts || []).indexOf(s) >= 0;
  }

  // 从节点（含自身）上溯定位「可确认的」广告卡片容器；未命中特征返回 null。
  // useAnchors=false 时只认 cardClassHints —— 以 SDK 锚点为起点时，避免把空锚点自身当卡片。
  function findCardFrom(node, useAnchors) {
    var hints = rules.cardClassHints || [];
    var anchors = useAnchors ? (rules.sdkAnchors || []) : [];
    var maxDepth = rules.maxDepth || 6;
    var el = node;
    for (var i = 0; el && i < maxDepth; i++) {
      if (el.tagName !== 'DIV') { el = el.parentElement; continue; }
      var cls = typeof el.className === 'string' ? el.className : '';
      if (hints.some(function (h) { return cls.indexOf(h) >= 0; })) return el;
      if (anchors.some(function (a) { return el.hasAttribute(a); })) return el;
      if (cls.indexOf('agent-turn') >= 0) break; // 越出回复容器则放弃
      el = el.parentElement;
    }
    // 未命中任何卡片特征：宁可漏杀也不误伤（改版后由远程规则补齐特征）
    return null;
  }

  // 彻底无痕：向上找广告块的「上分隔线」容器（广告块包裹层，含 border-t 类）。
  // 用 classList 精确匹配，避免误命中 border-token-* 这类常见 Tailwind 类名。
  function findSeparator(card) {
    var el = card.parentElement;
    for (var i = 0; el && i < 6; i++) {
      var cls = typeof el.className === 'string' ? el.className : '';
      if (cls.indexOf('agent-turn') >= 0) break; // 越出回复容器则放弃
      if (el.classList && el.classList.contains('border-t')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function scanRoot() {
    return document.querySelector('main') || document.body;
  }

  function hide(card) {
    if (!card) return;
    // 一卡一计：同一广告的祖先/后代若已隐藏过则跳过，避免嵌套容器重复计数
    if (card.closest('[data-cb-adhidden]') || card.querySelector('[data-cb-adhidden]')) return;
    card.setAttribute('data-cb-adhidden', '1');
    pageCount += 1;
    if (mode === 'clean') {
      var sep = findSeparator(card);
      if (sep) sep.setAttribute('data-cb-adhidden-sep', '1');
    }
    try { chrome.runtime.sendMessage({ type: 'AD_HIDDEN' }); } catch (e) { /* ignore */ }
  }

  function restoreAll() {
    var root = scanRoot();
    if (!root) return;
    root.querySelectorAll('[data-cb-adhidden], [data-cb-adhidden-sep], [data-cb-ad-fiber]').forEach(function (el) {
      el.removeAttribute('data-cb-adhidden');
      el.removeAttribute('data-cb-adhidden-sep');
      el.removeAttribute('data-cb-ad-fiber');
    });
    pageCount = 0;
  }

  function ensureClean() {
    if (mode !== 'clean') return;
    var root = scanRoot();
    if (!root) return;
    root.querySelectorAll('[data-cb-adhidden]').forEach(function (card) {
      var sep = findSeparator(card);
      if (sep) sep.setAttribute('data-cb-adhidden-sep', '1');
    });
  }

  function setMode(m) {
    if (m !== 'clean' && m !== 'safe') return;
    if (m === mode) return;
    mode = m;
    if (m === 'clean') {
      ensureClean();
    } else {
      var root = scanRoot();
      if (root) root.querySelectorAll('[data-cb-adhidden-sep]').forEach(function (el) {
        el.removeAttribute('data-cb-adhidden-sep');
      });
    }
  }

  // 安全的属性选择器查询：远程规则内容不可全信，非法选择器不应中断扫描
  function safeQueryAll(root, attr) {
    try {
      return root.querySelectorAll('[' + attr + ']');
    } catch (e) {
      return [];
    }
  }

  // 扫描给定根节点；roots 为空/未传时退化为全量扫描
  function scan(roots) {
    if (!enabled) return;
    var list = roots && roots.length ? roots : [scanRoot()];

    list.forEach(function (root) {
      if (!root || !root.isConnected) return;

      // 1) 文本节点找徽标 → 上溯定位卡片 → 隐藏
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var node = walker.currentNode;
        if (!isBadgeText(node.textContent)) continue;
        var badge = node.parentElement;
        if (badge) hide(findCardFrom(badge, true));
      }

      // 2) 兜底：SDK 锚点 → 只认卡片类特征（空锚点本身不是广告，不隐藏、不计数）
      (rules.sdkAnchors || []).forEach(function (a) {
        safeQueryAll(root, a).forEach(function (el) {
          hide(findCardFrom(el, false));
        });
      });

      // 3) 新版无标记广告卡：fiber-marker.js（MAIN world）按 React 数据字段打标，
      //    视觉隐藏由 CSS 直接生效，这里只负责转正为统一标记 + 计数
      safeQueryAll(root, 'data-cb-ad-fiber').forEach(function (el) {
        hide(el);
      });
    });
  }

  // 把开关与广告字段规则转发给 MAIN world 的 fiber-marker.js（chrome API 不可跨世界）
  function relayState() {
    try {
      window.postMessage({
        type: 'CBAD_STATE',
        enabled: enabled,
        adFiberKeys: rules.adFiberKeys || []
      }, location.origin);
    } catch (e) { /* ignore */ }
  }

  function applyConfig(cfg) {
    if (cfg.rules && cfg.rules.version) rules = cfg.rules;
    if (typeof cfg.enabled === 'boolean') enabled = cfg.enabled;
    if (cfg.mode === 'clean' || cfg.mode === 'safe') setMode(cfg.mode);
    relayState();
  }

  function loadConfig() {
    try {
      chrome.storage.local.get(['rules', 'enabled', 'mode'], function (cfg) {
        if (chrome.runtime.lastError) return;
        applyConfig(cfg || {});
        if (!enabled) restoreAll();
        scan();
      });
    } catch (e) { /* ignore */ }
  }

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      var cfg = {};
      if (changes.rules) cfg.rules = changes.rules.newValue;
      if (changes.enabled) cfg.enabled = changes.enabled.newValue;
      if (changes.mode) cfg.mode = changes.mode.newValue;
      applyConfig(cfg);
      if (!enabled) restoreAll();
      scan();
    });
  } catch (e) { /* ignore */ }

  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg) return;
      if (msg.type === 'GET_PAGE_STATS') {
        sendResponse({ pageCount: pageCount });
      }
    });
  } catch (e) { /* ignore */ }

  // SPA 动态插入 → 只扫新增子树（rAF 节流），避免流式输出时全量遍历
  var scheduled = false;
  var pendingRoots = new Set();
  var MAX_PENDING = 200;

  function collectRoots(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var el = n.nodeType === 1 ? n : n.parentElement;
      if (el) pendingRoots.add(el);
    }
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      // 新增过多（或无从定位）时退回全量扫描，保证不漏杀
      var roots = (!pendingRoots.size || pendingRoots.size > MAX_PENDING)
        ? null
        : Array.from(pendingRoots);
      pendingRoots.clear();
      scan(roots);
    });
  }

  function start() {
    loadConfig();
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
})();
