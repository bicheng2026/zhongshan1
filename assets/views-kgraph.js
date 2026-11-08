/* =====================================================================
 * 中山一号 · 知识图谱视图（views-kgraph.js）
 *   A.view('kpoint')   交互式知识点三栏页（左清单 / 中主体 / 右速查）
 *   A.view('diagnose') 前置补漏诊断：错题 → 薄弱知识点 → 未掌握前置 → 补漏路线
 * 全部用纯文字链路呈现，不画图、不依赖外部库（对应建站留档 D04+S14 / S13）。
 * ===================================================================== */
(function () {
  'use strict';
  var A = window.ZSApp, S = window.ZSStore, KG = window.ZSKG;
  if (!A || !S || !KG) { console.warn('views-kgraph: 依赖未就绪'); return; }
  var el = A.el, $$ = A.$$, esc = A.esc, toast = A.toast, state = A.state, go = A.go;
  var SUBJECTS = window.ZS_SUBJECTS, SMAP = window.ZS_SUBJECT_MAP;
  var NS = KG.MASTER_NS;

  function sname(id) { return (SMAP[id] && SMAP[id].name) || id || '全科'; }
  function lvText(l) { return l === 1 ? '基础' : l === 2 ? '进阶' : '综合'; }
  function ul(arr) {
    return '<ul class="kp-ul">' + (arr || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }
  function nodeLink(n, extra) {
    return '<a class="kp-link" href="#/kpoint/' + esc(n.subject) + '/' + esc(n.id) + '">' +
      esc(n.name) + '</a>' + (extra ? '<span class="small muted"> ' + esc(extra) + '</span>' : '');
  }

  /* 掌握度：返回 id → true 的字典 */
  async function masteredMap() {
    var rows = await S.all(NS).catch(function () { return []; });
    var m = {};
    (rows || []).forEach(function (r) { if (r && r.id) m[r.id] = !!r.mastered; });
    return m;
  }

  /* 关联练习弹窗：从本地题库按 tags 匹配，全部只读、不上传 */
  async function showPractice(node) {
    await S.ensure(node.subject);
    var pool = S.filter(node.subject, state.region);
    var qs = KG.matchQuestions(node, pool, 5);
    if (!qs.length) qs = pool.slice(0, 3);
    if (!qs.length) { toast('该科题库暂未加载，先去闯关刷题', 'err'); return; }
    var body = '<p class="small muted mb">按知识点「' + esc(node.name) + '」从本地题库匹配 ' + qs.length +
      ' 道题（科目：' + esc(sname(node.subject)) + '，适用范围：' + esc(state.region) + '）。题目出处逐条标注。</p>';
    qs.forEach(function (q, i) {
      var opts = (q.options || []).map(function (o) { return esc(o.key + '. ' + o.text); }).join('　');
      body += '<div class="card pad-s mb"><div class="row between"><b>' + (i + 1) + '. ' + esc(String(q.stem || '').slice(0, 240)) + '</b>' +
        '<button class="btn sm ghost" data-pa="' + i + '">看答案</button></div>' +
        (opts ? '<div class="small mt">' + opts + '</div>' : '') +
        '<div class="small muted mt">出处：' + esc(q.source || '开源题库') + ' · ' + esc(q.region || '通用') + '</div>' +
        '<div id="pa-' + i + '" class="mt small" style="display:none"><b>答案：</b>' + esc(String(q.answer || '')) +
        '<br><b>解析：</b>' + esc(String(q.analysis || '（无）').slice(0, 600)) + '</div></div>';
    });
    A.modal('关联练习 · ' + node.name, body);
    $$('[data-pa]').forEach(function (b) {
      b.onclick = function () {
        var box = el('pa-' + b.dataset.pa);
        if (!box) return;
        var show = box.style.display === 'none';
        box.style.display = show ? '' : 'none';
        b.textContent = show ? '收起' : '看答案';
      };
    });
  }

  /* ==================== 三栏知识点页 ==================== */
  A.view('kpoint', async function (p) {
    var subject = p[0] || 'all';
    if (subject !== 'all' && !SMAP[subject]) subject = 'all';
    var pool = KG.bySubject(subject === 'all' ? null : subject);
    var wanted = p[1];
    var cur = (wanted && KG.byId(wanted)) ? KG.byId(wanted) : pool[0];
    var master = await masteredMap();

    var html = A.pageHead('知识点图谱', '左：章节清单　中：定义 / 要点 / 公式 / 例题 / 前置链路　右：速查与掌握度。纯文字链路，可点可跳，全部本地。',
      '<span class="chip">' + KG.all().length + ' 个知识点</span>' +
      '<button class="btn sm" id="kp-diag">前置补漏诊断</button>');

    /* 科目标签 */
    var tabs = '<div class="tagbar"><a class="chip' + (subject === 'all' ? ' sel' : '') +
      '" href="#/kpoint/all">全部</a>' + SUBJECTS.map(function (s) {
        return '<a class="chip' + (subject === s.id ? ' sel' : '') + '" href="#/kpoint/' + s.id + '">' + esc(s.name) + '</a>';
      }).join('') + '</div>';
    html += tabs;

    /* 左栏：按章节分组 */
    var groups = {}, order = [];
    pool.forEach(function (n) {
      if (!groups[n.chapter]) { groups[n.chapter] = []; order.push(n.chapter); }
      groups[n.chapter].push(n);
    });
    var left = '<div class="card pad-s kp-list"><h3>章节清单</h3>' +
      order.map(function (ch) {
        return '<div class="kp-group-t">' + esc(ch) + '</div>' + groups[ch].map(function (n) {
          return '<button class="kp-item' + (cur && n.id === cur.id ? ' sel' : '') + '" data-kp="' + esc(n.id) + '">' +
            (master[n.id] ? '<span style="color:#1a7f37">✓ </span>' : '<span class="muted">○ </span>') +
            esc(n.name) + '</button>';
        }).join('');
      }).join('') + '</div>';

    /* 中栏：主体 */
    var mid = '';
    if (!cur) {
      mid = A.emptyBox('这一科还没有知识点', '先切到「全部」或其它科目');
    } else {
      var pres = KG.pre(cur.id), nexts = KG.next(cur.id), ancs = KG.ancestors(cur.id);
      mid = '<div class="card pad-s"><div class="row between wrap">' +
        '<div><h2 style="margin:0">' + esc(cur.name) + '</h2>' +
        '<div class="row wrap mt" style="gap:5px"><span class="chip blue">' + esc(sname(cur.subject)) + '</span>' +
        '<span class="chip">' + esc(cur.chapter) + '</span>' +
        '<span class="chip ' + (cur.level === 3 ? 'orange' : cur.level === 2 ? 'warn' : 'green') + '">' + lvText(cur.level) + '</span>' +
        (master[cur.id] ? '<span class="chip green">已掌握</span>' : '') + '</div></div>' +
        '<div class="row"><button class="btn sm" id="kp-practice">练相关题</button>' +
        '<button class="btn sm ghost" id="kp-master">' + (master[cur.id] ? '取消掌握' : '标记已掌握') + '</button></div></div>';

      mid += '<div class="kp-sec"><h3>① 一句话定义</h3><p class="kp-def">' + esc(cur.def || '') + '</p></div>';
      mid += '<div class="kp-sec"><h3>② 核心要点</h3>' + ul(cur.points) + '</div>';
      mid += '<div class="kp-sec"><h3>③ 公式 / 定理 / 结构</h3>' +
        '<div class="kp-formula">' + (cur.formulas || []).map(function (f) {
          return '<div class="kp-fline">' + esc(f) + '</div>'; }).join('') + '</div></div>';
      mid += '<div class="kp-sec"><h3>④ 典型例题（点开看思路）</h3>' +
        '<div class="q-stem">' + esc(cur.example || '') + '</div>' +
        '<button class="btn sm ghost mt" id="kp-ex">查看解题思路</button>' +
        '<div id="kp-ex-body" class="kp-answer mt" style="display:none">' + esc(cur.exampleAns || '') + '</div></div>';
      mid += '<div class="kp-sec"><h3>⑤ 前置链路（没搞懂这些，先看它们）</h3>' +
        (pres.length ? '<div class="kp-chain">' + pres.map(function (n) {
          return '<div>· ' + nodeLink(n, '[' + sname(n.subject) + ']') +
            (master[n.id] ? ' <span class="chip sm green">已掌握</span>' : ' <span class="chip sm warn">待巩固</span>') + '</div>';
        }).join('') + '</div>' : '<p class="small muted">已是该科最底层知识点，无前置。</p>') +
        (ancs.length > pres.length ? '<p class="small muted mt">再往上一层还有：' +
          ancs.filter(function (a) { return (cur.pre || []).indexOf(a.node.id) < 0; })
            .slice(0, 6).map(function (a) { return esc(a.node.name); }).join(' → ') + '</p>' : '') + '</div>';
      mid += '<div class="kp-sec"><h3>⑥ 后继知识点（学完可以往这里走）</h3>' +
        (nexts.length ? nexts.map(function (n) { return '<div>· ' + nodeLink(n, '[' + sname(n.subject) + ']') + '</div>'; }).join('')
          : '<p class="small muted">暂无后继节点。</p>') + '</div>';
      mid += '<div class="kp-sec"><h3>⑦ 易错提醒</h3><p class="kp-tip">' + esc(cur.tips || '') + '</p></div>';
      mid += '</div>';
    }

    /* 右栏：速查 */
    var right = '';
    if (cur) {
      var chain = KG.ancestors(cur.id);
      right = '<div class="card pad-s"><h3>定义与参数速查</h3>' +
        '<div class="small muted mb">' + esc(cur.name) + ' · ' + lvText(cur.level) + '</div>' +
        '<div class="kp-quick">' + (cur.formulas || []).map(function (f) {
          return '<div class="kp-qline">' + esc(f) + '</div>'; }).join('') + '</div>' +
        '<div class="divider"></div><h3>图谱位置</h3>' +
        '<table class="tbl small"><tr><td>所属科目</td><td>' + esc(sname(cur.subject)) + '</td></tr>' +
        '<tr><td>所属章节</td><td>' + esc(cur.chapter) + '</td></tr>' +
        '<tr><td>难度层级</td><td>' + lvText(cur.level) + '</td></tr>' +
        '<tr><td>直接前置</td><td>' + KG.pre(cur.id).length + ' 个</td></tr>' +
        '<tr><td>全部祖先</td><td>' + chain.length + ' 个</td></tr>' +
        '<tr><td>后继节点</td><td>' + KG.next(cur.id).length + ' 个</td></tr></table>' +
        '<div class="divider"></div><h3>关联题目标签</h3><div class="row wrap" style="gap:4px">' +
        (cur.tags || []).map(function (t) { return '<span class="chip sm">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<div class="divider"></div><p class="small muted">掌握度只存本机，用于「前置补漏诊断」判断哪些前置还没打好基础。</p>' +
        '<button class="btn sm block mt" id="kp-diag2">去补漏诊断</button></div>';
    } else {
      right = '<div class="card pad-s"><p class="small muted">选中知识点后显示速查。</p></div>';
    }

    html += '<div class="kp-wrap">' + left + '<div>' + mid + '</div>' + right + '</div>';
    html += '<div class="card mt"><p class="small muted">图谱为本站自建精简版（六科核心知识点与前置关系），' +
      '不引用外部 K12-KGraph 数据集：那份数据许可需单独核实，且不利于离线单文件。这里的用途是「按前置关系找根因、推练习」，' +
      '不是完整教材知识树；具体结论以人教版教材与课堂讲授为准。</p></div>';
    A.render(html);

    el('kp-diag').onclick = function () { go('diagnose'); };
    if (el('kp-diag2')) el('kp-diag2').onclick = function () { go('diagnose'); };
    $$('[data-kp]').forEach(function (b) {
      b.onclick = function () { go('kpoint/' + subject + '/' + b.dataset.kp); };
    });
    if (!cur) return;
    if (el('kp-ex')) el('kp-ex').onclick = function () {
      var box = el('kp-ex-body');
      var show = box.style.display === 'none';
      box.style.display = show ? '' : 'none';
      el('kp-ex').textContent = show ? '收起思路' : '查看解题思路';
    };
    el('kp-practice').onclick = function () { showPractice(cur); };
    el('kp-master').onclick = async function () {
      if (!await A.requireLogin('标记掌握')) return;
      await S.put(NS, { id: cur.id, at: new Date().toISOString(), mastered: !master[cur.id] });
      toast(master[cur.id] ? '已取消掌握' : '已标记为掌握', 'ok');
      go('kpoint/' + subject + '/' + cur.id);
    };
  });

  /* ==================== 前置补漏诊断 ==================== */
  A.view('diagnose', async function () {
    var wrongs = (await S.all('wrong_book').catch(function () { return []; }) || []).filter(function (w) { return !w.mastered; });
    await Promise.all(Array.from(new Set(wrongs.map(function (w) { return w.subject; }))).map(function (s) { return S.ensure(s); }));
    var recs = await S.all('study_records').catch(function () { return []; });
    var master = await masteredMap();

    /* 归因：每道错题 → 最匹配知识点；命中次数即薄弱热度 */
    var stat = {}, unmatched = [];
    wrongs.forEach(function (w) {
      var q = S.getQ(w.qid);
      var node = KG.matchNode(q || { subject: w.subject, tags: [], stem: '' }, w.subject);
      if (node) {
        if (!stat[node.id]) stat[node.id] = { node: node, count: 0, samples: [] };
        stat[node.id].count++;
        if (stat[node.id].samples.length < 2) stat[node.id].samples.push(String((q && q.stem) || '（题干缺失）').slice(0, 70));
      } else unmatched.push(w);
    });
    var weak = Object.keys(stat).map(function (k) { return stat[k]; })
      .sort(function (a, b) { return b.count - a.count; });

    /* 沿前置链找"未掌握的根因"，按拓扑深度排序、去重 */
    var gaps = {}, gapList = [];
    weak.forEach(function (w) {
      KG.ancestors(w.node.id).forEach(function (a) {
        if (master[a.node.id]) return;
        if (gaps[a.node.id]) return;
        gaps[a.node.id] = true;
        gapList.push({ node: a.node, depth: a.depth, from: w.node.name });
      });
      if (!master[w.node.id] && !gaps[w.node.id]) {
        gaps[w.node.id] = true;
        gapList.push({ node: w.node, depth: 0, from: w.node.name });
      }
    });
    /* depth 大＝更基础的先修课，排在前面先补；当前薄弱点 depth=0 落最后 */
    gapList.sort(function (a, b) {
      return b.depth - a.depth || a.node.level - b.node.level ||
        String(a.node.name).localeCompare(String(b.node.name));
    });

    var acc = recs.length ? Math.round(recs.filter(function (r) { return r.correct; }).length / recs.length * 100) : 0;
    var html = A.pageHead('前置补漏诊断', '错题 → 定位薄弱知识点 → 沿前置关系找没打好的根 → 按顺序补。数据在①本机分析，不外发。',
      '<span class="chip ' + (wrongs.length ? 'warn' : 'green') + '">待消灭错题 ' + wrongs.length + ' 条</span>' +
      '<button class="btn sm" id="dg-kp">去知识点图谱</button>');

    html += '<div class="grid g4 mb">' +
      '<div class="card pad-s"><div class="stat"><b>' + wrongs.length + '</b><span>待消灭错题</span></div></div>' +
      '<div class="card pad-s"><div class="stat"><b>' + weak.length + '</b><span>命中薄弱知识点</span></div></div>' +
      '<div class="card pad-s"><div class="stat"><b>' + gapList.length + '</b><span>待补前置 / 知识点</span></div></div>' +
      '<div class="card pad-s"><div class="stat"><b>' + acc + '%</b><span>历史答题正确率</span></div></div></div>';

    if (!wrongs.length) {
      html += A.emptyBox('错题本是空的', '先去「闯关刷题」或「在线模考」产生错题，诊断才有依据；也可以直接点右上角去看图谱。');
    } else {
      /* 一、薄弱知识点归因表 */
      html += '<div class="card mb"><h3>一、薄弱知识点归因</h3>' +
        '<p class="small muted">按题目的标签 / 章节 / 题干关键词匹配到本地图谱节点，命中数越高说明这块越集中出错。</p>' +
        '<table class="tbl mt"><tr><th>知识点</th><th>科目 · 章节</th><th>错题数</th><th>状态</th><th>操作</th></tr>' +
        weak.map(function (w) {
          return '<tr><td><b>' + esc(w.node.name) + '</b></td>' +
            '<td class="small muted">' + esc(sname(w.node.subject)) + ' · ' + esc(w.node.chapter) + '</td>' +
            '<td><span class="chip red">' + w.count + '</span></td>' +
            '<td>' + (master[w.node.id] ? '<span class="chip green">已掌握</span>' : '<span class="chip warn">待巩固</span>') + '</td>' +
            '<td><button class="btn sm ghost" data-dg-go="' + esc(w.node.id) + '">看精讲</button> ' +
            '<button class="btn sm ghost" data-dg-pr="' + esc(w.node.id) + '">练相关题</button></td></tr>';
        }).join('') + '</table>' +
        (unmatched.length ? '<p class="small muted mt">另有 ' + unmatched.length + ' 道错题未匹配到图谱节点（题库标签与图谱暂未覆盖），已略过，不影响其它归因。</p>' : '') +
        '</div>';

      /* 二、补漏路线 */
      html += '<div class="card mb"><h3>二、补漏路线（先看最底层）</h3>' +
        '<p class="small muted">按前置关系从"最基础的缺口"往"当前薄弱点"排。已标记掌握的节点会自动跳过。</p>' +
        (gapList.length ? '<div class="kp-route">' + gapList.map(function (g, i) {
          return '<div class="kp-route-item"><span class="kp-step">' + (i + 1) + '</span>' +
            '<div><div class="row wrap" style="gap:5px"><b>' + esc(g.node.name) + '</b>' +
            '<span class="chip sm">' + esc(sname(g.node.subject)) + '</span>' +
            '<span class="chip sm ' + (g.node.level === 3 ? 'orange' : '') + '">' + lvText(g.node.level) + '</span>' +
            '<span class="chip sm blue">前置深度 ' + g.depth + '</span></div>' +
            '<div class="small muted mt">' + esc(g.node.def || '') + '</div>' +
            '<div class="small muted mt">由「' + esc(g.from) + '」回溯得到</div>' +
            '<div class="row mt"><button class="btn sm" data-dg-go="' + esc(g.node.id) + '">看精讲</button>' +
            '<button class="btn sm ghost" data-dg-pr="' + esc(g.node.id) + '">练相关题</button></div></div></div>';
        }).join('') + '</div>' : '<p class="small">所有相关前置都已掌握，可以直接重做错题巩固。</p>') + '</div>';

      /* 三、归因明细 */
      html += '<div class="card"><h3>三、错题归因明细（最近 8 条）</h3>' +
        wrongs.slice(0, 8).map(function (w) {
          var q = S.getQ(w.qid);
          var n = KG.matchNode(q || { subject: w.subject, tags: [], stem: '' }, w.subject);
          return '<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">' +
            '<span class="small">' + esc(String((q && q.stem) || '（题干已不在题库）').slice(0, 90)) + '</span>' +
            '<span>' + (n ? '<a class="kp-link" href="#/kpoint/' + esc(n.subject) + '/' + esc(n.id) + '">' + esc(n.name) + '</a>' : '<span class="small muted">未匹配</span>') + '</span></div>';
        }).join('') + '</div>';
    }

    html += '<div class="card mt"><p class="small muted">说明：这是"精简图谱 + 规则匹配"的本地诊断，不是大模型推理，' +
      '匹配不上的题会如实标为「未匹配」而不硬凑。图谱与掌握度均只存本机浏览器。</p></div>';
    A.render(html);

    el('dg-kp').onclick = function () { go('kpoint/all'); };
    $$('[data-dg-go]').forEach(function (b) {
      b.onclick = function () {
        var n = KG.byId(b.dataset.dgGo); if (n) go('kpoint/' + n.subject + '/' + n.id);
      };
    });
    $$('[data-dg-pr]').forEach(function (b) {
      b.onclick = function () {
        var n = KG.byId(b.dataset.dgPr); if (n) showPractice(n);
      };
    });
  });

  /* 错题本入口按钮由 views-study.js 注入；这里也兜底暴露给其它视图 */
  window.ZSKGViews = { showPractice: showPractice };
})();
