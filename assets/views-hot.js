/* =====================================================================
 * 中山一号 · 热点作文素材 模块（views-hot.js）
 * 依赖：A.pageHead / A.render / A.aiChat / A.md2html / S.put / S.all
 *        P.essayMaterial / P.essayOutline
 * 流程：浏览热点话题 → 一键「整理成作文素材」或「速写大纲」→
 *       本机免费大模型生成 → 渲染 Markdown → 存入「我的素材库」。
 * ===================================================================== */
(function () {
  var A = window.ZSApp, S = window.ZSStore, P = window.ZS_PROMPTS;
  if (!A || !S) { console.warn('views-hot: 依赖未就绪'); return; }
  var el = A.el, $$ = A.$$, esc = A.esc, toast = A.toast, state = A.state;

  A.view('hot', async function () {
    var list = (window.ZS_HOT || []).slice();
    var html = A.pageHead('热点作文素材', '把时事热点一键整理成可用的议论文素材包与速写大纲。素材均由本机免费大模型生成，立场正面、可考据，落笔前请核证最新事例。',
      '<span class="chip">本机大模型生成</span>');

    html += '<div class="card pad-s mb"><div class="row wrap">' +
      list.map(function (t) {
        return '<span class="chip">' + esc(t.title) + '</span>';
      }).join('') +
      '</div><p class="small muted mt">共 ' + list.length + ' 个热点主题，点下方卡片中的按钮即可生成素材或大纲。</p></div>';

    html += '<div class="grid cards">' + list.map(function (t, i) {
      return '<div class="card pad-s" data-i="' + i + '">' +
        '<div class="row between"><b>' + esc(t.title) + '</b><span class="small muted">' + esc(t.date || '') + '</span></div>' +
        '<div class="row wrap mt" style="gap:4px">' + t.tags.map(function (g) {
          return '<span class="chip sm">' + esc(g) + '</span>'; }).join('') + '</div>' +
        '<p class="small muted mt" style="line-height:1.7">' + esc(t.summary) + '</p>' +
        '<div class="row mt">' +
        '<button class="btn sm primary" data-act="material" data-i="' + i + '">整理成作文素材</button>' +
        '<button class="btn sm" data-act="outline" data-i="' + i + '">生成速写大纲</button>' +
        '</div></div>';
    }).join('') + '</div>';

    html += '<div class="ai-panel mb"><div class="ai-head">✦ 生成结果' +
      '<span class="spacer"></span><button class="btn sm ghost" id="hot-dl" disabled>导出 Markdown</button></div>' +
      '<div class="md-body" id="hot-ai">点上方任意话题的按钮，生成结果会显示在这里。</div></div>';

    html += '<div class="card"><h3>我的素材库</h3><div id="hot-hist"></div></div>';
    A.render(html);

    var lastMd = '';
    el('hot-dl').onclick = function () {
      if (lastMd) A.download('作文素材_' + Date.now() + '.md', lastMd);
    };

    $$('[data-act]').forEach(function (btn) {
      btn.onclick = function () {
        var i = +btn.dataset.i, t = list[i], act = btn.dataset.act;
        var promptSpec = (act === 'outline')
          ? P.essayOutline({ topic: t.title + '：' + t.summary })
          : P.essayMaterial({ topic: t.title + '：' + t.summary, source: t.source });
        var kind = (act === 'outline') ? '速写大纲' : '作文素材';
        var box = el('hot-ai');
        box.className = 'md-body'; box.textContent = '正在基于「' + t.title + '」生成' + kind + '……';
        el('hot-dl').disabled = true;
        var acc = '';   // onDelta 传的是增量片段，必须累加才能看到全文
        A.aiChat(promptSpec, { onDelta: function (d) { acc += d; box.textContent = acc; } }).then(function (md) {
          lastMd = md;
          box.className = 'md-body'; box.innerHTML = A.md2html(md);
          if (window.ZSApp.renderMath) window.ZSApp.renderMath(box);
          el('hot-dl').disabled = false;
          if (A.state.user) {
            S.put('essay_materials', { id: 'em_' + Date.now(), at: new Date().toISOString(),
              topic: t.title, kind: kind, md: md }).catch(function () {});
            loadHist();
          }
        }).catch(function (e) {
          box.textContent = '生成失败：' + (e && e.message ? e.message : e);
        });
      };
    });

    function loadHist() {
      if (!A.state.user) { el('hot-hist').innerHTML = '<p class="small muted">登录后生成的素材会自动存入这里。</p>'; return; }
      S.all('essay_materials').then(function (rows) {
        rows = (rows || []).slice().reverse().slice(0, 10);
        el('hot-hist').innerHTML = rows.length ? rows.map(function (o) {
          return '<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line)">' +
            '<span><b>' + esc(o.topic) + '</b> <span class="chip sm">' + esc(o.kind) + '</span></span>' +
            '<span class="row"><button class="btn sm ghost" data-em="' + esc(o.id) + '">查看</button>' +
            '<button class="btn sm ghost" data-ed="' + esc(o.id) + '">删除</button></span></div>';
        }).join('') : '<p class="small muted">还没有保存的素材。</p>';
        $$('#hot-hist [data-em]').forEach(function (b) {
          b.onclick = function () {
            var o = rows.find(function (r) { return r.id === b.dataset.em; });
            if (o) { el('hot-ai').className = 'md-body'; el('hot-ai').innerHTML = A.md2html(o.md); lastMd = o.md; el('hot-dl').disabled = false; }
          };
        });
        $$('#hot-hist [data-ed]').forEach(function (b) {
          b.onclick = function () {
            S.remove('essay_materials', b.dataset.ed).then(loadHist).catch(function () {
              toast('删除失败', 'err');
            });
          };
        });
      }).catch(function () {});
    }
    loadHist();
  });
})();
