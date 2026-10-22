/* 麦麦营养搭配咪 · 组合生成
 * 流程：主餐 × 配餐 × 饮料 穷举 → 套餐总价约束 → 营养合计
 * 说明：饮料若为含糖款仍计入总价与营养，只在评分与文案中标注「可换零糖」。
 */
(function (global) {
  'use strict';

  var NUTRIENTS = ['energyKcal', 'proteinG', 'fatG', 'carbG', 'sodiumMg', 'sugarG'];

  function sumNutrition(items) {
    var totals = {};
    NUTRIENTS.forEach(function (k) { totals[k] = 0; });
    items.forEach(function (item) {
      NUTRIENTS.forEach(function (k) { totals[k] += item.nutrition[k] || 0; });
    });
    NUTRIENTS.forEach(function (k) { totals[k] = Math.round(totals[k] * 10) / 10; });
    return totals;
  }

  function signature(items) {
    return items.map(function (i) { return i.code; }).sort().join('|');
  }

  function drinkAdvice(drink) {
    var sugar = drink.nutrition.sugarG;
    if (sugar <= 1) return { level: 'zero', text: '零糖/无糖饮料' };
    if (sugar >= 20) return { level: 'sugary', text: '含糖饮料，可换零糖' };
    return { level: 'moderate', text: '含糖量中等' };
  }

  /**
   * @param {{main:Array, side:Array, drink:Array}} pool 已通过硬过滤的商品池
   * @param {{budgetMin?:number, budgetMax?:number, limit?:number}} constraints
   */
  function generate(pool, constraints) {
    constraints = constraints || {};
    var budgetMin = Number(constraints.budgetMin) || 0;
    var budgetMax = Number(constraints.budgetMax) || Infinity;
    var missing = [];
    ['main', 'side', 'drink'].forEach(function (k) {
      if (!pool[k] || !pool[k].length) missing.push(k);
    });

    var combos = [];
    if (missing.length) {
      return { combos: combos, missing: missing, checked: 0, overBudget: 0 };
    }

    var checked = 0;
    var overBudget = 0;
    pool.main.forEach(function (main) {
      pool.side.forEach(function (side) {
        pool.drink.forEach(function (drink) {
          checked++;
          var items = [main, side, drink];
          var totalPrice = Math.round((main.priceYuan + side.priceYuan + drink.priceYuan) * 100) / 100;
          if (totalPrice > budgetMax) { overBudget++; return; }
          if (totalPrice < budgetMin) return;
          combos.push({
            id: signature(items),
            main: main,
            side: side,
            drink: drink,
            items: items,
            totalPrice: totalPrice,
            totals: sumNutrition(items),
            drinkAdvice: drinkAdvice(drink)
          });
        });
      });
    });

    return { combos: combos, missing: missing, checked: checked, overBudget: overBudget };
  }

  /** 找出当前约束下最便宜的可行总价，用于「预算不够」提示 */
  function cheapestPossible(pool) {
    if (!pool.main.length || !pool.side.length || !pool.drink.length) return null;
    var min = function (list) {
      return list.reduce(function (a, b) { return b.priceYuan < a.priceYuan ? b : a; });
    };
    var m = min(pool.main), s = min(pool.side), d = min(pool.drink);
    return {
      price: Math.round((m.priceYuan + s.priceYuan + d.priceYuan) * 100) / 100,
      items: [m, s, d]
    };
  }

  global.MCDCombo = {
    NUTRIENTS: NUTRIENTS,
    generate: generate,
    signature: signature,
    sumNutrition: sumNutrition,
    cheapestPossible: cheapestPossible
  };
})(typeof window !== 'undefined' ? window : globalThis);
