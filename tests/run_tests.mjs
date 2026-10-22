#!/usr/bin/env node
/* 麦麦营养搭配咪 · 自动化测试（Node，无需依赖）
 * 运行：node tests/run_tests.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sandbox = { console, setTimeout, clearTimeout, Date, Math, JSON, Number, Object, Array, isFinite, isNaN, String };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const rel of [
  'data/mcp_snapshot.js',
  'data/fallback_data.js',
  'data/allergen_map.js',
  'js/data.js',
  'js/filter.js',
  'js/combo.js',
  'js/score.js'
]) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, sandbox, { filename: rel });
}

const { MCDData, MCDFilter, MCDCombo, MCDScore, MCD_SNAPSHOT, MCD_ALLERGEN_MAP } = sandbox;

let pass = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || 'not equal'}: 期望 ${expected}，实际 ${actual}`);
}

const CAPTURED = Date.parse(MCD_SNAPSHOT.capturedAt);
const HOUR = 3600000;

console.log('\n[1] 数据层与模式判定');
test('新鲜快照 → 实时 MCP 模式', () => {
  const d = MCDData.load({ now: CAPTURED + 2 * HOUR });
  eq(d.mode, 'mcp', '模式');
  assert(d.items.length >= 30, '商品数量应 ≥ 30');
});
test('快照过期 → 自动降级为演示模式', () => {
  const d = MCDData.load({ now: CAPTURED + 30 * 24 * HOUR });
  eq(d.mode, 'demo', '模式');
  assert(/过期/.test(d.reason), '降级原因应说明过期');
  assert(d.items.length > 0, '演示数据应可用');
});
test('fallback 数据标记为演示且带免责说明', () => {
  eq(sandbox.MCD_FALLBACK.dataKind, 'demo', 'dataKind');
  assert(!!sandbox.MCD_FALLBACK.demoNotice, 'demoNotice 缺失');
});
test('商品结构完整、价格与营养合法', () => {
  const d = MCDData.load({ now: CAPTURED + HOUR });
  d.items.forEach((it) => {
    assert(it.code && it.name, '缺少 code/name');
    assert(['main', 'side', 'drink'].includes(it.category), `category 非法: ${it.name}`);
    assert(it.priceYuan > 0 && it.priceYuan <= 60, `价格异常: ${it.name} ${it.priceYuan}`);
    assert(it.nutrition.energyKcal >= 0 && it.nutrition.sodiumMg >= 0, `营养异常: ${it.name}`);
  });
});

console.log('\n[2] 过敏原 / 忌口硬过滤');
test('每种过敏原过滤后 0 泄漏', () => {
  const d = MCDData.load({ now: CAPTURED + HOUR });
  (MCD_ALLERGEN_MAP.allergens || []).forEach((rule) => {
    const res = MCDFilter.hardFilter(d.items, { allergens: [rule.id] });
    const leak = res.passed.filter((it) => it.allergens.includes(rule.id));
    eq(leak.length, 0, `${rule.label} 仍有泄漏: ${leak.map((x) => x.name).join(',')}`);
  });
});
test('忌口「鸡肉」过滤后不含鸡类商品', () => {
  const d = MCDData.load({ now: CAPTURED + HOUR });
  const res = MCDFilter.hardFilter(d.items, { exclusions: ['chicken'] });
  const leak = res.passed.filter((it) => it.dietTags.includes('chicken'));
  eq(leak.length, 0, '鸡肉泄漏');
  assert(res.removed.length > 0, '应有商品被过滤');
});
test('「牛奶」不被误判为牛肉（关键词例外）', () => {
  const d = MCDData.load({ now: CAPTURED + HOUR });
  const milk = d.items.find((i) => i.name.includes('纯牛奶'));
  assert(milk && !milk.dietTags.includes('beef'), '纯牛奶被误标为牛肉');
});
test('燕麦奶铁不被打上乳制品过敏原', () => {
  const d = MCDData.load({ now: CAPTURED + HOUR });
  const oat = d.items.find((i) => i.name.includes('燕麦奶铁'));
  assert(oat && !oat.allergens.includes('milk'), '燕麦奶铁被误标为含乳');
});
test('硬过滤不会「尽量避开」：命中即出局', () => {
  const d = MCDData.load({ now: CAPTURED + HOUR });
  const res = MCDFilter.hardFilter(d.items, { allergens: ['gluten', 'milk'], exclusions: ['fried'] });
  res.passed.forEach((it) => {
    assert(!it.allergens.includes('gluten'), `麸质泄漏: ${it.name}`);
    assert(!it.allergens.includes('milk'), `乳制品泄漏: ${it.name}`);
    assert(!it.dietTags.includes('fried'), `油炸泄漏: ${it.name}`);
  });
});

console.log('\n[3] 组合与预算');
const data = MCDData.load({ now: CAPTURED + HOUR });
const pool = MCDFilter.classify(data.items);
test('默认预算 40 元：所有组合总价不超预算', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 40 });
  assert(combos.length >= 9, `组合数偏少: ${combos.length}`);
  combos.forEach((c) => assert(c.totalPrice <= 40 + 1e-9, `超预算: ${c.totalPrice}`));
});
test('套餐必含 主餐+配餐+饮料 三件', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 50 });
  combos.forEach((c) => {
    eq(c.items.length, 3, '件数');
    eq(c.items[0].category, 'main', '主餐位');
    eq(c.items[1].category, 'side', '配餐位');
    eq(c.items[2].category, 'drink', '饮料位');
  });
});
test('营养合计 = 三件商品之和', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 45 });
  const c = combos[0];
  const manual = c.items.reduce((s, i) => s + i.nutrition.energyKcal, 0);
  assert(Math.abs(c.totals.energyKcal - manual) < 0.5, `热量合计错误: ${c.totals.energyKcal} vs ${manual}`);
});
test('超低预算 → 组合为空且能给最低可行价', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 12 });
  eq(combos.length, 0, '应有 0 个组合');
  const cheapest = MCDCombo.cheapestPossible(pool);
  assert(cheapest && cheapest.price > 12, '最低可行价应高于预算');
});
test('忌口到某品类为空 → 返回缺失品类', () => {
  const res = MCDFilter.hardFilter(data.items, { allergens: ['gluten', 'milk', 'egg'] });
  const p = MCDFilter.classify(res.passed);
  const built = MCDCombo.generate(p, { budgetMax: 60 });
  assert(built.missing.length > 0, '应提示缺失品类');
});

console.log('\n[4] 健康评分');
test('权重合计为 1', () => {
  const sum = Object.values(MCDScore.WEIGHTS).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1) < 1e-9, `权重和 ${sum}`);
});
test('评分区间落在 0–100 且字段齐全', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 45 });
  MCDScore.rank(combos, ['fat_loss']).forEach((r) => {
    assert(r.score >= 0 && r.score <= 100, `分数越界: ${r.score}`);
    ['kcal', 'protein', 'fat', 'sodium', 'sugar', 'structure'].forEach((k) => {
      assert(r.subs[k] >= 0 && r.subs[k] <= 1, `子分数越界 ${k}`);
    });
    assert(r.reason.length > 10, '搭配理由过短');
    assert(r.jogMin > 0, '慢跑等效缺失');
  });
});
test('钠降低 → 分数不降低（单调性）', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 45 });
  const base = combos[0];
  const clone = JSON.parse(JSON.stringify(base));
  clone.id = base.id + '-clone';
  clone.totals.sodiumMg = Math.max(0, base.totals.sodiumMg - 800);
  const a = MCDScore.scoreCombo(base, ['balanced']).score;
  const b = MCDScore.scoreCombo(clone, ['balanced']).score;
  assert(b >= a, `降钠后分数下降: ${a} → ${b}`);
});
test('多目标取区间交集（减脂+高蛋白 → 500–600）', () => {
  const band = MCDScore.targetBand(['fat_loss', 'high_protein']);
  eq(band[0], 500, '下界');
  eq(band[1], 600, '上界');
});
test('零糖饮料组合能拿到「零糖饮料」标签', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 45 });
  const zero = combos.find((c) => c.drink.nutrition.sugarG <= 1);
  assert(zero, '应存在零糖饮料组合');
  const scored = MCDScore.scoreCombo(zero, ['fat_loss']);
  assert(scored.labels.includes('零糖饮料'), '缺少零糖标签');
});
test('候选组合足够支撑 3 轮不重复（≥9 个）', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 40 });
  const ids = new Set(combos.map((c) => c.id));
  assert(ids.size >= 9, `可轮换组合不足: ${ids.size}`);
});

console.log('\n[5] 轮换逻辑（模拟）');
function pickThree(ranked, history) {
  let available = ranked.filter((r) => !history.includes(r.combo.id));
  let reused = false;
  if (available.length < 3) {
    history = history.slice(-3);
    available = ranked.filter((r) => !history.includes(r.combo.id));
    reused = true;
  }
  if (available.length < 3) { available = ranked.slice(); reused = true; }
  const picked = [];
  const usedMain = {};
  available.forEach((r) => {
    if (picked.length >= 3 || usedMain[r.combo.main.code]) return;
    usedMain[r.combo.main.code] = true;
    picked.push(r);
  });
  available.forEach((r) => { if (picked.length < 3 && !picked.includes(r)) picked.push(r); });
  return { picked, history: history.concat(picked.map((p) => p.combo.id)).slice(-9), reused };
}
test('连点 3 次（3 轮）不出现重复套餐', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 40 });
  const ranked = MCDScore.rank(combos, ['fat_loss']);
  let history = [];
  const seen = new Set();
  for (let round = 0; round < 3; round++) {
    const res = pickThree(ranked, history);
    history = res.history;
    eq(res.picked.length, 3, `第 ${round + 1} 轮应给 3 个`);
    res.picked.forEach((p) => {
      assert(!seen.has(p.combo.id), `第 ${round + 1} 轮重复: ${p.combo.id}`);
      seen.add(p.combo.id);
    });
  }
});
test('候选极少时复用并标记 reused', () => {
  const { combos } = MCDCombo.generate(pool, { budgetMax: 22 });
  const ranked = MCDScore.rank(combos, ['fat_loss']);
  let history = [];
  const first = pickThree(ranked, history);
  history = first.history;
  const second = pickThree(ranked, history);
  assert(second.reused || second.picked.every((p) => !first.picked.includes(p)), '候选不足时应复用并标记');
});

console.log(`\n结果：${pass} 通过 / ${failures.length} 失败`);
if (failures.length) {
  failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.message}`));
  process.exit(1);
}
console.log('全部通过 ✅');
