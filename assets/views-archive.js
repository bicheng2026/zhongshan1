/* =====================================================================
 * 中山一号 · 资料存档（views-archive.js）
 *
 * 数据来源（由 _ingest/classify.py 归档生成）：
 *   window.ZS_DOWNLOADS  整卷 / 答案原件（可下载、可打印）
 *   window.ZS_VOLUNTEER  大学志愿 / 升学资料
 *   window.ZS_DRIVE      学科资料 / 作文素材 / 经验学法 / 词汇（含 MD 可站内阅读）
 *
 * 三个视图分别挂在「学习」「资料库」两个已有导航分组下，不再单设资料来源栏目。
 * 原件随站点静态发布，不跳外链、不引网盘；含他人隐私的文档已按规则排除。
 * ===================================================================== */
(function () {
  'use strict';
  var A = window.ZSApp;
  if (!A) { console.warn('views-archive: ZSApp 未就绪'); return; }
  var esc = A.esc;

  var TAG_LABEL = { essay: '作文素材', exp: '经验学法', lex: '词汇资料', paper: '整卷', ref: '资料' };
  var SUBJ = {
    chinese:   { name: '语文', color: '#c0392b' },
    math:      { name: '数学', color: '#1f5fbf' },
    english:   { name: '英语', color: '#7b3fa1' },
    physics:   { name: '物理', color: '#0e7c86' },
    chemistry: { name: '化学', color: '#b5651d' },
    biology:   { name: '生物', color: '#2f7d32' },
    politics:  { name: '政治', color: '#8b1e3f' },
    history:   { name: '历史', color: '#8a6d1f' },
    geography: { name: '地理', color: '#1f6f6b' },
    general:   { name: '通用', color: '#5b6b73' }
  };
  // 学科标签的固定顺序；未列入的新学科会自动追加到末尾，不会漏显示
  var SUBJ_ORDER = ['chinese', 'math', 'english', 'physics', 'chemistry',
                    'biology', 'politics', 'history', 'geography', 'general'];

  function metaLine(it) {
    var parts = [];
    if (it.year) parts.push(it.year + ' 年');
    if (it.type) parts.push(String(it.type).toUpperCase());
    if (it.sizeKB) parts.push(it.sizeKB >= 1024
      ? (it.sizeKB / 1024).toFixed(1) + ' MB'
      : Math.round(it.sizeKB) + ' KB');
    return parts.join(' · ');
  }

  // chipHtml：已是安全 HTML 的徽标串（学科色块 + 分类标签）
  function card(it, chipHtml) {
    var dl = it.file
      ? '<a class="btn sm primary" href="' + esc(it.file) + '" download>下载原件</a>'
      : '';
    var prev = it.md
      ? '<button class="btn sm ghost" data-md="' + esc(it.md) + '">阅读</button>'
      : '';
    var open = (it.type === 'pdf')
      ? '<button class="btn sm ghost" data-open="' + esc(it.file) + '">打印/预览</button>'
      : '';
    var dlprev = (dl || prev || open)
      ? '<div class="row">' + dl + prev + open + '</div>'
      : '';
    return '<div class="card pad-s" style="margin-bottom:10px">' +
      '<div class="row between" style="gap:8px"><b>' + esc(it.name) + '</b>' +
      (chipHtml ? '<span class="row" style="flex:none">' + chipHtml + '</span>' : '') + '</div>' +
      '<p class="small muted" style="margin:6px 0 8px">' + esc(metaLine(it)) + '</p>' +
      dlprev + '</div>';
  }

  function subjChips(it) {
    var s = SUBJ[it.subject] || SUBJ.general;
    var chip = '<span class="chip" style="background:' + s.color + ';color:#fff">' + s.name + '</span>';
    var tag = (it.tags || []).map(function (t) { return TAG_LABEL[t] || t; })[0];
    if (tag) chip += ' <span class="chip">' + tag + '</span>';
    return chip;
  }

  // 按数据里真实出现的学科动态生成筛选条：新增学科无需改代码即可显示
  function subjBar(list, cur, route) {
    var counts = {}, none = 0;
    list.forEach(function (it) {
      var k = it.subject;
      if (!k) { none++; return; }
      counts[k] = (counts[k] || 0) + 1;
    });
    var keys = SUBJ_ORDER.filter(function (k) { return counts[k]; });
    Object.keys(counts).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var tabs = [['all', '全部', list.length]];
    keys.forEach(function (k) {
      tabs.push([k, SUBJ[k] ? SUBJ[k].name : k, counts[k]]);
    });
    if (none) tabs.push(['none', '未分类', none]);
    return '<div class="tagbar">' + tabs.map(function (t) {
      return '<a class="chip' + (cur === t[0] ? ' sel' : '') + '" href="#/' + route + '/' + t[0] + '">' +
        t[1] + (t[0] === 'all' ? '' : ' ' + t[2]) + '</a>';
    }).join('') + '</div>';
  }

  function filterBySubj(list, cur) {
    if (cur === 'all') return list;
    if (cur === 'none') return list.filter(function (it) { return !it.subject; });
    return list.filter(function (it) { return (it.subject || 'general') === cur; });
  }

  async function previewMd(mdPath) {
    try {
      var r = await fetch(mdPath);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var md = await r.text();
      A.modal('阅读 · ' + mdPath.split('/').pop().replace(/\.md$/, ''),
        '<div class="md" style="max-height:70vh;overflow:auto">' + A.md2html(md) + '</div>');
    } catch (e) {
      A.modal('无法预览',
        '<p class="muted">本地直接用 file:// 打开时，浏览器会禁止读取文件。请改用「下载原件」查看，' +
        '或经「启动本地预览」的本地服务器访问本页即可在线阅读。</p>');
    }
  }

  function bindHandlers(root) {
    root.querySelectorAll('[data-md]').forEach(function (b) {
      b.onclick = function () { previewMd(b.getAttribute('data-md')); };
    });
    root.querySelectorAll('[data-open]').forEach(function (b) {
      b.onclick = function () { window.open(b.getAttribute('data-open'), '_blank'); };
    });
  }

  /* ---------------- 整卷（我的整卷） ---------------- */
  A.view('mypapers', async function (p) {
    var list = window.ZS_DOWNLOADS || [];
    var cur = (p && p[0]) || 'all';
    var filtered = filterBySubj(list, cur);
    var html = A.pageHead('我的整卷',
      '试卷、真题、解析版、学生版与教师版原件，按学科筛选，一键下载、PDF 直接预览打印。' +
      '原件随站点发布，不跳外链；点「阅读」可看脱敏后的文字稿。',
      '<span class="chip green">共 ' + list.length + ' 份</span>');
    html += subjBar(list, cur, 'mypapers');
    if (!filtered.length) {
      html += A.emptyBox('该分类暂无整卷', '切回「全部」可查看所有整卷。');
    } else {
      html += '<div class="card pad-s">' + filtered.map(function (it) {
        return card(it, subjChips(it));
      }).join('') + '</div>';
    }
    A.render(html);
    bindHandlers(el('view'));
  });

  /* ---------------- 大学志愿 / 升学 ---------------- */
  A.view('volunteer', async function () {
    var list = window.ZS_VOLUNTEER || [];
    var html = A.pageHead('大学志愿与升学',
      '招飞、军校、高考报名、志愿填报等政策与样表原件，直接下载查看，随站点发布。',
      '<span class="chip green">' + list.length + ' 份</span>');
    if (!list.length) {
      html += A.emptyBox('暂无升学资料', '归档新的升学资料后会自动出现在这里。');
    } else {
      html += '<div class="card pad-s">' + list.map(function (it) { return card(it, ''); }).join('') + '</div>';
    }
    A.render(html);
    bindHandlers(el('view'));
  });

  /* ---------------- 学科资料（非题目内容按学科归类） ---------------- */
  A.view('drive', async function (p) {
    var list = window.ZS_DRIVE || [];
    var cur = (p && p[0]) || 'all';
    var bar = subjBar(list, cur, 'drive');
    var filtered = filterBySubj(list, cur);
    var html = A.pageHead('学科资料',
      '非题目类参考资料的总库，按学科标签整理：语文作文素材与作文指导、数学与化学二轮专题、' +
      '英语词汇、生物讲义、通用学法与工具等。语数英物化政六科的入口页里已直接列出本科资料，' +
      '这里用于跨科查找与查看全集；生物等未设独立入口的科目也在本页按标签查看。' +
      '点「阅读」可站内直接看（已脱敏），也能下载原件。',
      '<span class="chip green">共 ' + list.length + ' 条</span>');
    html += bar;
    if (!filtered.length) {
      html += A.emptyBox('该学科暂无资料', '其它学科里也许有你要的。');
    } else {
      html += '<div class="card pad-s">' + filtered.map(function (it) {
        return card(it, subjChips(it));
      }).join('') + '</div>';
    }
    A.render(html);
    bindHandlers(el('view'));
  });

  function el(id) { return A.el(id); }
})();
