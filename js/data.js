/* 麦麦营养搭配咪 · 数据层
 * 职责：读取 MCP 快照 / 演示 fallback，决定当前模式，并把原始记录归一化成 Food 结构。
 * 依赖全局：window.MCD_SNAPSHOT、window.MCD_FALLBACK、window.MCD_ALLERGEN_MAP
 */
(function (global) {
  'use strict';

  var MODES = { MCP: 'mcp', DEMO: 'demo', ERROR: 'error' };

  var SNAPSHOT = global.MCD_SNAPSHOT || null;
  var FALLBACK = global.MCD_FALLBACK || null;
  var ALLERGEN_MAP = global.MCD_ALLERGEN_MAP || { allergens: [], exclusions: [], goals: [] };

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /* 名称关键词 → 标签（保守映射，用于补齐 MCP 未提供的过敏原/忌口字段） */
  function keywordHit(name, rule) {
    var except = rule.exceptKeywords || [];
    for (var i = 0; i < except.length; i++) {
      if (name.indexOf(except[i]) !== -1) return false;
    }
    var kws = rule.keywords || [];
    for (var j = 0; j < kws.length; j++) {
      if (name.indexOf(kws[j]) !== -1) return true;
    }
    return false;
  }

  function deriveTags(raw) {
    var allergens = (raw.allergens || []).slice();
    var diet = (raw.dietTags || []).slice();
    (ALLERGEN_MAP.allergens || []).forEach(function (rule) {
      if (keywordHit(raw.name, rule) && allergens.indexOf(rule.id) === -1) allergens.push(rule.id);
    });
    (ALLERGEN_MAP.exclusions || []).forEach(function (rule) {
      if (keywordHit(raw.name, rule) && diet.indexOf(rule.id) === -1) diet.push(rule.id);
    });
    return { allergens: allergens, dietTags: diet };
  }

  /** 原始记录 → Food */
  function enrich(raw, opts) {
    var n = raw.nutrition || {};
    var tags = deriveTags(raw);
    var source = (opts && opts.source) || 'unknown';
    return {
      code: String(raw.code),
      name: String(raw.name),
      category: raw.category,
      priceYuan: Math.round(num(raw.priceYuan) * 100) / 100,
      nutrition: {
        energyKcal: num(n.energyKcal),
        proteinG: num(n.proteinG),
        fatG: num(n.fatG),
        carbG: num(n.carbG),
        sodiumMg: num(n.sodiumMg),
        sugarG: num(n.sugarG)
      },
      sugarEstimated: !!raw.sugarEstimated,
      allergens: tags.allergens,
      dietTags: tags.dietTags,
      tags: (raw.tags || []).slice(),
      source: source
    };
  }

  function isFresh(meta, now) {
    if (!meta || !meta.capturedAt) return false;
    var t = Date.parse(meta.capturedAt);
    if (isNaN(t)) return false;
    var hours = (now - t) / 3600000;
    var limit = num(meta.expiresAfterHours) || 24;
    return hours <= limit; // 允许时钟轻微偏移；过期即视为不可用
  }

  function build(payload, mode, opts) {
    var items = (payload.items || []).map(function (raw) {
      return enrich(raw, { source: mode });
    });
    return {
      mode: mode,
      items: items,
      meta: payload.source || {},
      capturedAt: payload.capturedAt || null,
      demoNotice: payload.demoNotice || null,
      reason: (opts && opts.reason) || ''
    };
  }

  /**
   * 决定数据来源。优先级：新鲜 MCP 快照 → 演示 fallback → 错误态。
   * 触发 fallback：未配置 Token/未抓到快照、快照过期、数据为空、结构损坏。
   */
  function load(opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var reason = '';

    if (SNAPSHOT && Array.isArray(SNAPSHOT.items) && SNAPSHOT.items.length > 0) {
      if (isFresh(SNAPSHOT, now)) {
        var mcp = build(SNAPSHOT, MODES.MCP);
        mcp.reason = '';
        return mcp;
      }
      reason = '实时快照已过期（抓取于 ' + (SNAPSHOT.capturedAt || '未知时间') + '）';
    } else if (SNAPSHOT) {
      reason = '实时快照为空';
    } else {
      reason = '未检测到 MCP 快照（可能未配置 Token 或未启用 mcd-mcp 连接器）';
    }

    if (FALLBACK && Array.isArray(FALLBACK.items) && FALLBACK.items.length > 0) {
      var demo = build(FALLBACK, MODES.DEMO, { reason: reason });
      demo.reason = reason;
      return demo;
    }

    return {
      mode: MODES.ERROR,
      items: [],
      meta: {},
      reason: reason,
      error: '实时快照与演示数据均不可用。请执行 python tools/build_data.py 重新生成数据文件。'
    };
  }

  function labelOf(list, id) {
    var found = null;
    (list || []).forEach(function (r) {
      if (r.id === id) found = r.label;
    });
    return found || id;
  }

  global.MCDData = {
    MODES: MODES,
    ALLERGEN_MAP: ALLERGEN_MAP,
    load: load,
    enrich: enrich,
    deriveTags: deriveTags,
    isFresh: isFresh,
    allergenLabel: function (id) { return labelOf(ALLERGEN_MAP.allergens, id); },
    exclusionLabel: function (id) { return labelOf(ALLERGEN_MAP.exclusions, id); },
    goalLabel: function (id) { return labelOf(ALLERGEN_MAP.goals, id); },
    GOALS: ALLERGEN_MAP.goals || []
  };
})(typeof window !== 'undefined' ? window : globalThis);
