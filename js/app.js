/* 麦麦营养搭配咪 · 交互编排
 * 状态机：loading → cards / empty / error；每次点击「帮我搭配」在约束不变的前提下轮换 3 个套餐。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  var $ = function (id) { return doc.getElementById(id); };

  var state = {
    data: null,
    constraints: { budgetMax: 40, goals: ['fat_loss'], allergens: [], exclusions: [] },
    history: [],
    round: 0,
    lastPool: null,
    lastFiltered: null
  };

  var cat = null;

  /* ---------------- 工具 ---------------- */
  function money(n) {
    return '¥' + (Math.round(n * 100) / 100).toFixed(n % 1 === 0 ? 0 : 1);
  }

  function fmtDate(iso) {
    if (!iso) return '未知时间';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var pad = function (v) { return (v < 10 ? '0' : '') + v; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function clampPct(v) {
    if (v < 0) return 0;
    if (v > 100) return 100;
    return Math.round(v);
  }

  /* ---------------- 控件构建 ---------------- */
  function buildGoalChips() {
    var box = $('goalChips');
    box.innerHTML = '';
    (global.MCDData.GOALS || []).forEach(function (goal) {
      var label = doc.createElement('label');
      label.className = 'chip' + (state.constraints.goals.indexOf(goal.id) !== -1 ? ' is-on' : '');
      label.innerHTML = '<input type="checkbox" value="' + goal.id + '"' +
        (state.constraints.goals.indexOf(goal.id) !== -1 ? ' checked' : '') + '>' + goal.label;
      label.addEventListener('click', function (ev) {
        ev.preventDefault();
        toggleChip(label, goal.id, 'goals');
      });
      box.appendChild(label);
    });
  }

  function buildFilterChips() {
    var map = global.MCDData.ALLERGEN_MAP;
    var aBox = $('allergenGroup');
    var eBox = $('exclusionGroup');
    aBox.innerHTML = '';
    eBox.innerHTML = '';

    (map.allergens || []).forEach(function (rule) {
      var label = doc.createElement('label');
      label.className = 'chip chip-allergen';
      label.innerHTML = '<input type="checkbox" value="' + rule.id + '">' + rule.label;
      label.addEventListener('click', function (ev) {
        ev.preventDefault();
        toggleChip(label, rule.id, 'allergens');
      });
      aBox.appendChild(label);
    });

    (map.exclusions || []).forEach(function (rule) {
      var label = doc.createElement('label');
      label.className = 'chip';
      label.innerHTML = '<input type="checkbox" value="' + rule.id + '">' + rule.label;
      label.addEventListener('click', function (ev) {
        ev.preventDefault();
        toggleChip(label, rule.id, 'exclusions');
      });
      eBox.appendChild(label);
    });
  }

  function toggleChip(el, value, key) {
    var input = el.querySelector('input');
    var list = state.constraints[key];
    var idx = list.indexOf(value);

    if (key === 'goals' && idx !== -1 && list.length === 1) {
      cat.say('目标总得选一个吧。……随你，我不管。');
      return;
    }
    if (idx === -1) {
      list.push(value);
      el.classList.add('is-on');
      input.checked = true;
    } else {
      list.splice(idx, 1);
      el.classList.remove('is-on');
      input.checked = false;
    }
    updateFilterSummary();
  }

  function updateFilterSummary() {
    var n = state.constraints.allergens.length + state.constraints.exclusions.length;
    var text = n === 0 ? '未设置（硬过滤）' : '已设 ' + n + ' 项硬过滤';
    $('filterCount').textContent = text;
    $('filterBox').open = n > 0 ? true : $('filterBox').open;
  }

  /* ---------------- 状态渲染 ---------------- */
  function showState(name) {
    ['stateLoading', 'stateError', 'stateEmpty'].forEach(function (id) {
      $(id).hidden = id !== name;
    });
    if (name) $('cards').innerHTML = '';
  }

  function setMode(mode, note) {
    var badge = $('modeBadge');
    badge.setAttribute('data-mode', mode);
    badge.textContent = mode === 'mcp' ? '实时 MCP' : (mode === 'demo' ? '演示模式' : '数据异常');
    $('modeNote').textContent = note || '';
  }

  /* ---------------- 主流程 ---------------- */
  function run() {
    if (!state.data || state.data.mode === 'error') return;
    $('btnMix').disabled = true;
    showState('stateLoading');

    global.setTimeout(function () {
      try {
        step();
      } catch (err) {
        showError(err && err.message ? err.message : String(err));
      } finally {
        $('btnMix').disabled = false;
      }
    }, 420);
  }

  function step() {
    var c = state.constraints;
    c.budgetMax = Number($('budget').value);

    var filtered = global.MCDFilter.hardFilter(state.data.items, c);
    var pool = global.MCDFilter.classify(filtered.passed);
    var built = global.MCDCombo.generate(pool, { budgetMax: c.budgetMax });

    state.lastPool = pool;
    state.lastFiltered = filtered;

    $('poolHint').textContent = '候选池：主餐 ' + pool.main.length + ' · 配餐 ' + pool.side.length +
      ' · 饮料 ' + pool.drink.length + ' · 预算内组合 ' + built.combos.length +
      (filtered.removed.length ? ' · 已硬过滤 ' + filtered.removed.length + ' 项' : '');

    if (!built.combos.length) {
      showEmpty(built, pool, filtered);
      return;
    }

    var ranked = global.MCDScore.rank(built.combos, c.goals);
    var picked = pickThree(ranked);
    state.round += 1;

    renderCards(picked);
    showState(null);
    $('resultMeta').hidden = false;
    $('resultMeta').textContent = '第 ' + state.round + ' 轮 · ' + picked.length +
      ' 个套餐 · 营养百分比按轻体力活动成年人参考摄入量估算（2000 kcal/日等口径）；' +
      '慢跑等效按约 60 kg、8 km/h 估算，仅为约数。' +
      (picked._reused ? ' 候选不足，已复用此前组合。' : '');

    var top = picked[0];
    cat.setContext({
      combo: top.name,
      kcal: Math.round(top.combo.totals.energyKcal),
      sodium: Math.round(top.combo.totals.sodiumMg)
    });
    cat.say('「' + top.name + '」热量 ' + Math.round(top.combo.totals.energyKcal) +
      ' 大卡。别谢我，我只是懒得看你算错。');
  }

  /** 优先排除最近展示过的组合；不足 3 个时渐进回收历史 */
  function pickThree(ranked) {
    var available = ranked.filter(function (r) {
      return state.history.indexOf(r.combo.id) === -1;
    });
    var reused = false;

    if (available.length < 3) {
      state.history = state.history.slice(-3);
      available = ranked.filter(function (r) {
        return state.history.indexOf(r.combo.id) === -1;
      });
      reused = true;
    }
    if (available.length < 3) {
      available = ranked.slice();
      reused = true;
    }

    var picked = [];
    var usedMain = {};
    available.forEach(function (item) {
      if (picked.length >= 3) return;
      if (usedMain[item.combo.main.code]) return;
      usedMain[item.combo.main.code] = true;
      picked.push(item);
    });
    available.forEach(function (item) {
      if (picked.length >= 3) return;
      if (picked.indexOf(item) === -1) picked.push(item);
    });

    state.history = state.history.concat(picked.map(function (p) { return p.combo.id; })).slice(-9);
    picked._reused = reused;
    return picked;
  }

  /* ---------------- 卡片渲染 ---------------- */
  function nutriRow(label, value, unit, pct, kind) {
    return '<div class="nutri-row">' +
      '<span class="nutri-label">' + label + '</span>' +
      '<span class="bar"><i data-kind="' + kind + '" style="width:' + clampPct(pct) + '%"></i></span>' +
      '<span class="nutri-value">' + value + ' <small>' + unit + '</small></span>' +
      '<span class="nutri-pct">' + pct + '%</span>' +
      '</div>';
  }

  function warnShort(w) {
    if (/钠/.test(w)) return '钠偏高';
    if (/脂肪/.test(w)) return '脂肪偏高';
    if (/糖/.test(w)) return '糖偏高';
    return '热量偏高';
  }

  function renderCards(picked) {
    var catName = { main: '主餐', side: '配餐', drink: '饮料' };
    var html = picked.map(function (item, idx) {
      var c = item.combo;
      var t = c.totals;

      var itemsHtml = c.items.map(function (food) {
        return '<li>' +
          '<span class="cat-tag" data-cat="' + food.category + '">' + catName[food.category] + '</span>' +
          '<span>' + food.name + '</span>' +
          '<span class="price">' + money(food.priceYuan) + '</span>' +
          '</li>';
      }).join('');

      var tagsHtml = item.labels.map(function (l) {
        return '<span class="tag" data-strong="true">' + l + '</span>';
      }).join('') + item.warnings.map(function (w) {
        return '<span class="tag tag-warn">' + warnShort(w) + '</span>';
      }).join('');

      var drinkNote = c.drinkAdvice.level === 'sugary'
        ? '<span class="drink-note">· ' + c.drinkAdvice.text + '</span>' : '';

      return '<article class="card" style="animation-delay:' + (idx * 70) + 'ms">' +
        '<div class="card-head">' +
        '<span class="rank">' + ('0' + (idx + 1)).slice(-2) + '</span>' +
        '<h3>' + item.name + ' #' + (idx + 1) + '</h3>' +
        '<span class="score">健康分 ' + item.score + '</span>' +
        '</div>' +
        '<div class="card-body">' +
        '<ul class="items">' + itemsHtml + '</ul>' +
        '<div class="total-price"><b>' + money(c.totalPrice) + '</b><span>套餐总价 · 目标上限 ' +
        money(state.constraints.budgetMax) + '</span>' + drinkNote + '</div>' +
        '<div class="nutri">' +
        nutriRow('热量', Math.round(t.energyKcal), 'kcal', item.pct.energy, 'energy') +
        nutriRow('蛋白质', Math.round(t.proteinG), 'g', item.pct.protein, 'protein') +
        nutriRow('脂肪', Math.round(t.fatG), 'g', item.pct.fat, 'fat') +
        nutriRow('碳水', Math.round(t.carbG), 'g', item.pct.carb, 'carb') +
        nutriRow('钠', Math.round(t.sodiumMg), 'mg', item.pct.sodium, 'sodium') +
        nutriRow('糖', Math.round(t.sugarG), 'g', item.pct.sugar, 'sugar') +
        '</div>' +
        '<div class="tag-row">' + tagsHtml + '</div>' +
        '<p class="reason">' + item.reason + '</p>' +
        '<p class="jog">≈ 慢跑 ' + item.jogMin + ' 分钟（约 60 kg、8 km/h 估算，仅为约数）</p>' +
        '</div>' +
        '</article>';
    }).join('');
    $('cards').innerHTML = html;
  }

  /* ---------------- 异常态 ---------------- */
  function showEmpty(built, pool, filtered) {
    showState('stateEmpty');
    var tips = [];
    var text = '';

    if (built.missing && built.missing.length) {
      var names = { main: '主餐', side: '配餐', drink: '饮料' };
      text = '忌口与过敏原过滤后，' + built.missing.map(function (k) { return names[k]; }).join('、') +
        ' 里没有可用的商品了。';
      tips.push('取消一项过敏原/忌口（如「油炸」「含咖啡因」），再看一次');
    } else if (built.overBudget > 0) {
      var cheapest = global.MCDCombo.cheapestPossible(pool);
      text = money(state.constraints.budgetMax) + ' 的预算下，所有组合都超支（试算 ' +
        built.checked + ' 种）。';
      if (cheapest) {
        tips.push('把预算上限提到 ' + money(cheapest.price) + ' 左右（当前最低可行组合：' +
          cheapest.items.map(function (i) { return i.name; }).join(' + ') + '）');
      }
    } else {
      text = '当前条件下没有可行组合，试算 ' + built.checked + ' 种。';
    }

    if (filtered && filtered.removed.length) {
      var summary = global.MCDFilter.summarize(filtered.removed);
      if (summary.length) tips.push('被硬过滤掉的商品：' + summary.slice(0, 4).join('，'));
    }
    tips.push('把目标从多选改回单选，热量区间会更宽一些');

    $('emptyText').textContent = text;
    $('emptySuggest').innerHTML = tips.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    $('resultMeta').hidden = true;
    cat.say('这个组合……配不出来。要不要松一松条件？');
  }

  function showError(msg) {
    showState('stateError');
    $('errorText').textContent = msg || '未知错误';
    $('resultMeta').hidden = true;
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    var data = global.MCDData.load();

    state.data = data;
    if (data.mode === 'error') {
      setMode('error', '数据不可用');
      showError(data.error);
      $('sourceLine').textContent = '数据源：不可用';
      $('btnMix').disabled = true;
      return;
    }

    var note = data.mode === 'mcp'
      ? '快照 ' + fmtDate(data.capturedAt) + ' · ' + (data.meta.storeName || '门店') 
      : '未取到实时数据，改用演示数据';
    setMode(data.mode, note);

    $('sourceLine').textContent = data.mode === 'mcp'
      ? '数据源：麦当劳 MCP 实时快照 · ' + (data.meta.storeName || '') + '（' + (data.meta.storeCode || '') +
        '）· 抓取于 ' + fmtDate(data.capturedAt) + ' · 营养与过敏原为映射后的启发式标注'
      : '数据源：演示数据（非实时官方数据）· ' + (data.reason || '') + ' · 抓取时间 ' + fmtDate(data.capturedAt);

    buildGoalChips();
    buildFilterChips();
    updateFilterSummary();

    var budget = $('budget');
    var out = $('budgetOut');
    function syncBudget() {
      out.textContent = budget.value + ' 元';
      state.constraints.budgetMax = Number(budget.value);
    }
    budget.addEventListener('input', syncBudget);
    syncBudget();

    cat = global.MCDCat.create({
      bubble: $('bubble'),
      lines: global.MCD_CAT_LINES,
      visibleMs: 5600
    });
    cat.start();
    cat.say('喵。先选个预算，剩下的交给我。', 4200);

    $('btnMix').addEventListener('click', run);
    $('btnReset').addEventListener('click', function () {
      state.constraints.allergens = [];
      state.constraints.exclusions = [];
      state.constraints.goals = ['fat_loss'];
      state.history = [];
      state.round = 0;
      budget.value = 40;
      syncBudget();
      buildGoalChips();
      buildFilterChips();
      updateFilterSummary();
      $('poolHint').textContent = '候选池：—';
      showState(null);
      $('resultMeta').hidden = true;
      $('cards').innerHTML = '<div class="state"><p>条件已清空。点一下「帮我搭配」试试。</p></div>';
      cat.say('清得挺干净。行吧，重新来。');
    });

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) cat.stop();
      else cat.start();
    });

    run();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
