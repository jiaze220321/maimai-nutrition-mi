/* 麦麦营养搭配咪 · 健康评分
 *
 * 评分模型（100 分制，权重合计 = 1.00，调参只需改 WEIGHTS）：
 *   热量契合  0.28   落在目标热量区间内得满分，越界按带宽线性衰减
 *   蛋白质    0.22   绝对量（参考 30g）占 75%，蛋白密度（g/kcal）占 25%
 *   脂肪      0.16   脂肪供能比 ≤30% 得满分，超过后线性衰减
 *   钠        0.18   单餐 ≤600mg 得满分，2000mg 衰减到 0
 *   糖        0.12   单餐糖 ≤0g 得满分，≥45g 衰减到 0
 *   结构      0.04   有蔬果配餐 +、零糖饮料 +、甜品配餐 −
 *
 * 所有百分比参考值见 REF，均属「参考摄入量估算」，不是医学建议。
 */
(function (global) {
  'use strict';

  var WEIGHTS = {
    kcal: 0.28,
    protein: 0.22,
    fat: 0.16,
    sodium: 0.18,
    sugar: 0.12,
    structure: 0.04
  };

  var BANDS = {
    fat_loss: [420, 600],
    high_protein: [500, 750],
    low_sodium: [450, 700],
    balanced: [500, 750]
  };

  /* 参考值：轻体力活动成年人（示例口径，非个体化建议） */
  var REF = {
    energyKcal: 2000,
    proteinG: 60,
    fatG: 60,
    carbG: 300,
    sodiumMg: 2000,
    sugarG: 50,
    basis: '按轻体力活动成年人参考摄入量估算（2000 kcal/日、蛋白质 60 g/日、钠 2000 mg/日、添加糖 50 g/日）'
  };

  /* 慢跑等效：体重约 60kg、配速约 8km/h 时约 8 kcal/分钟，仅为约数 */
  var JOG = { weightKg: 60, speedKmh: 8, kcalPerMin: 8 };

  function clamp01(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  function pct(value, ref) {
    return Math.round((value / ref) * 100);
  }

  /** 多目标取区间交集；交集为空则退化为两目标中点 ±110 kcal */
  function targetBand(goals) {
    var list = (goals && goals.length ? goals : ['balanced']).map(function (g) {
      return BANDS[g] || BANDS.balanced;
    });
    var lo = Math.max.apply(null, list.map(function (b) { return b[0]; }));
    var hi = Math.min.apply(null, list.map(function (b) { return b[1]; }));
    if (lo > hi) {
      var mid = list.reduce(function (a, b) { return a + (b[0] + b[1]) / 2; }, 0) / list.length;
      lo = Math.round(mid - 110);
      hi = Math.round(mid + 110);
    }
    return [lo, hi];
  }

  function hasVeggie(side) {
    return side.dietTags.indexOf('vegetable') !== -1 ||
      side.dietTags.indexOf('fruit') !== -1 ||
      side.tags.indexOf('有蔬菜') !== -1 ||
      side.tags.indexOf('有蔬果') !== -1;
  }

  function subScores(combo, goals) {
    var t = combo.totals;
    var band = targetBand(goals);
    var center = (band[0] + band[1]) / 2;
    var half = Math.max((band[1] - band[0]) / 2, 60);
    var distance = Math.abs(t.energyKcal - center);
    var kcalScore = clamp01(1 - Math.max(0, distance - half) / (half * 1.2));

    var proteinScore = clamp01(t.proteinG / 30) * 0.75 +
      clamp01((t.proteinG / Math.max(t.energyKcal, 1)) / 0.075) * 0.25;

    var fatEnergyPct = (t.fatG * 9) / Math.max(t.energyKcal, 1);
    var fatScore = clamp01(1 - Math.max(0, fatEnergyPct - 0.30) / 0.22);

    var sodiumScore = clamp01(1 - Math.max(0, t.sodiumMg - 600) / 1400);
    var sugarScore = clamp01(1 - t.sugarG / 45);

    var structureScore = 0.5;
    if (hasVeggie(combo.side)) structureScore += 0.25;
    if (combo.drink.nutrition.sugarG <= 1) structureScore += 0.25;
    if (combo.side.dietTags.indexOf('dessert') !== -1) structureScore -= 0.3;

    return {
      kcal: kcalScore,
      protein: proteinScore,
      fat: fatScore,
      sodium: sodiumScore,
      sugar: sugarScore,
      structure: clamp01(structureScore),
      band: band,
      fatEnergyPct: fatEnergyPct
    };
  }

  function labelsOf(combo, subs, score) {
    var t = combo.totals;
    var labels = [];
    if (t.proteinG >= 28) labels.push('高蛋白');
    if (t.sodiumMg <= 700) labels.push('低钠');
    if (t.energyKcal <= 520) labels.push('轻热量');
    if (combo.drink.nutrition.sugarG <= 1) labels.push('零糖饮料');
    if (hasVeggie(combo.side)) labels.push('有蔬果');
    if (score >= 75) labels.push('均衡');
    return labels;
  }

  function warningsOf(combo, subs) {
    var t = combo.totals;
    var out = [];
    if (t.sodiumMg > 1000) out.push('钠偏高（' + Math.round(t.sodiumMg) + ' mg），建议少蘸酱、饮料选无糖');
    if (subs.fatEnergyPct > 0.38) out.push('脂肪供能比偏高（' + Math.round(subs.fatEnergyPct * 100) + '% 能量来自脂肪）');
    if (t.sugarG > 45) out.push('糖偏高（' + Math.round(t.sugarG) + ' g），含糖饮料可换纯悦');
    if (t.energyKcal > subs.band[1] * 1.25) out.push('热量高于目标区间');
    return out;
  }

  function goalSentence(goal, combo, subs) {
    var t = combo.totals;
    var band = subs.band;
    switch (goal) {
      case 'fat_loss':
        return '按减脂目标把整餐压在 ' + Math.round(t.energyKcal) + ' kcal（目标区间 ' +
          band[0] + '–' + band[1] + ' kcal）';
      case 'high_protein':
        return '蛋白质 ' + Math.round(t.proteinG) + ' g，约合每日参考摄入的 ' +
          pct(t.proteinG, REF.proteinG) + '%';
      case 'low_sodium':
        return '钠 ' + Math.round(t.sodiumMg) + ' mg，占每日参考值 ' + pct(t.sodiumMg, REF.sodiumMg) + '%';
      case 'balanced':
        return '蛋白质/脂肪/碳水比例相对均衡（脂肪供能比 ' +
          Math.round(subs.fatEnergyPct * 100) + '%）';
      default:
        return '';
    }
  }

  function reasonOf(combo, subs, goals, warnings) {
    var parts = [];
    (goals && goals.length ? goals : ['balanced']).forEach(function (g) {
      var s = goalSentence(g, combo, subs);
      if (s) parts.push(s);
    });
    var structure = '配餐为' + combo.side.name + (hasVeggie(combo.side) ? '（有蔬果）' : '') +
      '，饮料为' + combo.drink.name + (combo.drink.nutrition.sugarG <= 1 ? '（零糖，几乎不额外增加热量）' : '（含糖，已计入总热量）');
    parts.push(structure);
    if (warnings.length) parts.push('注意：' + warnings[0]);
    return parts.join('；') + '。';
  }

  function nameOf(combo, subs, score) {
    var prefix = '均衡派';
    if (combo.totals.proteinG >= 28 && score >= 70) prefix = '高蛋白派';
    else if (combo.totals.energyKcal <= 500) prefix = '轻盈派';
    else if (combo.totals.sodiumMg <= 700) prefix = '清爽派';
    else if (combo.side.dietTags.indexOf('dessert') !== -1) prefix = '解馋派';
    return prefix;
  }

  /** 给单个套餐打分，返回套餐 + 评分详情 */
  function scoreCombo(combo, goals) {
    var subs = subScores(combo, goals);
    var score = 0;
    Object.keys(WEIGHTS).forEach(function (k) {
      score += WEIGHTS[k] * subs[k];
    });
    score = Math.round(score * 1000) / 10;

    var warnings = warningsOf(combo, subs);
    return {
      combo: combo,
      score: score,
      subs: subs,
      band: subs.band,
      labels: labelsOf(combo, subs, score),
      warnings: warnings,
      reason: reasonOf(combo, subs, goals, warnings),
      name: nameOf(combo, subs, score),
      jogMin: Math.round(combo.totals.energyKcal / JOG.kcalPerMin),
      pct: {
        energy: pct(combo.totals.energyKcal, REF.energyKcal),
        protein: pct(combo.totals.proteinG, REF.proteinG),
        fat: pct(combo.totals.fatG, REF.fatG),
        carb: pct(combo.totals.carbG, REF.carbG),
        sodium: pct(combo.totals.sodiumMg, REF.sodiumMg),
        sugar: pct(combo.totals.sugarG, REF.sugarG)
      }
    };
  }

  /** 批量打分并按分数降序排序（同分时优先低价） */
  function rank(combos, goals) {
    return combos.map(function (c) { return scoreCombo(c, goals); }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.combo.totalPrice - b.combo.totalPrice;
    });
  }

  global.MCDScore = {
    WEIGHTS: WEIGHTS,
    BANDS: BANDS,
    REF: REF,
    JOG: JOG,
    targetBand: targetBand,
    scoreCombo: scoreCombo,
    rank: rank,
    pct: pct
  };
})(typeof window !== 'undefined' ? window : globalThis);
