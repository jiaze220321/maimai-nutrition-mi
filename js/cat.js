/* 麦麦营养搭配咪 · 猫咪气泡
 * 每隔 8–15 秒随机冒一句傲娇台词（语料见 data/cat_lines.json），不遮挡主要操作。
 */
(function (global) {
  'use strict';

  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function create(options) {
    var opts = options || {};
    var bubble = opts.bubble;
    var lineData = opts.lines || global.MCD_CAT_LINES || { lines: [], intervalMs: [8000, 15000] };
    var lines = lineData.lines || [];
    var range = lineData.intervalMs || [8000, 15000];
    var minGap = opts.minGap || range[0] || 8000;
    var maxGap = opts.maxGap || range[1] || 15000;
    var visibleMs = opts.visibleMs || 5600;

    var context = { combo: '这份套餐', kcal: '—', sodium: '—' };
    var bag = [];
    var timer = null;
    var hideTimer = null;
    var running = false;
    var lastIndex = -1;

    function nextGap() {
      return minGap + Math.random() * Math.max(maxGap - minGap, 0);
    }

    function pick() {
      if (!lines.length) return null;
      if (!bag.length) {
        bag = shuffle(lines.map(function (_, i) { return i; }));
        if (bag.length > 1 && bag[0] === lastIndex) {
          bag.push(bag.shift());
        }
      }
      lastIndex = bag.shift();
      return lines[lastIndex];
    }

    function render(text) {
      if (!bubble) return;
      bubble.textContent = text;
      bubble.classList.add('is-visible');
      bubble.setAttribute('data-mood', 'talk');
    }

    function hide() {
      if (!bubble) return;
      bubble.classList.remove('is-visible');
    }

    function fill(line) {
      return String(line.text)
        .replace(/\{combo\}/g, context.combo || '这份套餐')
        .replace(/\{kcal\}/g, context.kcal || '—')
        .replace(/\{sodium\}/g, context.sodium || '—');
    }

    function tick() {
      if (!running) return;
      if (global.document && global.document.hidden) {
        schedule();
        return;
      }
      var line = pick();
      if (line) {
        render(fill(line));
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, visibleMs);
      }
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(tick, nextGap());
    }

    function start() {
      if (running) return;
      running = true;
      schedule();
    }

    function stop() {
      running = false;
      clearTimeout(timer);
      clearTimeout(hideTimer);
      hide();
    }

    return {
      start: start,
      stop: stop,
      say: function (text, duration) {
        render(text);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, duration || visibleMs);
      },
      setContext: function (ctx) {
        context = Object.assign({}, context, ctx || {});
      },
      isRunning: function () { return running; },
      _nextGap: nextGap
    };
  }

  global.MCDCat = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
