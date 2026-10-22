/* 麦麦营养搭配咪 · 硬过滤
 * 过敏原与明确忌口是「硬约束」：命中即整条商品出局，不做「尽量避开」的软处理。
 */
(function (global) {
  'use strict';

  function label(id, kind) {
    var map = global.MCDData || {};
    return kind === 'allergen' ? map.allergenLabel(id) : map.exclusionLabel(id);
  }

  /**
   * @param {Array} items 已归一化的 Food 列表
   * @param {{allergens?:string[], exclusions?:string[]}} constraints
   * @returns {{passed:Array, removed:Array<{item:Food, hit:string[], kind:string}>}}
   */
  function hardFilter(items, constraints) {
    constraints = constraints || {};
    var allergens = constraints.allergens || [];
    var exclusions = constraints.exclusions || [];
    var passed = [];
    var removed = [];

    items.forEach(function (item) {
      var allergyHit = allergens.filter(function (id) {
        return item.allergens.indexOf(id) !== -1;
      });
      if (allergyHit.length) {
        removed.push({
          item: item,
          kind: 'allergen',
          hit: allergyHit.map(function (id) { return label(id, 'allergen'); })
        });
        return;
      }
      var excludeHit = exclusions.filter(function (id) {
        return item.dietTags.indexOf(id) !== -1;
      });
      if (excludeHit.length) {
        removed.push({
          item: item,
          kind: 'exclusion',
          hit: excludeHit.map(function (id) { return label(id, 'exclusion'); })
        });
        return;
      }
      passed.push(item);
    });

    return { passed: passed, removed: removed };
  }

  /** 按品类拆池子，缺任何一个品类都无法组成完整套餐 */
  function classify(items) {
    var pool = { main: [], side: [], drink: [] };
    items.forEach(function (item) {
      if (pool[item.category]) pool[item.category].push(item);
    });
    return pool;
  }

  /** 过滤结果的人话摘要，用于空结果态提示 */
  function summarize(removed) {
    var byLabel = {};
    removed.forEach(function (r) {
      r.hit.forEach(function (h) {
        byLabel[h] = (byLabel[h] || 0) + 1;
      });
    });
    return Object.keys(byLabel).map(function (k) {
      return k + ' ×' + byLabel[k];
    });
  }

  global.MCDFilter = {
    hardFilter: hardFilter,
    classify: classify,
    summarize: summarize
  };
})(typeof window !== 'undefined' ? window : globalThis);
