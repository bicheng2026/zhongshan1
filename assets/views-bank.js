/* =====================================================================
 * 中山一号 · 导入题库（views-bank.js）
 *
 * 数据来源：data/q-extra.js（由 _ingest/build_bank.py 生成）
 *   window.ZS_Q_EXTRA  已入库题目（按科目），已被 app.js 并进 window.ZS_Q
 *   window.ZS_Q_REVIEW 抽不到原文答案、暂不进可判分题库的题
 *
 * 这些题是网站自身的数据文件，不是外链、不是跳转、不是网盘预览。
 * 闯关 / 模考 / 错题本 / AI 讲解走的是同一份 ZS_Q，无需额外接线。
 * ===================================================================== */
(function () {
  'use strict';
  var A = window.ZSApp;
  if (!A) { console.warn('views-bank: ZSApp 未就绪'); return; }
  var esc = A.esc, el = A.el;

  function subjectName(id) {
    var m = window.ZS_SUBJECT_MAP || {};
    return (m[id] && m[id].name) || id || '未分科';
  }
  function imported() {
    var ex = window.ZS_Q_EXTRA || {}, out = [];
    Object.keys(ex).forEach(function (s) {
      (ex[s] || []).forEach(function (q) { out.push({ q: q, s: s }); });
    });
    return out;
  }
  function oneLine(s, n) {
    return String(s || '').replace(/\s+/g, ' ').slice(0, n || 90);
  }

  A.view('bank', async function () {
    var list = imported(), review = window.ZS_Q_REVIEW || [], by = {};
    list.forEach(function (x) { by[x.s] = (by[x.s] || 0) + 1; });
    var chips = Object.keys(by).map(function (s) {
      return '<span class="chip">' + esc(subjectName(s)) + ' ' + by[s] + ' 道</span>';
    }).join('');

    var html = A.pageHead('导入题库',
      'PDF / Word 里的题目已转成站内题目，直接进闯关、模考、错题本；点开就刷，不跳外链、不下载原文件。',
      '<span class="chip green">站内题库</span>');
    html += '<div class="card pad-s mb"><div class="row wrap">' +
      '<b style="font-size:18px">' + list.length + '</b><span class="small muted">道可直接刷</span>' +
      '<b style="font-size:18px;margin-left:16px">' + review.length + '</b><span class="small muted">道待补答案</span>' +
      chips + '</div><div class="row wrap mt">' +
      '<button class="btn primary" id="bk-go">去刷这些题</button>' +
      (review.length ? '<button class="btn ghost" id="bk-export">导出待复核清单</button>' : '') +
      '<span class="small muted">题目是本站 data/q-extra.js 里的数据，和现有题库同格式，不在任何外部网盘。</span>' +
      '</div></div>';

    if (!list.length && !review.length) {
      html += A.emptyBox('还没有导入题目', '把 PDF / Word 放进 _aliyun_raw，跑 ingest.py 与 build_bank.py 后即出现在这里。');
      A.render(html);
      return;
    }

    html += '<div class="card pad-s mb"><h3>已入库（' + list.length + '）</h3><div id="bk-list"></div></div>';
    html += '<div class="card pad-s"><h3>待复核（' + review.length + '）</h3>' +
      '<p class="small muted">原文里没有明确答案，脚本不编答案，所以暂不进可判分题库。补齐答案后重新构建即可入库。</p>' +
      '<div id="bk-review"></div></div>';
    A.render(html);

    el('bk-list').innerHTML = list.length ? list.map(function (x, i) {
      var q = x.q, opts = (q.options || []).length;
      return '<div class="card pad-s" style="margin-bottom:8px">' +
        '<div class="row between"><b>' + esc((i + 1) + '. ' + oneLine(q.stem)) + '</b>' +
        '<span class="chip">' + esc(subjectName(x.s)) + '</span></div>' +
        '<p class="small muted" style="margin:6px 0 0">' +
        (q.type === 'choice' ? '选择题 · ' + opts + ' 个选项' : '开放题') +
        '　答案：' + esc(q.answer || '—') + '　来源：' + esc(q.source || '—') + '</p></div>';
    }).join('') : '<p class="small muted">暂无。</p>';

    el('bk-review').innerHTML = review.length ? review.map(function (q, i) {
      return '<div class="card pad-s" style="margin-bottom:8px">' +
        '<div class="row between"><b>' + esc((i + 1) + '. ' + oneLine(q.stem, 70)) + '</b>' +
        '<span class="chip">' + esc((q.review || []).join(' / ')) + '</span></div>' +
        '<p class="small muted" style="margin:6px 0 0">' + esc(q.source || '—') + '</p></div>';
    }).join('') : '<p class="small muted">没有待复核题目。</p>';

    el('bk-go').onclick = function () {
      var best = '', n = 0;
      Object.keys(by).forEach(function (s) { if (by[s] > n) { n = by[s]; best = s; } });
      if (!best) {
        var s2 = window.ZS_Q_REVIEW && window.ZS_Q_REVIEW[0];
        best = (s2 && s2.subject && s2.subject !== 'unknown') ? s2.subject : 'math';
      }
      A.go('subject/' + best);
    };
    if (el('bk-export')) {
      el('bk-export').onclick = function () {
        A.download('中山一号-待复核-' + A.today() + '.json',
          JSON.stringify(review, null, 2), 'application/json;charset=utf-8');
        A.toast('已导出，补好答案交回给毕成重新构建即可入库', 'ok');
      };
    }
  });
})();
