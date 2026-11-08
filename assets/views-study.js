/* 中山一号 · 学习主线视图
 * home / subject / quest / practice / wrong / papers / exam / records */
(function () {
  'use strict';
  var A = window.ZSApp, S = window.ZSStore, G = window.ZSGame, B = window.ZSBackend;
  var SMAP = window.ZS_SUBJECT_MAP, SUBJECTS = window.ZS_SUBJECTS;
  var esc = A.esc, el = A.el, $$ = A.$$, go = A.go, toast = A.toast;
  var state = A.state;

  function sname(id) { return (SMAP[id] && SMAP[id].name) || id || '全科'; }
  function scolor(id) { return (SMAP[id] && SMAP[id].color) || '#1f5fbf'; }
  function ssoft(id) { return (SMAP[id] && SMAP[id].soft) || '#e8f0fd'; }

  /* ---------------- 学科资料：直接挂进各学科入口，不新开栏目 ----------------
     数据仍是 ZS_DRIVE（学科资料）与 ZS_DOWNLOADS（整卷），只是让「学科专属」
     页面本身就能看到本科材料，不必先去资料库再筛一次。 */
  var MAT_TAG = { essay: '作文素材', exp: '经验学法', lex: '词汇资料', paper: '整卷', ref: '资料' };
  function materials(sid) {
    return (window.ZS_DRIVE || []).filter(function (x) { return x.subject === sid; });
  }
  function subjectPapers(sid) {
    return (window.ZS_DOWNLOADS || []).filter(function (x) { return x.subject === sid; });
  }
  function materialCount(sid) { return materials(sid).length + subjectPapers(sid).length; }
  function materialCard(it) {
    var meta = [it.year ? it.year + ' 年' : '', String(it.type || '').toUpperCase(),
                it.sizeKB ? Math.round(it.sizeKB) + ' KB' : ''].filter(Boolean).join(' · ');
    var acts = (it.file ? '<a class="btn sm primary" href="' + esc(it.file) + '" download>下载原件</a>' : '') +
      (it.md ? '<button class="btn sm ghost" data-mat-md="' + esc(it.md) + '">阅读</button>' : '') +
      (it.type === 'pdf' ? '<button class="btn sm ghost" data-mat-open="' + esc(it.file) + '">打印/预览</button>' : '');
    var tag = (it.tags || [])[0];
    return '<div class="card pad-s" style="margin:0">' +
      '<div class="row between" style="gap:8px"><b>' + esc(it.name) + '</b>' +
      (tag ? '<span class="chip" style="flex:none">' + esc(MAT_TAG[tag] || tag) + '</span>' : '') + '</div>' +
      '<p class="small muted" style="margin:6px 0 8px">' + esc(meta) + '</p>' +
      (acts ? '<div class="row">' + acts + '</div>' : '') + '</div>';
  }
  function bindMaterial(root) {
    var scope = root || document;
    scope.querySelectorAll('[data-mat-md]').forEach(function (b) {
      b.onclick = async function () {
        var path = b.getAttribute('data-mat-md');
        try {
          var r = await fetch(path);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          var md = await r.text();
          A.modal('阅读 · ' + path.split('/').pop().replace(/\.md$/, ''),
            '<div class="md" style="max-height:70vh;overflow:auto">' + A.md2html(md) + '</div>');
        } catch (e) {
          A.modal('无法预览',
            '<p class="muted">本地 file:// 打开时浏览器禁止读文件，请点「下载原件」，或用「启动本地预览」的本地服务器访问。</p>');
        }
      };
    });
    scope.querySelectorAll('[data-mat-open]').forEach(function (b) {
      b.onclick = function () { window.open(b.getAttribute('data-mat-open'), '_blank'); };
    });
  }
  function qMap(subject) {
    var m = {}; S.q(subject).forEach(function (q) { m[q.id] = q; }); return m;
  }
  function typeName(t) { return ({ choice: '选择题', fill: '填空题', open: '解答题' })[t] || '题目'; }
  function typeChip(q) {
    return '<span class="chip">' + (A.isMulti(q) ? '多选题' : typeName(q.type)) + '</span>' +
      (q.year ? '<span class="chip">' + q.year + ' 年</span>' : '') +
      (q.region ? '<span class="chip blue">' + esc(q.region) + '</span>' : '');
  }
  function answerText(q) {
    if (q.type === 'choice') {
      var o = (q.options || []).find(function (x) { return x.key === q.answer; });
      return q.answer + (o ? '. ' + o.text : '');
    }
    return q.answer || '（题库未给标准答案）';
  }

  /* ==================== 首页 ==================== */
  A.view('home', async function () {
    var recs = await S.all('study_records');
    var wrongs = await S.all('wrong_book');
    var exams = await S.all('exam_records');
    var rank = G.rank(), next = G.nextRank();
    var accuracy = recs.length ? Math.round(recs.filter(function (r) { return r.correct; }).length / recs.length * 100) : 0;
    var bySubject = {};
    recs.forEach(function (r) { bySubject[r.subject] = (bySubject[r.subject] || 0) + 1; });

    var html = A.pageHead('你好，' + (state.user ? state.user.name : '同学'),
      '今天也来闯一关。所有进度自动存在' + (state.mode === 'cloud' ? '你的云账号' : '这台电脑') + '里。',
      '<button class="btn primary" id="h-go-quest">开始闯关</button>' +
      '<button class="btn" id="h-go-daily">每日一练</button>');

    html += '<div class="grid g4 mb">' +
      '<div class="card pad-s"><div class="row"><div class="rank-badge">' + rank.badge + '</div>' +
      '<div class="stat"><b>' + rank.name + '</b><span>' + state.xp + ' XP' + (next ? ' · 距下一段 ' + (next.min - state.xp) : ' · 已满级') + '</span></div></div>' +
      '<div class="bar thin mt"><i style="width:' + G.progressPct() + '%"></i></div></div>' +
      '<div class="card pad-s"><div class="stat"><b>' + recs.length + '</b><span>累计答题</span></div>' +
      '<div class="small muted mt">正确率 ' + accuracy + '% · 最高连击 ' + state.bestCombo + '</div></div>' +
      '<div class="card pad-s"><div class="stat"><b>' + wrongs.filter(function (w) { return !w.mastered; }).length + '</b><span>待消灭错题</span></div>' +
      '<div class="small muted mt">共收录 ' + wrongs.length + ' 条</div></div>' +
      '<div class="card pad-s"><div class="stat"><b>' + exams.length + '</b><span>模考次数</span></div>' +
      '<div class="small muted mt">' + (exams.length ? '最近 ' + A.fmtDate(exams[exams.length - 1].at) : '还没上过考场') + '</div></div>' +
      '</div>';

    /* 四张快捷卡 */
    html += '<div class="grid g4 mb">' +
      quick('关', '闯关刷题', '十关递进，答对连击加倍 XP', 'quest', 'var(--primary-soft)', 'var(--primary)') +
      quick('伴', '语音伴学', '讲一遍本周所学，AI 纠错补漏', 'companion', 'var(--accent-soft)', 'var(--accent)') +
      quick('考', '在线模考', '整卷计时，交卷自动判分 + 诊断', 'exam', 'var(--ok-soft)', 'var(--ok)') +
      quick('纲', '笔记成纲', '口述 / 上传笔记，整理成复习提纲', 'notes', 'var(--warn-soft)', 'var(--warn)') +
      '</div>';

    /* 六科入口 */
    html += '<h2 class="mb">六科专属入口 <span class="small muted" style="font-weight:400">· 各学科资料与整卷已归在对应入口内</span></h2><div class="grid g3 mb">';
    SUBJECTS.forEach(function (s) {
      html += '<div class="subject-tile" data-subject="' + s.id + '" style="background:' + s.soft + '">' +
        '<span class="st-count">' + S.count(s.id) + ' 题 · ' + materialCount(s.id) + ' 份材料</span>' +
        '<div class="st-ico" style="color:' + s.color + '">' + s.short + '</div>' +
        '<div class="st-name" style="color:' + s.color + '">' + s.name + '</div>' +
        '<div class="st-desc">' + esc(s.desc) + '</div>' +
        '<div class="mt small strong" style="color:' + s.color + '">进入 →</div></div>';
    });
    html += '</div>';

    /* 考情说明 + 最近记录 */
    html += '<div class="grid g2">' +
      '<div class="card"><h3>广西考情（本站默认口径）</h3>' +
      '<p class="small" style="line-height:1.9">' + esc(window.ZS_REGION_INFO.note) + '</p>' +
      '<div class="row mt"><span class="chip orange">默认优先：广西 / 新课标 II 卷</span>' +
      '<span class="chip">可切换拓展省份</span></div>' +
      '<div class="divider"></div><p class="small muted">题目出处在每道题上都有标注；题库来自开源仓库，' +
      '教材与整卷只走本地或开源直链，不进云数据库，零流量消耗。</p></div>' +
      '<div class="card"><div class="row between"><h3 style="margin:0">最近学习</h3>' +
      '<a class="small" href="#/records">全部记录 →</a></div>' +
      (recs.length ? '<table class="tbl mt"><tr><th>科目</th><th>出处</th><th>结果</th><th>时间</th></tr>' +
        recs.slice(-6).reverse().map(function (r) {
          return '<tr><td>' + sname(r.subject) + '</td><td class="small muted">' + esc((r.source || '').slice(0, 22)) + '</td>' +
            '<td>' + (r.correct ? '<span class="chip green">对</span>' : '<span class="chip red">错</span>') + '</td>' +
            '<td class="small muted">' + A.fmtTime(r.at) + '</td></tr>';
        }).join('') + '</table>' : A.emptyBox('还没有答题记录', '去「闯关刷题」开第一关，或点上面的快捷入口')) +
      '</div></div>';

    /* 一键部署 / 离线版说明 */
    html += '<div class="card mb" style="border:1px solid var(--primary);background:var(--primary-soft)">' +
      '<div class="row between wrap"><div style="flex:1;min-width:240px"><h3 style="margin:0">📦 一键部署到本机 · 离线也能用</h3>' +
      '<p class="small muted" style="margin:4px 0 0">把整站打成一个 HTML 文件，双击即用，不依赖网络与服务器，数据只存你本机浏览器。</p></div>' +
      '<button class="btn primary" id="h-deploy">⬇ 下载离线单文件版</button></div>' +
      '<div class="small muted mt" style="line-height:1.8">' +
      '• 下载得到 <code>中山一号.html</code>，拷到任意电脑双击打开即可用（进度、错题、笔记都跟着这台电脑）。<br>' +
      '• <b>云端与手机都能用免费模型</b>：默认走云端免费模型代理（B1），服务商 Key 只存在服务端、前端零 Key；本机 ofm 回环网关只作备用（公网页面请求 <code>127.0.0.1</code> 会被浏览器 PNA 预检拦掉）。<br>' +
      '• 代理还没部署或临时断线时，AI 自动回退本机网关或内置离线教练，永不白屏。<br>' +
      '• 部署要点：把生成的 <code>中山一号.html</code> 和在线站点的 <code>index.html</code> 放在同一目录（或同一仓库根），上面的按钮才能正确下载。</div></div>';

    A.render(html);
    el('h-go-quest').onclick = function () { go('quest'); };
    el('h-go-daily').onclick = function () { go('daily'); };
    if (el('h-deploy')) el('h-deploy').onclick = function () {
      var href = (location.protocol === 'file:') ? '../中山一号.html' : '中山一号.html';
      var a = document.createElement('a');
      a.href = href; a.download = '中山一号.html';
      fetch(href, { method: 'HEAD' }).then(function (r) {
        if (r.ok) a.click();
        else toast('未找到离线包，请先把 中山一号.html 放到本站旁边（同目录）', 'err');
      }).catch(function () { a.click(); }); // file:// 下 fetch 受限，直接尝试下载
    };
    $$('[data-subject]').forEach(function (n) {
      n.onclick = function () { go('subject/' + n.dataset.subject); };
    });
  });
  function quick(ico, title, desc, route, bg, color) {
    return '<div class="card hover pad-s" data-quick="' + route + '">' +
      '<div class="row"><span class="rank-badge" style="background:' + bg + ';color:' + color + '">' + ico + '</span>' +
      '<div><div class="strong">' + title + '</div><div class="small muted">' + desc + '</div></div></div></div>';
  }

  /* 首页快捷卡事件委托（render 后统一补） */
  var _origRender = A.render;
  A.render = function (html) {
    _origRender(html);
    $$('[data-quick]').forEach(function (n) { n.onclick = function () { go(n.dataset.quick); }; });
    $$('[data-link]').forEach(function (n) { n.onclick = function () { go(n.dataset.link); }; });
  };

  /* ==================== 科目专属入口 ==================== */
  A.view('subject', async function (p) {
    var id = p[0];
    if (!SMAP[id]) { A.render(A.emptyBox('没有这个科目', '请从首页六科入口进入')); return; }
    await S.ensure(id);
    var s = SMAP[id], qs = S.q(id);
    var concl = S.conclusions(id), books = S.textbooks(id), papers = S.buildPapers(id);
    var mats = materials(id).slice().sort(function (a, b) {
      /* 语文页把作文素材置顶：主公要求作文素材归在语文里、不散落在外 */
      var ae = (a.tags || []).indexOf('essay') >= 0 ? 0 : 1;
      var be = (b.tags || []).indexOf('essay') >= 0 ? 0 : 1;
      return ae - be;
    });
    var packs = subjectPapers(id);   // 本科整卷，直接进学科入口
    var essays = mats.filter(function (x) { return (x.tags || []).indexOf('essay') >= 0; }).length;
    var recs = await S.query('study_records', function (r) { return r.subject === id; });
    var wrongs = await S.query('wrong_book', function (r) { return r.subject === id; });

    var html = '<div class="card mb" style="background:' + s.soft + ';border-color:transparent">' +
      '<div class="row between"><div class="row"><div class="rank-badge" style="background:' + s.color + ';color:#fff">' + s.short + '</div>' +
      '<div><h1 style="margin:0;color:' + s.color + '">' + s.name + '</h1>' +
      '<p class="small" style="margin:2px 0 0">' + esc(s.desc) + '</p></div></div>' +
      '<div class="row"><span class="chip">' + qs.length + ' 道题</span><span class="chip">' + concl.length + ' 条二级结论</span>' +
      '<span class="chip">' + papers.length + ' 套整卷</span><span class="chip">' + mats.length + ' 份学科资料</span></div></div></div>';

    html += '<div class="grid g4 mb">' +
      linkCard('进入闯关', '十关递进，逐题 AI 指导', 'quest/' + id, s.color) +
      linkCard('本科整卷', '组卷 / 下载 / 模考', 'papers/' + id, s.color) +
      linkCard('每日一练', '一次导出七天包', 'daily/' + id, s.color) +
      linkCard('语音复盘', '口述本周所学', 'companion/' + id, s.color) +
      '</div>';

    /* 本科资料：资料本体按 subject 挂进本学科入口，不再只堆在「资料库 → 学科资料」里。
       语文页因此能直接看到作文素材/作文指导，数学化学页能看到二轮专题，英语页能看到词汇。 */
    html += '<div class="card mb"><div class="row between" style="gap:10px;flex-wrap:wrap">' +
      '<div><h3 style="margin:0">' + esc(s.name) + '学科资料</h3>' +
      '<p class="small muted" style="margin:4px 0 0">本科参考资料、作文素材、专题讲义与词汇；点「阅读」可站内直接看已脱敏文字稿。</p></div>' +
      '<div class="row"><span class="chip green">' + mats.length + ' 份资料</span>' +
      (essays ? '<span class="chip">' + essays + ' 份作文素材</span>' : '') +
      '<a class="small" href="#/drive/' + id + '">资料总库 →</a>' +
      '<a class="small" href="#/mypapers/' + id + '">本科整卷 ' + packs.length + ' 套 →</a></div></div>' +
      (mats.length
        ? '<div class="grid g2 mt">' + mats.map(materialCard).join('') + '</div>'
        : A.emptyBox('本科暂无学科资料', '跨学科的通用学法与工具仍在「资料库 → 学科资料」。')) +
      '</div>';

    html += '<div class="grid g2">' +
      '<div class="card"><h3>知识章节</h3><p class="small muted">点任一章节，直接筛选该章节相关题目开练。</p>' +
      s.chapters.map(function (c, i) {
        var n = qs.filter(function (q) { return (q.tags || []).join('').indexOf(c.slice(0, 2)) >= 0 || (q.source || '').indexOf(c.slice(0, 2)) >= 0; }).length;
        return '<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">' +
          '<span>' + esc(c) + '</span><span class="row"><span class="chip">' + n + ' 题</span>' +
          '<button class="btn sm" data-chapter="' + esc(c) + '">练这个</button></span></div>';
      }).join('') + '</div>' +
      '<div><div class="card mb"><div class="row between"><h3 style="margin:0">本科二级结论</h3>' +
      '<a class="small" href="#/conclusions/' + id + '">全部 →</a></div>' +
      (concl.length ? concl.slice(0, 4).map(function (c) {
        return '<div class="concl" style="border-color:' + s.color + '"><div class="strong">' + esc(c.title) + '</div>' +
          '<div class="small muted">' + esc(c.formula) + '</div></div>';
      }).join('') : '<p class="small muted">该科结论整理中，可在「二级结论」栏目查看全部。</p>') + '</div>' +
      '<div class="card"><div class="row between"><h3 style="margin:0">人教版教材</h3>' +
      '<a class="small" href="#/textbooks/' + id + '">全部 →</a></div>' +
      (books.length ? '<div class="small">' + books.slice(0, 5).map(function (b) {
        return '<div class="row between" style="padding:5px 0"><span>' + esc(b.title) + '</span>' +
          (b.url ? '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">打开 ↗</a>' : '<span class="chip">待接直链</span>') + '</div>';
      }).join('') + '</div>' : '<p class="small muted">教材清单整理中。</p>') + '</div></div></div>';

    html += '<div class="card mt"><div class="grid g4">' +
      '<div class="stat"><b>' + recs.length + '</b><span>本科答题</span></div>' +
      '<div class="stat"><b>' + (recs.length ? Math.round(recs.filter(function (r) { return r.correct; }).length / recs.length * 100) : 0) + '%</b><span>正确率</span></div>' +
      '<div class="stat"><b>' + wrongs.length + '</b><span>本科错题</span></div>' +
      '<div class="stat"><b>' + (state.achievements.indexOf('subject/' + id) >= 0 ? '已通关' : '闯关中') + '</b><span>通关状态</span></div>' +
      '</div></div>';

    A.render(html);
    bindMaterial(el('view'));
    $$('[data-chapter]').forEach(function (n) {
      n.onclick = function () {
        state.chapterFilter = n.dataset.chapter;
        go('practice/' + id + '/chapter');
      };
    });
  });
  function linkCard(title, desc, route, color) {
    return '<div class="card hover pad-s" data-link="' + route + '"><div class="strong" style="color:' + color + '">' + title + '</div>' +
      '<div class="small muted mt">' + desc + '</div></div>';
  }

  /* ==================== 闯关地图 ==================== */
  A.view('quest', async function (p) {
    var subject = p[0] && SMAP[p[0]] ? p[0] : (state.user && state.questSubject) || 'math';
    state.questSubject = subject;
    await S.ensure(subject);
    var levels = S.levels(subject, state.region);
    var prog = await S.all('progress');
    var pmap = {}; prog.forEach(function (x) { pmap[x.levelId] = x; });

    var html = A.pageHead('闯关刷题', '每关 ' + window.ZS_QUESTIONS_PER_LEVEL + ' 题，答对连击加倍 XP；3 星通关解锁下一关。',
      '<a class="btn" href="#/wrong">错题本</a><a class="btn" href="#/records">学习记录</a>');
    html += '<div class="tagbar">' + SUBJECTS.map(function (s) {
      return '<a class="chip' + (s.id === subject ? ' sel' : '') + '" href="#/quest/' + s.id + '">' + s.name + '</a>';
    }).join('') + '</div>';

    /* 适用范围筛选 */
    html += '<div class="card pad-s mb"><div class="row"><span class="small strong">适用范围：</span>' +
      ['广西', '全部'].concat(window.ZS_CLOUD_CONFIG.regions.filter(function (r) { return ['新课标II卷', '新课标I卷', '全国甲卷', '北京', '上海', '浙江', '广东'].indexOf(r) >= 0; }))
        .map(function (r) { return '<button class="chip' + (state.region === r ? ' sel' : '') + '" data-region="' + r + '">' + r + '</button>'; }).join('') +
      '<span class="spacer"></span><span class="small muted">当前题库 ' + S.filter(subject, state.region).length + ' 题</span></div>' +
      '<div class="small muted mt">' + esc(window.ZS_REGION_INFO.note) + '</div></div>';

    html += '<div class="grid g4">';
    levels.forEach(function (lv) {
      var key = subject + '_' + lv.index, pr = pmap[key];
      var unlocked = lv.index === 1 || (pmap[subject + '_' + (lv.index - 1)] && pmap[subject + '_' + (lv.index - 1)].stars > 0);
      var stars = pr ? pr.stars || 0 : 0;
      html += '<div class="level-node' + (unlocked ? '' : ' locked') + (stars === 3 ? ' done' : '') + '" data-level="' + lv.index + '">' +
        '<div class="level-no">第 ' + lv.index + ' 关' + (unlocked ? '' : ' · 未解锁') + '</div>' +
        '<div class="level-name">' + lv.name + '</div>' +
        '<div class="stars">' + [1, 2, 3].map(function (i) { return '<span class="' + (i <= stars ? '' : 'off') + '">★</span>'; }).join('') + '</div>' +
        '<div class="small muted mt">' + (pr ? '最佳 ' + (pr.best || 0) + '/' + lv.qids.length : lv.qids.length + ' 题 · 未挑战') + '</div></div>';
    });
    html += '</div>';

    html += '<div class="card mt"><div class="row between"><div><h3 style="margin:0">自由练习</h3>' +
      '<p class="small muted" style="margin:4px 0 0">不按关卡，从本科题库随机抽 10 题，答完立刻出 AI 指导。</p></div>' +
      '<button class="btn primary" id="q-free">随机 10 题</button></div></div>';

    A.render(html);
    $$('[data-region]').forEach(function (n) {
      n.onclick = function () { state.region = n.dataset.region; A.go('quest/' + subject); };
    });
    $$('[data-level]').forEach(function (n) {
      n.onclick = function () {
        if (n.classList.contains('locked')) { toast('先通过上一关才能解锁', 'err'); return; }
        go('practice/' + subject + '/' + n.dataset.level);
      };
    });
    el('q-free').onclick = function () { go('practice/' + subject + '/free'); };
  });

  /* ==================== 答题（闯关 / 自由 / 章节 / 错题重做） ==================== */
  A.view('practice', async function (p) {
    var subject = p[0] || 'math', mode = p[1] || '1';
    await S.ensure(subject);
    var mp = qMap(subject), qids = [], title = '';
    if (/^\d+$/.test(mode)) {
      var lv = S.levels(subject, state.region)[parseInt(mode, 10) - 1];
      qids = lv ? lv.qids : []; title = '第 ' + mode + ' 关 · ' + (lv ? lv.name : '');
    } else if (mode === 'free') {
      qids = A.pick(S.filter(subject, state.region), 10).map(function (q) { return q.id; }); title = '自由练习';
    } else if (mode === 'chapter') {
      var ch = state.chapterFilter || '';
      qids = A.pick(S.q(subject).filter(function (q) {
        return (q.tags || []).join('').indexOf(ch.slice(0, 2)) >= 0 || (q.source || '').indexOf(ch.slice(0, 2)) >= 0;
      }), 10).map(function (q) { return q.id; });
      qids = qids.length ? qids : A.pick(S.q(subject), 10).map(function (q) { return q.id; });
      title = '章节练习 · ' + ch;
    } else if (mode === 'wrong') {
      var ws = await S.query('wrong_book', function (w) { return w.subject === subject && !w.mastered; });
      qids = ws.slice(0, 15).map(function (w) { return w.qid; }); title = '错题重做';
    } else if (mode === 'daily') {
      qids = (state.dailyQids || []).slice(); title = '每日一练 · ' + A.today();
    }
    qids = qids.filter(function (id) { return !!mp[id]; });
    if (!qids.length) qids = A.pick(S.q(subject), 8).map(function (q) { return q.id; });

    state.practice = { subject: subject, mode: mode, title: title, qids: qids, idx: 0,
                       answers: [], correctCount: 0, startedAt: Date.now(), locked: false };
    drawPractice();
  });

  function drawPractice() {
    var ps = state.practice; if (!ps) { go('quest'); return; }
    if (ps.idx >= ps.qids.length) { drawResult(); return; }
    var mp = qMap(ps.subject), q = mp[ps.qids[ps.idx]];
    if (!q) { ps.idx++; return drawPractice(); }

    var html = A.pageHead('第 ' + (ps.idx + 1) + ' / ' + ps.qids.length + ' 题', ps.title + ' · ' + sname(ps.subject),
      '<a class="btn sm" href="#/quest/' + ps.subject + '">退出本轮</a>');
    html += '<div class="card mb"><div class="row between"><div class="bar" style="flex:1"><i style="width:' +
      Math.round(ps.idx / ps.qids.length * 100) + '%"></i></div>' +
      '<span class="chip blue">' + state.xp + ' XP</span>' +
      '<span class="small">连击 <b class="combo">' + state.combo + '</b></span></div></div>';

    html += '<div class="card"><div class="row mb">' + typeChip(q) +
      '<span class="chip warn">难度 ' + (q.difficulty || 3) + '/5</span><span class="chip">' + (q.score || 5) + ' 分</span></div>' +
      A.qStemHtml(q);
    if (q.type === 'choice') {
      var multi = A.isMulti(q);
      if (multi) html += '<div class="small mt" style="color:var(--accent)">本题为多选题，可选多项，选完再提交（少选、多选、错选都算错）。</div>';
      html += '<div class="mt" id="opts">' + (q.options || []).map(function (o) {
        return '<div class="opt" data-key="' + esc(o.key) + '"><span class="k">' + esc(o.key) + '</span><span>' + esc(o.text) + '</span></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="mt"><textarea id="free-answer" placeholder="' +
        (q.type === 'fill' ? '填写答案（公式可用 $...$）' : '写出你的解题思路与步骤，提交后由大模型逐层诊断') + '"></textarea></div>';
    }
    html += '<div class="row mt"><button class="btn primary" id="p-submit">提交作答</button>' +
      '<button class="btn ghost" id="p-skip">跳过这题</button><span class="spacer"></span>' +
      '<span class="small muted">' + esc(q.source || '开源题库') + '</span></div>' +
      '<div id="p-feedback"></div></div>';
    A.render(html);
    A.ensureKatex().then(function () { A.renderMath(el('view')); });

    var multi = A.isMulti(q), chosen = multi ? [] : null;
    $$('.opt').forEach(function (n) {
      n.onclick = function () {
        if (ps.locked) return;
        if (multi) {
          var k = n.dataset.key, i = chosen.indexOf(k);
          if (i >= 0) { chosen.splice(i, 1); n.classList.remove('selected'); }
          else { chosen.push(k); n.classList.add('selected'); }
        } else {
          $$('.opt').forEach(function (x) { x.classList.remove('selected'); });
          n.classList.add('selected'); chosen = n.dataset.key;
        }
      };
    });
    el('p-submit').onclick = async function () {
      if (ps.locked) return;
      var ans = q.type === 'choice'
        ? (multi ? A.normChoice(chosen.join('')) : (chosen || ''))
        : (el('free-answer').value.trim() || '');
      if (!ans) { toast('先作答，或点「跳过这题」', 'err'); return; }
      ps.locked = true;
      await submitAnswer(q, ans);
    };
    el('p-skip').onclick = async function () {
      if (ps.locked) return;
      ps.locked = true;
      await submitAnswer(q, '', true);
    };
  }

  async function submitAnswer(q, ans, skipped) {
    var ps = state.practice;
    var std = A.normChoice(q.answer), mine = A.normChoice(ans);
    var correct = !skipped && (q.type === 'choice'
      ? (!!mine && mine === std)
      : null); // 主观题不自动判，由学生自评 / 大模型诊断
    ps.answers.push({ qid: q.id, answer: ans, correct: correct, skipped: !!skipped });
    if (correct === true) ps.correctCount++;

    /* 判定 UI：正确选项统一标绿，学生误选的标红（多选按集合比对） */
    $$('.opt').forEach(function (n) {
      n.classList.remove('selected');
      if (std.indexOf(n.dataset.key) >= 0) n.classList.add('correct');
      else if (mine.indexOf(n.dataset.key) >= 0) n.classList.add('wrong');
    });
    var jtxt = correct === true ? '<span class="chip green">答对了</span>'
      : correct === false ? '<span class="chip red">答错了</span>'
      : skipped ? '<span class="chip">已跳过</span>' : '<span class="chip warn">主观题 · 对照标准答案自评</span>';
    var fb = '<div class="answer-box ' + (correct === true ? 'good' : correct === false ? 'bad' : '') + '">' +
      '<div class="row mb">' + jtxt + '<span class="spacer"></span><span class="small muted">标准答案</span></div>' +
      '<div class="md-body" id="std-answer">' + esc(answerText(q)) + '</div>' +
      (q.analysis ? '<div class="divider"></div><div class="small"><b>题库解析</b><div class="md-body" id="std-analysis">' + esc(q.analysis) + '</div></div>' : '') +
      '</div>';

    /* AI 即时指导（每题提交后自动触发；未填 Key 走内置离线教练） */
    fb += '<div class="ai-panel"><div class="ai-head"><span>✦</span> 大模型即时指导' +
      '<span class="spacer"></span><button class="btn sm ghost" id="ai-regen">重新生成</button></div>' +
      '<div class="md-body" id="ai-out"><span class="muted">正在组织诊断…</span></div></div>' +
      '<div class="row mt"><button class="btn primary" id="p-next">下一题 →</button>' +
      '<button class="btn ghost" id="p-to-wrong">看错题本</button></div>';
    el('p-feedback').innerHTML = fb;
    A.enhance(el('p-feedback'));
    A.ensureKatex().then(function () { A.renderMath(el('p-feedback')); });

    /* 落库：记录 / 错题 / XP（游客也写，owner=guest） */
    var g = await G.answer(!!correct);
    await S.put('study_records', { id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      qid: q.id, subject: ps.subject, correct: correct === true, skipped: !!skipped,
      answer: ans, source: q.source, tags: q.tags || [], at: new Date().toISOString(), xp: g.gain });
    if (correct === false || skipped) {
      await S.put('wrong_book', { id: q.id, qid: q.id, subject: ps.subject,
        wrongAnswer: ans, note: '', reviewCount: 0, mastered: false, at: new Date().toISOString() });
    } else if (correct === true) {
      var w = await S.get('wrong_book', q.id);
      if (w) { w.mastered = true; await S.put('wrong_book', w); }
    }
    await G.unlock(['first']);
    A.refreshChrome();

    var spec = window.ZS_PROMPTS.answerCoach({ subject: ps.subject, question: q,
      userAnswer: ans, correct: correct === true });
    async function runAI() {
      el('ai-out').textContent = '';
      try { await A.aiInto(spec, el('ai-out'), { scene: 'answer', subject: ps.subject,
        question: q, userAnswer: ans, correct: correct === true }); }
      catch (e) { toast('大模型调用失败：' + e.message, 'err'); }
    }
    el('ai-regen').onclick = runAI;
    runAI();

    el('p-next').onclick = function () { ps.idx++; ps.locked = false; drawPractice(); };
    el('p-to-wrong').onclick = function () { go('wrong'); };
  }

  function drawResult() {
    var ps = state.practice, n = ps.qids.length, c = ps.correctCount;
    var rate = n ? c / n : 0, stars = rate >= .9 ? 3 : rate >= .7 ? 2 : rate >= .5 ? 1 : 0;
    var key = ps.subject + '_' + (/\d+/.test(ps.mode) ? ps.mode : ps.mode);
    var html = A.pageHead('本轮结算', ps.title + ' · ' + sname(ps.subject));
    html += '<div class="card center" style="padding:34px"><div class="stars" style="font-size:38px">' +
      [1, 2, 3].map(function (i) { return '<span class="' + (i <= stars ? '' : 'off') + '">★</span>'; }).join('') + '</div>' +
      '<h1 class="mt">' + c + ' / ' + n + ' 题答对</h1>' +
      '<p class="muted">正确率 ' + Math.round(rate * 100) + '% · 本轮最高连击 ' + state.combo + ' · 当前 ' + state.xp + ' XP</p>' +
      '<div class="row" style="justify-content:center;margin-top:20px">' +
      '<button class="btn primary" id="r-again">再来一轮</button>' +
      '<button class="btn" id="r-back">回关卡地图</button>' +
      '<button class="btn ghost" id="r-wrong">看错题本</button></div></div>';
    A.render(html);
    /* 闯关进度写库 */
    (async function () {
      if (!/^\d+$/.test(ps.mode)) return;
      var lvId = ps.subject + '_' + ps.mode;
      var old = await S.get('progress', lvId);
      await S.put('progress', { id: lvId, levelId: lvId, subject: ps.subject, level: parseInt(ps.mode, 10),
        stars: Math.max(stars, old ? old.stars || 0 : 0), best: Math.max(c, old ? old.best || 0 : 0),
        at: new Date().toISOString() });
      if (stars === 3) await G.unlock('level3');
      var all = await S.query('progress', function (r) { return r.subject === ps.subject && r.stars > 0; });
      if (all.length >= window.ZS_LEVELS_PER_SUBJECT) await G.unlock('subject1');
      var prog = await S.all('progress');
      if (prog.filter(function (x) { return x.subject === ps.subject && x.stars > 0; }).length >= window.ZS_LEVELS_PER_SUBJECT) {
        state.achievements.push('subject/' + ps.subject); await G.save();
      }
      A.refreshChrome();
    })();
    el('r-again').onclick = function () { go('practice/' + ps.subject + '/' + ps.mode); };
    el('r-back').onclick = function () { go('quest/' + ps.subject); };
    el('r-wrong').onclick = function () { go('wrong'); };
  }

  /* ==================== 错题本 ==================== */
  A.view('wrong', async function (p) {
    var subject = p[0] || 'all';
    var all = await S.all('wrong_book');
    /* 错题可能来自尚未按需加载的科目，先把涉及科目的题库拉进来，否则题干显示不出来 */
    await Promise.all(Array.from(new Set(all.map(function (w) { return w.subject; }))).map(function (s) {
      return S.ensure(s);
    }));
    var list = (subject === 'all' ? all : all.filter(function (w) { return w.subject === subject; }))
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var pending = list.filter(function (w) { return !w.mastered; });

    var html = A.pageHead('错题本', '共 ' + list.length + ' 条，待消灭 ' + pending.length + ' 条。标记掌握后不再出现在重做里。',
      '<button class="btn" id="w-diagnose">前置补漏诊断</button>' +
      '<button class="btn" id="w-export">导出错题本</button>' +
      '<button class="btn primary" id="w-redo">重做待消灭错题</button>');
    html += A.subjectTabs(subject, 'wrong');
    if (!list.length) { html += A.emptyBox('错题本还是空的', '去闯关刷题，答错或跳过的题会自动收进来'); }
    else {
      html += '<div class="grid g2">' + list.map(function (w) {
        var q = S.getQ(w.qid) || { stem: '（题目已不在当前题库）', answer: '', type: 'open' };
        return '<div class="card pad-s"><div class="row between"><div class="row">' +
          '<span class="chip ' + (w.mastered ? 'green' : 'red') + '">' + (w.mastered ? '已掌握' : '待消灭') + '</span>' +
          '<span class="chip">' + sname(w.subject) + '</span></div>' +
          '<span class="small muted">' + A.fmtDate(w.at) + '</span></div>' +
          '<div class="mt small" style="max-height:88px;overflow:hidden">' + esc(String(q.stem).slice(0, 190)) + '</div>' +
          '<div class="small muted mt">你的答案：' + esc(w.wrongAnswer || '（空）') + ' · 标准：' + esc(String(q.answer || '').slice(0, 60)) + '</div>' +
          '<div class="row mt"><button class="btn sm" data-wq="' + esc(w.qid) + '">看解析 / AI 讲</button>' +
          '<button class="btn sm ghost" data-wm="' + esc(w.qid) + '">' + (w.mastered ? '取消掌握' : '标记掌握') + '</button>' +
          '<button class="btn sm ghost" data-wd="' + esc(w.qid) + '">移除</button></div></div>';
      }).join('') + '</div>';
    }
    A.render(html);
    el('w-diagnose').onclick = function () { go('diagnose'); };
    el('w-redo').onclick = function () {
      if (!pending.length) { toast('没有待消灭的错题', 'err'); return; }
      var s = pending[0].subject; state.wrongSubject = s; go('practice/' + s + '/wrong');
    };
    el('w-export').onclick = function () {
      var out = ['# 中山一号 · 错题本', '', '导出时间：' + A.fmtTime(new Date().toISOString()),
        '共 ' + list.length + ' 条，待消灭 ' + pending.length + ' 条', ''];
      list.forEach(function (w, i) {
        var q = S.getQ(w.qid) || {};
        out.push('## ' + (i + 1) + '. [' + sname(w.subject) + '] ' + typeName(q.type || 'open'));
        out.push('', String(q.stem || ''), '',
          '选项：' + (q.options || []).map(function (o) { return o.key + '. ' + o.text; }).join('  '), '',
          '我的答案：' + (w.wrongAnswer || '（空）'), '', '标准答案：' + (q.answer || ''), '',
          '解析：' + (q.analysis || '（无）'), '', '出处：' + (q.source || ''), '', '状态：' + (w.mastered ? '已掌握' : '待消灭'), '');
      });
      A.download('中山一号-错题本-' + A.today() + '.md', out.join('\n'), 'text/markdown;charset=utf-8');
      toast('错题本已导出', 'ok');
    };
    $$('[data-wm]').forEach(function (n) {
      n.onclick = async function () {
        var w = await S.get('wrong_book', n.dataset.wm);
        if (w) { w.mastered = !w.mastered; await S.put('wrong_book', w); }
        var left = (await S.all('wrong_book')).filter(function (x) { return !x.mastered; });
        if (!left.length) await G.unlock('wrong0');
        go('wrong/' + subject);
      };
    });
    $$('[data-wd]').forEach(function (n) {
      n.onclick = async function () { await S.remove('wrong_book', n.dataset.wd); go('wrong/' + subject); };
    });
    $$('[data-wq]').forEach(function (n) {
      n.onclick = async function () {
        var q = S.getQ(n.dataset.wq); if (!q) { toast('题目数据已不在当前题库', 'err'); return; }
        var spec = window.ZS_PROMPTS.answerCoach({ subject: q.subject, question: q, userAnswer: '', correct: false });
        A.modal('错题精讲', '<div class="row mb">' + typeChip(q) + '</div><div class="q-stem mb">' + esc(q.stem) + '</div>' +
          '<div class="answer-box">标准答案：' + esc(answerText(q)) + '</div>' +
          '<div class="ai-panel"><div class="ai-head">✦ 大模型精讲</div><div class="md-body" id="wrong-ai">正在组织…</div></div>');
        A.aiInto(spec, el('wrong-ai'), { scene: 'answer', subject: q.subject, question: q,
          userAnswer: '', correct: false }).catch(function () {});
      };
    });
  });

  /* ==================== 整卷下载 ==================== */
  A.view('papers', async function (p) {
    var subject = p[0] || 'all';
    var subs = subject === 'all' ? SUBJECTS.map(function (s) { return s.id; }) : [subject];
    await Promise.all(subs.map(function (s) { return S.ensure(s); }));
    var papers = [];
    subs.forEach(function (s) { papers = papers.concat(S.buildPapers(s)); });
    papers.sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); });

    var html = A.pageHead('完整整卷下载', '按年份 / 适用范围自动组卷，可下载可打印的 HTML 整卷（含答案解析），也能直接开考。',
      '<button class="btn" id="pa-all">打包下载全部</button>');
    html += A.subjectTabs(subject, 'papers');
    html += '<div class="card pad-s mb small muted">整卷来自开源题库按年份与适用范围聚合，' +
      '题目逐条标注出处。PDF 大文件不进云存储：这里生成的是自包含 HTML，浏览器打开后「打印 → 另存为 PDF」即得纸质卷。</div>';
    if (!papers.length) html += A.emptyBox('暂无整卷', '题库数据量不足，先去「闯关刷题」或等开源题库抓取完成');
    else html += '<div class="grid g3">' + papers.slice(0, 60).map(function (pp) {
      return '<div class="card pad-s"><div class="strong">' + esc(pp.title) + '</div>' +
        '<div class="small muted mt">' + pp.count + ' 题 · ' + esc(pp.region || '综合') + '</div>' +
        '<div class="row mt"><button class="btn sm primary" data-pa-dl="' + esc(pp.id) + '">下载整卷</button>' +
        '<button class="btn sm" data-pa-exam="' + esc(pp.id) + '">在线模考</button>' +
        '<button class="btn sm ghost" data-pa-md="' + esc(pp.id) + '">纯文本</button></div></div>';
    }).join('') + '</div>';
    A.render(html);

    function findPaper(id) { return papers.find(function (x) { return x.id === id; }); }
    function paperText(pp, withAnswer) {
      var mp = qMap(pp.subject), out = [];
      out.push('# ' + pp.title, '', '适用范围：' + (pp.region || '综合') + '　题量：' + pp.count + ' 题', '');
      out.push('姓名：________　班级：________　得分：________', '', '---', '');
      pp.qids.forEach(function (qid, i) {
        var q = mp[qid]; if (!q) return;
        out.push('## ' + (i + 1) + '. （' + (q.score || 5) + ' 分）' + typeName(q.type));
        out.push('', String(q.stem || ''), '');
        (q.options || []).forEach(function (o) { out.push(o.key + '. ' + o.text); });
        out.push('', '出处：' + (q.source || '开源题库'), '');
        if (q.type !== 'choice') out.push('答：______________________________________________', '');
        if (withAnswer) out.push('**【答案】** ' + (q.answer || ''), '', '**【解析】** ' + (q.analysis || '（题库未附）'), '');
        out.push('');
      });
      return out.join('\n');
    }
    function paperHTML(pp) {
      var mp = qMap(pp.subject), body = '';
      pp.qids.forEach(function (qid, i) {
        var q = mp[qid]; if (!q) return;
        body += '<div class="q"><div class="qh">' + (i + 1) + '. （' + (q.score || 5) + ' 分 · ' + typeName(q.type) + '）</div>' +
          '<div class="stem">' + esc(q.stem) + '</div>' +
          (q.options || []).map(function (o) { return '<div class="op">' + esc(o.key) + '. ' + esc(o.text) + '</div>'; }).join('') +
          (q.type !== 'choice' ? '<div class="lines"></div>' : '') +
          '<div class="src">' + esc(q.source || '') + '</div></div>';
      });
      var ans = '';
      pp.qids.forEach(function (qid, i) {
        var q = mp[qid]; if (!q) return;
        ans += '<div class="q"><b>' + (i + 1) + '.</b> 答案：' + esc(answerText(q)) +
          '<div class="an">解析：' + esc(q.analysis || '（题库未附）') + '</div></div>';
      });
      return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + esc(pp.title) +
        '</title><style>body{font-family:"Microsoft YaHei",sans-serif;max-width:820px;margin:32px auto;padding:0 20px;line-height:1.9;color:#222}' +
        'h1{text-align:center;font-size:24px}h2{margin-top:34px;border-bottom:2px solid #333;padding-bottom:6px}' +
        '.meta{text-align:center;color:#666;font-size:13px}.q{margin:18px 0;page-break-inside:avoid}' +
        '.qh{font-weight:700}.stem{margin:8px 0;white-space:pre-wrap}.op{margin:4px 0 4px 20px}' +
        '.lines{height:96px;border-bottom:1px dashed #bbb}.src{font-size:11px;color:#999;margin-top:6px}' +
        '.an{color:#444;font-size:14px;margin-top:6px;white-space:pre-wrap}@media print{.pagebreak{page-break-before:always}}</style>' +
        '</head><body><h1>' + esc(pp.title) + '</h1><div class="meta">适用范围：' + esc(pp.region || '综合') +
        '　题量：' + pp.count + ' 题　姓名：________　班级：________　得分：________</div>' + body +
        '<div class="pagebreak"></div><h2>参考答案与解析</h2>' + ans +
        '<p style="text-align:center;color:#999;font-size:12px;margin-top:40px">中山一号 · 题目出处逐条标注 · 开源题库整理</p></body></html>';
    }
    $$('[data-pa-dl]').forEach(function (n) {
      n.onclick = function () {
        var pp = findPaper(n.dataset.paDl); if (!pp) return;
        A.download(sanitize(pp.title) + '.html', paperHTML(pp), 'text/html;charset=utf-8');
        toast('整卷已下载，浏览器打开后可打印成 PDF', 'ok');
      };
    });
    $$('[data-pa-md]').forEach(function (n) {
      n.onclick = function () {
        var pp = findPaper(n.dataset.paMd); if (!pp) return;
        A.download(sanitize(pp.title) + '-含答案.md', paperText(pp, true), 'text/markdown;charset=utf-8');
        toast('文本卷已下载', 'ok');
      };
    });
    $$('[data-pa-exam]').forEach(function (n) {
      n.onclick = function () { go('exam/start/' + encodeURIComponent(n.dataset.paExam)); };
    });
    el('pa-all').onclick = function () {
      var all = papers.slice(0, 20).map(function (pp) { return paperText(pp, true); }).join('\n\n---\n\n');
      A.download('中山一号-整卷合集-' + A.today() + '.md', all, 'text/markdown;charset=utf-8');
      toast('已打包前 20 套整卷', 'ok');
    };
  });
  function sanitize(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }

  /* ==================== 在线模拟考试 ==================== */
  A.view('exam', async function (p) {
    if (p[0] === 'start') return await startExam(decodeURIComponent(p[1] || ''), p[2]);
    if (p[0] === 'result') return await examResult(p[1]);
    var subject = p[0] || 'all';
    var subs = subject === 'all' ? SUBJECTS.map(function (s) { return s.id; }) : [subject];
    await Promise.all(subs.map(function (s) { return S.ensure(s); }));
    var papers = [];
    subs.forEach(function (s) { papers = papers.concat(S.buildPapers(s)); });
    papers.sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); });
    var recs = (await S.all('exam_records')).slice().reverse();

    var html = A.pageHead('在线模拟考试', '整卷计时作答，交卷自动判客观题，主观题对照答案自评，最后出 AI 卷面诊断。');
    html += A.subjectTabs(subject, 'exam');
    html += '<div class="grid g2 mb"><div class="card"><h3>选一套卷开考</h3>' +
      (papers.length ? papers.slice(0, 20).map(function (pp) {
        return '<div class="row between" style="padding:9px 0;border-bottom:1px solid var(--line)">' +
          '<div><div class="strong">' + esc(pp.title) + '</div><div class="small muted">' + pp.count + ' 题 · 建议 ' +
          Math.max(30, pp.count * 3) + ' 分钟</div></div>' +
          '<button class="btn sm primary" data-ex="' + esc(pp.id) + '">开考</button></div>';
      }).join('') : A.emptyBox('暂无整卷', '题库数据不足')) + '</div>' +
      '<div class="card"><h3>历史成绩</h3>' +
      (recs.length ? '<table class="tbl"><tr><th>卷名</th><th>得分</th><th>得分率</th><th>时间</th><th></th></tr>' +
        recs.slice(0, 12).map(function (r) {
          return '<tr><td class="small">' + esc(String(r.title || '模拟卷').slice(0, 26)) + '</td>' +
            '<td class="strong">' + r.score + '/' + r.total + '</td>' +
            '<td>' + (r.total ? Math.round(r.score / r.total * 100) : 0) + '%</td>' +
            '<td class="small muted">' + A.fmtDate(r.at) + '</td>' +
            '<td><button class="btn sm ghost" data-er="' + esc(r.id) + '">诊断</button></td></tr>';
        }).join('') + '</table>' : A.emptyBox('还没考过', '选一套卷，计时感受一下真实考场')) + '</div></div>';
    A.render(html);
    $$('[data-ex]').forEach(function (n) {
      n.onclick = function () { go('exam/start/' + encodeURIComponent(n.dataset.ex)); };
    });
    $$('[data-er]').forEach(function (n) { n.onclick = function () { go('exam/result/' + n.dataset.er); }; });
  });

  async function startExam(paperId, subjectHint) {
    var subs = SUBJECTS.map(function (s) { return s.id; });
    await Promise.all(subs.map(function (s) { return S.ensure(s); }));
    var papers = [];
    subs.forEach(function (s) { papers = papers.concat(S.buildPapers(s)); });
    var pp = papers.find(function (x) { return x.id === paperId; }) || papers[0];
    if (!pp) { A.render(A.emptyBox('暂无可用整卷', '请先在题库里积累题目')); return; }
    var mp = qMap(pp.subject);
    var qs = pp.qids.map(function (id) { return mp[id]; }).filter(Boolean);
    if (!qs.length) { A.render(A.emptyBox('这套卷没有可作答的题目', '')); return; }

    state.exam = { paper: pp, qs: qs, answers: {}, startedAt: Date.now(),
                   minutes: Math.max(30, qs.length * 3), scored: false };
    var html = A.pageHead('考试中 · ' + pp.title, '共 ' + qs.length + ' 题 · 建议 ' + state.exam.minutes + ' 分钟 · 交卷后自动判分',
      '<span class="chip orange" id="ex-timer">00:00</span><button class="btn accent" id="ex-submit">交卷</button>');
    html += '<div class="grid g2"><div class="card" id="ex-sheet">';
    qs.forEach(function (q, i) {
      html += '<div class="q-block" data-qi="' + i + '" style="padding:12px 0;border-bottom:1px solid var(--line)">' +
        '<div class="row mb"><span class="chip">' + (i + 1) + '</span>' + typeChip(q) +
        '<span class="chip">' + (q.score || 5) + ' 分</span></div>' +
        '<div class="q-stem">' + esc(q.stem) + '</div>';
      if (q.type === 'choice') {
        var multi = A.isMulti(q);
        if (multi) html += '<div class="small" style="color:var(--accent)">多选题，可勾选多项。</div>';
        html += '<div class="mt">' + (q.options || []).map(function (o) {
          return '<label class="opt" style="cursor:pointer"><span class="k">' + esc(o.key) + '</span>' +
            '<span>' + esc(o.text) + '</span><input type="' + (multi ? 'checkbox' : 'radio') +
            '" name="ex' + i + '" value="' + esc(o.key) +
            '" style="margin-left:auto;width:auto" data-exq="' + i + '"></label>';
        }).join('') + '</div>';
      } else {
        html += '<textarea class="mt" data-exq="' + i + '" placeholder="写出解答过程（主观题交卷后对照标准答案自评）"></textarea>';
      }
      html += '</div>';
    });
    html += '</div><div class="card" style="align-self:start;position:sticky;top:74px"><h3>答题卡</h3>' +
      '<div class="small muted mb">点数字跳到对应题；已答会变蓝。</div><div class="row" id="ex-cards">' +
      qs.map(function (q, i) { return '<button class="chip" data-jump="' + i + '" style="cursor:pointer">' + (i + 1) + '</button>'; }).join('') +
      '</div><div class="divider"></div>' +
      '<div class="small">已答 <b id="ex-done">0</b> / ' + qs.length + '</div>' +
      '<div class="bar mt"><i id="ex-bar" style="width:0%"></i></div>' +
      '<button class="btn accent block mt-l" id="ex-submit2">交卷并判分</button>' +
      '<p class="small muted mt">客观题自动判分；主观题请对照参考答案自行给分，合计后计入成绩。</p></div></div>';
    A.render(html);
    A.ensureKatex().then(function () { A.renderMath(el('view')); });

    var t0 = Date.now();
    var timer = setInterval(function () {
      var t = el('ex-timer'); if (!t) { clearInterval(timer); return; }
      var sec = Math.floor((Date.now() - t0) / 1000);
      t.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }, 1000);
    state.examTimer = timer;

    function sync() {
      var done = 0, tmp = {};
      $$('[data-exq]').forEach(function (n) {
        var i = n.dataset.exq;
        if (n.type === 'radio') { if (n.checked) tmp[i] = n.value; }
        else if (n.type === 'checkbox') { if (n.checked) tmp[i] = (tmp[i] || '') + n.value; }
        else tmp[i] = n.value;
      });
      state.exam.answers = tmp;
      Object.keys(tmp).forEach(function (k) { if (tmp[k]) done++; });
      var d = el('ex-done'); if (d) d.textContent = done;
      var bar = el('ex-bar'); if (bar) bar.style.width = Math.round(done / qs.length * 100) + '%';
      $$('[data-jump]').forEach(function (b) {
        var i = parseInt(b.dataset.jump, 10);
        b.classList.toggle('sel', !!state.exam.answers[i]);
      });
    }
    $$('[data-exq]').forEach(function (n) {
      n.onchange = sync; n.oninput = sync;
    });
    $$('[data-jump]').forEach(function (b) {
      b.onclick = function () {
        var t = $$('[data-qi]').find(function (x) { return x.dataset.qi === b.dataset.jump; });
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    });
    function finish() { clearInterval(timer); scoreExam(); }
    el('ex-submit').onclick = finish;
    el('ex-submit2').onclick = finish;
  }

  async function scoreExam() {
    var ex = state.exam; if (!ex || ex.scored) return;
    ex.scored = true;
    var total = 0, got = 0, detail = [];
    ex.qs.forEach(function (q, i) {
      var s = q.score || 5, ans = ex.answers[i] || '';
      total += s;
      var std = A.normChoice(q.answer), mine = A.normChoice(ans);
      var ok = q.type === 'choice' && !!mine && mine === std;
      if (q.type !== 'choice') {
        got += 0; // 主观题由学生自评，下面统一给输入
        detail.push({ i: i + 1, q: q, ans: ans, auto: null, score: s });
      } else {
        if (ok) got += s;
        detail.push({ i: i + 1, q: q, ans: ans, auto: ok, score: s });
      }
    });
    var html = A.pageHead('交卷 · 判分', ex.paper.title);
    html += '<div class="card mb"><h3>客观题已自动判分；主观题请对照参考答案自评后填入得分</h3>' +
      '<div id="score-total" class="strong" style="font-size:20px;margin:10px 0">当前 ' + got + ' / ' + total + ' 分</div>' +
      '<div class="small muted">主观题默认 0 分，按你的实际作答手动加分，最后保存成绩。</div></div>';
    detail.forEach(function (d) {
      html += '<div class="card pad-s mb"><div class="row between"><div class="row">' +
        '<span class="chip">' + d.i + '</span>' + typeChip(d.q) +
        (d.auto === null ? '<span class="chip warn">自评</span>' : d.auto ? '<span class="chip green">正确</span>' : '<span class="chip red">错误</span>') +
        '</div><span class="small">满分 ' + d.score + '</span></div>' +
        '<div class="small mt" style="max-height:70px;overflow:hidden">' + esc(String(d.q.stem).slice(0, 150)) + '</div>' +
        '<div class="small muted mt">你的答案：' + esc(d.ans || '（空）') + ' ｜ 标准：' + esc(String(d.q.answer || '').slice(0, 80)) + '</div>' +
        (d.auto === null ? '<div class="small mt">解析：' + esc(String(d.q.analysis || '（无）').slice(0, 260)) + '</div>' +
          '<div class="row mt"><span class="small">自评得分：</span><input type="number" min="0" max="' + d.score +
          '" value="0" style="width:80px" data-self="' + d.i + '"></div>' : '') + '</div>';
    });
    html += '<button class="btn primary lg" id="ex-save">保存成绩并生成诊断</button>';
    A.render(html);
    function recalc() {
      var v = got;
      $$('[data-self]').forEach(function (n) { v += Math.min(Number(n.value) || 0, Number(n.max)); });
      el('score-total').textContent = '当前 ' + v + ' / ' + total + ' 分';
      return v;
    }
    $$('[data-self]').forEach(function (n) { n.oninput = recalc; });
    el('ex-save').onclick = async function () {
      var score = recalc();
      var rec = { id: 'e_' + Date.now(), paperId: ex.paper.id, title: ex.paper.title,
        subject: ex.paper.subject, score: score, total: total,
        minutes: Math.round((Date.now() - ex.startedAt) / 60000),
        at: new Date().toISOString(),
        detail: detail.map(function (d) {
          return { i: d.i, qid: d.q.id, ans: d.ans, correct: d.auto, source: d.q.source, tags: d.q.tags || [] };
        }) };
      await S.put('exam_records', rec);
      await G.unlock(['exam1']);
      if (total && score / total >= .9) await G.unlock('exam90');
      A.refreshChrome();
      go('exam/result/' + rec.id);
    };
  }

  async function examResult(id) {
    var recs = await S.all('exam_records');
    var r = recs.find(function (x) { return x.id === id; });
    if (!r) { A.render(A.emptyBox('找不到这份成绩', '')); return; }
    var rate = r.total ? Math.round(r.score / r.total * 100) : 0;
    var wrong = (r.detail || []).filter(function (d) { return d.correct === false; });
    var html = A.pageHead('模考成绩', r.title, '<a class="btn" href="#/exam">返回模考列表</a>');
    html += '<div class="grid g4 mb">' +
      '<div class="card center"><div class="stat"><b style="font-size:30px">' + r.score + '</b><span>得分 / ' + r.total + '</span></div></div>' +
      '<div class="card center"><div class="stat"><b style="font-size:30px">' + rate + '%</b><span>得分率</span></div></div>' +
      '<div class="card center"><div class="stat"><b style="font-size:30px">' + r.minutes + '</b><span>用时（分钟）</span></div></div>' +
      '<div class="card center"><div class="stat"><b style="font-size:30px">' + wrong.length + '</b><span>客观题失分</span></div></div></div>';
    html += '<div class="ai-panel mb"><div class="ai-head">✦ 大模型卷面诊断' +
      '<span class="spacer"></span><button class="btn sm ghost" id="er-regen">重新生成</button></div>' +
      '<div class="md-body" id="er-ai">正在组织诊断…</div></div>';
    html += '<div class="card"><h3>逐题明细</h3><table class="tbl"><tr><th>题号</th><th>你的答案</th><th>结果</th><th>出处</th></tr>' +
      (r.detail || []).map(function (d) {
        return '<tr><td>' + d.i + '</td><td class="small">' + esc(String(d.ans || '（空）').slice(0, 50)) + '</td>' +
          '<td>' + (d.correct === null ? '<span class="chip warn">自评</span>' : d.correct ? '<span class="chip green">对</span>' : '<span class="chip red">错</span>') + '</td>' +
          '<td class="small muted">' + esc(String(d.source || '').slice(0, 30)) + '</td></tr>';
      }).join('') + '</table></div>';
    A.render(html);
    var spec = window.ZS_PROMPTS.examReview({ subject: r.subject, title: r.title,
      score: r.score, total: r.total, minutes: r.minutes,
      detail: (r.detail || []).map(function (d) {
        return '第' + d.i + '题 答' + (d.ans || '空') + ' ' +
          (d.correct === null ? '主观题自评' : d.correct ? '对' : '错') + ' 考点：' + (d.tags || []).join('、');
      }).join('\n') });
    async function run() { try { await A.aiInto(spec, el('er-ai'), { scene: 'exam', subject: r.subject,
      title: r.title, score: r.score, total: r.total, minutes: r.minutes }); } catch (e) {} }
    el('er-regen').onclick = run; run();
  }

  /* ==================== 学习记录 ==================== */
  A.view('records', async function () {
    var comments = await S.all('teacher_comments').catch(function () { return []; });
    comments = (comments || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var recs = (await S.all('study_records')).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var exams = await S.all('exam_records');
    var wrongs = await S.all('wrong_book');
    var progs = await S.all('progress');
    var total = recs.length, ok = recs.filter(function (r) { return r.correct; }).length;
    var bySubject = {}, byDay = {};
    recs.forEach(function (r) {
      bySubject[r.subject] = bySubject[r.subject] || { n: 0, ok: 0 };
      bySubject[r.subject].n++; if (r.correct) bySubject[r.subject].ok++;
      var d = String(r.at).slice(0, 10); byDay[d] = (byDay[d] || 0) + 1;
    });
    var days = [];
    for (var i = 6; i >= 0; i--) { var d = A.addDays(A.today(), -i); days.push([d, byDay[d] || 0]); }
    var maxDay = Math.max.apply(null, days.map(function (x) { return x[1]; }).concat([1]));

    var html = A.pageHead('学习记录', '全部数据存在' + (state.mode === 'cloud' ? '你的云账号' : '本机浏览器') + '，可随时导出备份。',
      '<button class="btn" id="rec-export">导出全部数据</button>' +
      '<button class="btn ghost" id="rec-import">导入备份</button>');
    /* 教师点评：管理员用 putFor 写成 owner=本账号，这里用普通 all() 只读自己的 */
    if (comments.length) {
      html += '<div class="card mb"><h3>教师点评（' + comments.length + '）</h3>' +
        comments.map(function (c) {
          return '<div class="card pad-s mb"><div class="row between">' +
            '<span class="chip">' + (c.subject && c.subject !== 'all' ? sname(c.subject) : '综合') + '</span>' +
            '<span class="small muted">' + esc(A.fmtTime(c.at)) + ' · ' + esc(c.author || '管理员') + '</span></div>' +
            '<div class="mt" style="white-space:pre-wrap;line-height:1.9">' + esc(c.content || '') + '</div></div>';
        }).join('') + '</div>';
    }
    html += '<div class="grid g4 mb">' +
      statCard(total, '累计答题') + statCard(total ? Math.round(ok / total * 100) + '%' : '—', '总正确率') +
      statCard(progs.filter(function (p) { return p.stars > 0; }).length, '已通关关卡') +
      statCard(exams.length, '模考次数') + '</div>';
    html += '<div class="grid g2 mb"><div class="card"><h3>近 7 天答题量</h3>' +
      '<div class="row" style="align-items:flex-end;height:140px;gap:10px;padding-top:10px">' +
      days.map(function (d) {
        return '<div style="flex:1;text-align:center"><div style="height:' + Math.round(d[1] / maxDay * 100) + 'px;min-height:3px;background:linear-gradient(180deg,var(--primary),#7ab0f0);border-radius:5px 5px 0 0"></div>' +
          '<div class="tiny muted" style="margin-top:5px">' + d[0].slice(5) + '</div>' +
          '<div class="tiny strong">' + d[1] + '</div></div>';
      }).join('') + '</div></div>' +
      '<div class="card"><h3>分科表现</h3>' + SUBJECTS.map(function (s) {
        var v = bySubject[s.id] || { n: 0, ok: 0 }, pct = v.n ? Math.round(v.ok / v.n * 100) : 0;
        return '<div style="margin-bottom:10px"><div class="row between small"><span>' + s.name + '</span>' +
          '<span class="muted">' + v.n + ' 题 · ' + pct + '%</span></div>' +
          '<div class="bar thin mt"><i style="width:' + pct + '%;background:' + s.color + '"></i></div></div>';
      }).join('') + '</div></div>';

    html += '<div class="card mb"><h3>成就墙</h3><div class="grid g4">' +
      window.ZS_ACHIEVEMENTS.map(function (a) {
        var on = G.has(a.id);
        return '<div class="card pad-s" style="opacity:' + (on ? 1 : .48) + ';box-shadow:none"><div class="row">' +
          '<span class="rank-badge" style="background:' + (on ? '#f5d98a' : 'var(--surface-2)') + ';color:' + (on ? '#6b4a08' : 'var(--ink-3)') + '">' + a.icon + '</span>' +
          '<div><div class="strong small">' + a.name + '</div><div class="tiny muted">' + a.desc + '</div></div></div></div>';
      }).join('') + '</div></div>';

    html += '<div class="card"><h3>答题明细（最近 40 条）</h3>' +
      (recs.length ? '<table class="tbl"><tr><th>时间</th><th>科目</th><th>出处</th><th>结果</th><th>获得 XP</th></tr>' +
        recs.slice(0, 40).map(function (r) {
          return '<tr><td class="small muted">' + A.fmtTime(r.at) + '</td><td>' + sname(r.subject) + '</td>' +
            '<td class="small muted">' + esc(String(r.source || '').slice(0, 28)) + '</td>' +
            '<td>' + (r.skipped ? '<span class="chip">跳过</span>' : r.correct ? '<span class="chip green">对</span>' : '<span class="chip red">错</span>') + '</td>' +
            '<td>+' + (r.xp || 0) + '</td></tr>';
        }).join('') + '</table>' : A.emptyBox('还没有记录', '去闯关刷题吧')) + '</div>';
    A.render(html);
    el('rec-export').onclick = async function () {
      var json = await B.db.exportAll();
      A.download('中山一号-完整备份-' + A.today() + '.json', json, 'application/json;charset=utf-8');
      toast('完整备份已导出（云暂停期间导不出，务必平时备份）', 'ok');
    };
    el('rec-import').onclick = function () {
      A.modal('导入备份', '<p class="small muted">选择此前导出的 JSON 备份。导入会按 id 覆盖同名记录，不会删除现有数据。</p>' +
        '<input type="file" id="imp-file" accept="application/json,.json">' +
        '<button class="btn primary mt" id="imp-go">开始导入</button><div id="imp-msg" class="small mt"></div>');
      el('imp-go').onclick = async function () {
        var f = el('imp-file').files[0]; if (!f) { toast('先选文件', 'err'); return; }
        try {
          var res = await B.db.importAll(await f.text());
          el('imp-msg').textContent = '导入完成，共 ' + res.count + ' 条记录。刷新后生效。';
          toast('导入成功', 'ok');
        } catch (e) { el('imp-msg').textContent = '导入失败：' + e.message; }
      };
    };
  });
  function statCard(v, label) {
    return '<div class="card pad-s"><div class="stat"><b>' + v + '</b><span>' + label + '</span></div></div>';
  }
})();
