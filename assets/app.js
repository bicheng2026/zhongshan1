/* 中山一号 · 应用核心
 * 路由 / 账号 / 数据层 / 游戏化 / AI 流式 / 语音 / 公式渲染 / 通用 UI
 * 约定：所有 ZSBackend 调用一律 await（本地同步返回、云 Promise，两者都成立）。 */
(function () {
  'use strict';

  var B = window.ZSBackend;
  var CFG = window.ZS_CLOUD_CONFIG;
  var SUBJECTS = window.ZS_SUBJECTS;
  var SMAP = window.ZS_SUBJECT_MAP;
  var RANKS = window.ZS_RANKS;
  var ACHS = window.ZS_ACHIEVEMENTS;

  var views = {};
  var state = {
    user: null, mode: 'local', combo: 0, bestCombo: 0, xp: 0, achievements: [],
    otp: null, chatHistory: [], practice: null, exam: null, activeSpeech: null,
    region: '广西'
  };

  /* ==================== 小工具 ==================== */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function el(id) { return document.getElementById(id); }
  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v); if (isNaN(d.getTime())) return String(v);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtTime(v) {
    if (!v) return '—';
    var d = new Date(v); if (isNaN(d.getTime())) return String(v);
    return fmtDate(v) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(dateStr, n) { var d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  /* 选择题答案归一化：多选题答案是 "ACD"/"A、C" 这类字母串，按集合比判分 */
  function normChoice(s) {
    var a = String(s == null ? '' : s).toUpperCase().replace(/[^A-D]/g, '').split('').sort();
    return a.filter(function (x, i) { return i === 0 || x !== a[i - 1]; }).join('');
  }
  function isMulti(q) {
    return q && q.type === 'choice' && normChoice(q.answer).length > 1;
  }
  function pick(arr, n, seed) {
    var a = arr.slice(), out = [], i, s = seed || Date.now();
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (i = 0; i < n && a.length; i++) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]);
    return out;
  }
  var toastTimer;
  function toast(msg, type) {
    var t = el('toast'); if (!t) return;
    t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function modal(title, html) {
    el('modal-title').textContent = title;
    el('modal-body').innerHTML = html;
    el('modal-overlay').hidden = false;
  }
  function closeModal() { el('modal-overlay').hidden = true; }
  function download(name, content, mime) {
    var blob = new Blob(['\ufeff' + content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  }

  /* 极简 Markdown（够用且不引外部库；输出前已 esc，模型输出不可信） */
  function md2html(src) {
    var lines = String(src || '').split('\n'), out = [], inUl = false, inOl = false;
    function closeLists() { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } }
    function inline(t) {
      return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    }
    lines.forEach(function (raw) {
      var l = raw.trim();
      if (!l) { closeLists(); return; }
      var h = /^(#{2,4})\s+(.*)$/.exec(l);
      if (h) { closeLists(); out.push('<h3>' + inline(h[2]) + '</h3>'); return; }
      if (/^>\s?/.test(l)) { closeLists(); out.push('<blockquote>' + inline(l.replace(/^>\s?/, '')) + '</blockquote>'); return; }
      var ul = /^[-*•]\s+(.*)$/.exec(l), ol = /^\d+[.、)]\s*(.*)$/.exec(l);
      if (ul) { if (inOl) { out.push('</ol>'); inOl = false; } if (!inUl) { out.push('<ul>'); inUl = true; } out.push('<li>' + inline(ul[1]) + '</li>'); return; }
      if (ol) { if (inUl) { out.push('</ul>'); inUl = false; } if (!inOl) { out.push('<ol>'); inOl = true; } out.push('<li>' + inline(ol[1]) + '</li>'); return; }
      closeLists(); out.push('<p>' + inline(l) + '</p>');
    });
    closeLists();
    return out.join('');
  }

  /* KaTeX 多级 CDN 兜底：逐个试，全失败就原样显示 LaTeX，不阻断任何功能。
     本机实测默认 jsdelivr 与 raw.githubusercontent 不通，故必须保留多个可用镜像。 */
  var katexPromise = null;
  function ensureKatex() {
    if (window.katex) return Promise.resolve(true);
    if (katexPromise) return katexPromise;
    var list = CFG.katexCdns || [{ css: CFG.katexCss, js: CFG.katexJs }];
    katexPromise = (function tryOne(i) {
      if (i >= list.length) return Promise.resolve(false);
      return new Promise(function (resolve) {
        var done = false;
        function finish(v) { if (!done) { done = true; resolve(v); } }
        var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = list[i].css;
        document.head.appendChild(css);
        var s = document.createElement('script'); s.src = list[i].js;
        s.onload = function () { finish(!!window.katex); };
        s.onerror = function () { finish(false); };
        document.head.appendChild(s);
        setTimeout(function () { finish(!!window.katex); }, 6000);
      }).then(function (ok) { return ok ? true : tryOne(i + 1); });
    })(0);
    return katexPromise;
  }
  function renderMath(root) {
    if (!window.katex) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var t = node.nodeValue;
      if (!t || t.indexOf('$') < 0 || !node.parentNode || /^(SCRIPT|STYLE|CODE)$/.test(node.parentNode.tagName)) return;
      var parts = t.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
      if (parts.length < 2) return;
      var frag = document.createDocumentFragment(), changed = false;
      parts.forEach(function (p) {
        if (!p) return;
        var mm = /^\$\$([\s\S]+)\$\$$/.exec(p) || /^\$([^$]+)\$$/.exec(p);
        if (mm) {
          var sp = document.createElement('span');
          try { sp.innerHTML = window.katex.renderToString(mm[1], { displayMode: !!p.startsWith('$$'), throwOnError: false }); }
          catch (e) { sp.textContent = p; }
          frag.appendChild(sp); changed = true;
        } else frag.appendChild(document.createTextNode(p));
      });
      if (changed) node.parentNode.replaceChild(frag, node);
    });
  }
  /* 每次渲染完统一调用：先渲染公式，再补 Markdown 容器 */
  function enhance(root) {
    root = root || el('view');
    renderMath(root);
    $$('.md-body', root).forEach(function (box) {
      if (box.dataset.mdDone) return;
      box.dataset.mdDone = '1';
      box.innerHTML = md2html(box.textContent);
      renderMath(box);
    });
  }

  /* ==================== 数据层 ==================== */
  var loaded = {}, pending = {};
  /* 数据到手后做一次清洗：全选 ABCD 多为「一材料多小题」合并造成的脏数据，剔除；同时按 id 去重。
     兜底修复：部分选择题的 options 被存成了「字符串数组」（如 ["A项","B项"]），
     而非规范的 {key,text} 对象，导致渲染时 o.key/o.text 都是空、选项框空白、
     点选后 data-key 为空、提交被「先作答」拦截、下一题永远出不来。
     这里统一把字符串（或缺 key 的对象）补成 {key:'A'/'B'/'C'..., text}，原位改写共享引用，
     本地 / 云端 / 单文件构建共用本文件，一处修复全生效。 */
  function fixOptions(q) {
    if (!q || q.type !== 'choice' || !Array.isArray(q.options)) return;
    q.options = q.options.map(function (o, i) {
      var k = String.fromCharCode(65 + i); // A,B,C,D...
      if (typeof o === 'string') return { key: k, text: o };
      if (o && typeof o === 'object' && (o.key === undefined || o.key === null || o.key === ''))
        return { key: k, text: (o.text != null ? o.text : '') };
      return o;
    });
  }
  function normalizeSubject(subject) {
    /* 导入题库（q-extra.js）是静态加载，q-<subject>.js 是按需异步加载。
       必须等本科题库到位后再合并，否则会被 q-<subject>.js 的赋值整个覆盖。 */
    window.ZS_Q = window.ZS_Q || {};
    var arr = (window.ZS_Q[subject] || [])
      .concat((window.ZS_Q_EXTRA && window.ZS_Q_EXTRA[subject]) || []), seen = {};
    window.ZS_Q[subject] = arr.filter(function (q) {
      if (!q || !q.id || seen[q.id]) return false;
      if (q.type === 'choice' && normChoice(q.answer) === 'ABCD') return false;
      seen[q.id] = 1; return true;
    });
    (window.ZS_Q[subject] || []).forEach(fixOptions);
  }
  var Store = {
    /* 按需动态加载某一科题库；文件不存在时用 seed.js 的内置样例题 */
    ensure: function (subject) {
      if (loaded[subject]) return Promise.resolve();
      if (pending[subject]) return pending[subject];
      pending[subject] = new Promise(function (resolve) {
        var done = false;
        function finish() { if (!done) { done = true; loaded[subject] = true; normalizeSubject(subject); resolve(); } }
        var s = document.createElement('script');
        s.src = 'data/q-' + subject + '.js';
        s.onload = finish;
        s.onerror = finish;   // 优雅降级到 seed
        document.head.appendChild(s);
        setTimeout(finish, 8000);
      });
      return pending[subject];
    },
    q: function (subject) { return (window.ZS_Q && window.ZS_Q[subject]) || []; },
    /* 首页未加载题库时从轻量 q-meta.js 读真实题量，不必为了显示数字把 4.6MB 全下下来 */
    count: function (subject) {
      if (loaded[subject]) return Store.q(subject).length;
      var m = window.ZS_Q_META && window.ZS_Q_META[subject];
      return m ? m.count : Store.q(subject).length;
    },
    getQ: function (id) {
      var all = [];
      Object.keys(window.ZS_Q || {}).forEach(function (k) { all = all.concat(window.ZS_Q[k] || []); });
      return all.find(function (x) { return x.id === id; }) || null;
    },
    /* 适用范围筛选：广西优先＝广西 + 新课标II卷 + 全国卷；「全部」不过滤 */
    filter: function (subject, region) {
      var arr = Store.q(subject);
      if (!region || region === '全部') return arr;
      if (region === '广西') {
        /* 自己导入的资料不按适用范围过滤，否则默认「广西」会把它们筛掉、出现刷不到的情况 */
        var f = arr.filter(function (x) { return x.imported || /广西|新课标\s*II|新课标二|全国/.test(x.region || ''); });
        return f.length >= 4 ? f : arr;   // 数据不足时退回全量，保证有题可刷
      }
      var g = arr.filter(function (x) { return (x.region || '').indexOf(region) >= 0; });
      return g.length ? g : arr;
    },
    /* 10 关 × 8 题，按难度与年份排序后切块，保证关卡稳定可复现 */
    levels: function (subject, region) {
      var arr = Store.filter(subject, region).slice();
      arr.sort(function (a, b) {
        return (a.difficulty - b.difficulty) || (a.year - b.year) || String(a.id).localeCompare(String(b.id));
      });
      var per = window.ZS_QUESTIONS_PER_LEVEL, n = window.ZS_LEVELS_PER_SUBJECT, out = [];
      for (var i = 0; i < n; i++) {
        var seg = arr.slice(i * per, (i + 1) * per);
        if (!seg.length && arr.length) seg = pick(arr, Math.min(per, arr.length), i * 7919 + subject.length);
        out.push({ index: i + 1, subject: subject, qids: seg.map(function (x) { return x.id; }),
                   name: ['入门试探', '基础夯实', '概念辨析', '方法初识', '综合运用',
                          '易错回炉', '真题试炼', '压轴攻坚', '限时冲刺', '登顶之战'][i] });
      }
      return out;
    },
    conclusions: function (subject) {
      var a = window.ZS_CONCLUSIONS || [];
      return subject && subject !== 'all' ? a.filter(function (x) { return x.subject === subject; }) : a;
    },
    textbooks: function (subject) {
      var a = window.ZS_TEXTBOOKS || [];
      return subject && subject !== 'all' ? a.filter(function (x) { return x.subject === subject; }) : a;
    },
    papers: function (subject) {
      var a = window.ZS_PAPERS || [];
      return subject && subject !== 'all' ? a.filter(function (x) { return x.subject === subject; }) : a;
    },
    outlines: function (subject) {
      var a = window.ZS_OUTLINES || [];
      return subject && subject !== 'all' ? a.filter(function (x) { return x.subject === subject; }) : a;
    },
    universities: function () { return window.ZS_UNIVERSITIES || []; },
    /* 组卷：题库按年份/地区聚合成整卷（开源 papers.js 为空时也能生成） */
    buildPapers: function (subject) {
      var remote = Store.papers(subject);
      if (remote.length) return remote;
      var byKey = {};
      Store.filter(subject, '全部').forEach(function (q) {
        var k = (q.year || '未标') + '|' + (q.region || '综合');
        (byKey[k] = byKey[k] || []).push(q);
      });
      return Object.keys(byKey).map(function (k, i) {
        var p = k.split('|'), arr = byKey[k];
        return { id: 'p_auto_' + subject + '_' + i, year: p[0], subject: subject, region: p[1],
                 title: p[0] + ' 年 ' + (SMAP[subject] ? SMAP[subject].name : subject) + ' · ' + p[1] + ' 组卷',
                 qids: arr.map(function (x) { return x.id; }), count: arr.length, url: '' };
      }).filter(function (p) { return p.count >= 5; }).sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); });
    },
    /* 通用 CRUD 包装，业务层只写命名空间与对象 */
    all: function (ns) { return B.db.all(ns); },
    put: function (ns, row) { return B.db.put(ns, row); },
    query: function (ns, fn) { return B.db.query(ns, fn); },
    get: function (ns, id) { return B.db.get(ns, id); },
    remove: function (ns, id) { return B.db.remove(ns, id); },
    /* 管理员跨账号读取（仅管理员调用），用于教师审阅台看全班面批提交 */
    adminAll: function (ns) { return B.db.adminAll ? B.db.adminAll(ns) : B.db.all(ns); },
    /* 教师端：管理员写一条归属指定学生的记录（教师点评），学生用自己的 all() 即可读到 */
    putFor: function (ns, row, ownerId) {
      return B.db.putFor ? B.db.putFor(ns, row, ownerId) : B.db.put(ns, row);
    },
    adminRemove: function (ns, id) {
      return B.db.adminRemove ? B.db.adminRemove(ns, id) : B.db.remove(ns, id);
    }
  };
  window.ZSStore = Store;

  /* ==================== 游戏化 ==================== */
  var Game = {
    load: async function () {
      var p = await Store.get('profile_ext', 'profile');
      state.xp = p ? (p.xp || 0) : 0;
      state.achievements = p ? (p.achievements || []) : [];
      state.bestCombo = p ? (p.bestCombo || 0) : 0;
    },
    save: function () {
      return Store.put('profile_ext', { id: 'profile', xp: state.xp,
        achievements: state.achievements, bestCombo: state.bestCombo, updatedAt: new Date().toISOString() });
    },
    rank: function () {
      var r = RANKS[0];
      RANKS.forEach(function (x) { if (state.xp >= x.min) r = x; });
      return r;
    },
    nextRank: function () {
      return RANKS.find(function (x) { return x.min > state.xp; }) || null;
    },
    progressPct: function () {
      var r = Game.rank(), n = Game.nextRank();
      if (!n) return 100;
      return Math.round((state.xp - r.min) / (n.min - r.min) * 100);
    },
    answer: async function (correct) {
      state.combo = correct ? state.combo + 1 : 0;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      var gain = correct ? Math.round(10 * (1 + Math.min(state.combo - 1, 5) * 0.2)) : 2;
      state.xp += gain;
      await Game.save();
      var newly = [];
      if (correct && state.combo >= 5) newly.push('combo5');
      if (correct && state.combo >= 10) newly.push('combo10');
      if (newly.length) await Game.unlock(newly);
      return { gain: gain, combo: state.combo, xp: state.xp, rank: Game.rank() };
    },
    unlock: async function (ids) {
      var added = [];
      (Array.isArray(ids) ? ids : [ids]).forEach(function (id) {
        if (state.achievements.indexOf(id) < 0) { state.achievements.push(id); added.push(id); }
      });
      if (added.length) {
        await Game.save();
        added.forEach(function (id) {
          var a = ACHS.find(function (x) { return x.id === id; });
          if (a) toast('成就解锁：' + a.name, 'ok');
        });
      }
      return added;
    },
    has: function (id) { return state.achievements.indexOf(id) >= 0; }
  };
  window.ZSGame = Game;

  /* ==================== AI 通道 ==================== */
  /* 未配置 Key 时的「离线教练」：保证每个 AI 功能开箱即可看到完整效果，
     管理员在「全站设置」填入 DeepSeek Key 后自动切换为真大模型，页面代码不变。 */
  function offline(spec, ctx) {
    var c = ctx || {}, q = c.question || {}, sname = (SMAP[c.subject] && SMAP[c.subject].name) || '';
    switch (c.scene) {
      case 'answer':
        return [
          '### 一句话诊断',
          c.correct ? '答对了。已掌握到「能独立选出正确结论」这一层，下一步看能否说清适用边界。'
                    : '按错因四分法，' + (q.type === 'choice' ? '先回看每个选项的成立条件，多半是概念性或策略性错误' : '先看步骤链在哪一步断了，多为程序性错误') + '。',
          '### 先想一步',
          '（高度追问）如果把这道题的条件换掉一个，结论还成立吗？' +
          (q.tags && q.tags.length ? '先围绕「' + q.tags.join('、') + '」把定义默念一遍。' : ''),
          '只提示到这里，先自己再试一次。',
          '### 思路链',
          q.analysis ? String(q.analysis).slice(0, 600) : '题库未附解析。请回到题干，逐条列出已知条件，再写出由已知能直接推出的第一个结论。',
          '### 这题真正考什么',
          '考点：' + ((q.tags || []).join('、') || '见题干') + '；出处：' + (q.source || '开源题库') + '。',
          '标准答案：' + (q.answer || '（题库未给）') + '；你的作答：' + (c.userAnswer || '未作答') + '。',
          '### 顺手补一个二级结论',
          '（配置大模型后，这里会结合本题考点给出可核对的二级结论及成立前提）',
          '### 变式一题',
          '把本题的其中一个条件改成相反情形，结论会怎样变化？请写出理由。',
          '### 复习节点',
          '今天订正 → 1 天后重做 → 3 天后口述思路 → 7 天后进错题回顾。',
          '',
          '> 当前为**内置离线教练**（未接入可用大模型：未配置 Key，或本机免费模型/云端暂不可用）。配置可用大模型后，本面板自动切换为逐题深度诊断。'
        ].join('\n');
      case 'weekly':
        var chapters = (SMAP[c.subject] && SMAP[c.subject].chapters) || [];
        return [
          '### 一句话总评',
          '已收到本周口述（' + String(c.transcript || '').length + ' 字）。下面按「你讲到的 / 你漏掉的 / 待核对」整理，逐条过一遍比重听一遍更省时间。',
          '### 逐条核对（离线版按章节粗分）',
          '✅ 口述原文已完整留档，可在「笔记与提纲」里回看。',
          '⚠️ 语音转写可能有同音字与断句误差，涉及公式、定理条件、专有名词请对照教材核一遍。',
          '❌ 离线教练不做知识性判定，避免误判误导；配置可用大模型后会逐条标出错误并给出正确表述。',
          '### 你漏掉的（本周应掌握 · 本科主干）',
          chapters.slice(0, 5).map(function (x, i) { return (i + 1) + '. ' + x + '（常考）'; }).join('\n') || '（暂无章节登记）',
          '### 本周复习提纲',
          chapters.map(function (x) { return '- ' + x + '\n  - 定义与成立前提\n  - 典型题型识别信号\n  - 易错点'; }).join('\n') || '（暂无）',
          '### 当场自测 3 题',
          '1. 用一句话说出本章最核心的结论。\n2. 举一个该结论不成立的反例。\n3. 说出它与上一章哪个知识点是前置关系。',
          '### 复习节点',
          '今天补漏 → 1 天后口述复述 → 3 天后做变式 → 7 天后整章回炉。',
          '',
          '> 当前为**内置离线教练**（未接入可用大模型）。配置可用大模型后，这里会逐条判定 ✅/⚠️/❌、纠正错误、补全遗漏并生成针对性自测题。'
        ].join('\n');
      case 'outline':
        return [
          '### 这份材料讲了什么',
          '已汇总 ' + String(c.materials || '').length + ' 字材料，覆盖科目：' + (sname || '未指定') + '。',
          '### 提纲（离线版按段落切分）',
          String(c.materials || '').split(/\n+/).filter(Boolean).slice(0, 20)
            .map(function (l, i) { return (i + 1) + '. ' + l.slice(0, 90); }).join('\n') || '（材料为空）',
          '### 待核对 / 材料缺口',
          '- 缺少章节归属与知识点标签\n- 公式、结论的成立前提需对照教材补齐',
          '### 按这个提纲复习的顺序建议',
          '今天通读 → 1 天后合上材料复述 → 3 天后做对应题目 → 7 天后回看错题。',
          '',
          '> 当前为**内置离线教练**（未接入可用大模型）。配置可用大模型后，会重组为三级提纲、标 ★○△ 权重、列关键公式与易混点对照。'
        ].join('\n');
      case 'exam':
        return [
          '### 失分结构',
          '得分 ' + (c.score || 0) + ' / ' + (c.total || 0) + '，用时 ' + (c.minutes || 0) + ' 分钟。离线版只做结构提示，逐题归因需配置大模型。',
          '- 知识漏洞：看错题对应的知识点标签是否集中在同一章\n- 方法策略：看是否在同一题型反复卡住\n- 时间分配：看最后几题是否空答\n- 执行失误：看有无看漏条件、抄错数',
          '### 最该先补的 3 个考点',
          '按错题标签出现频次排序，取前三（配置大模型后自动给出并说明优先级）。',
          '### 考场策略调整',
          '先做会的，单题卡超过 3 分钟立即跳；最后留 5 分钟检查涂卡与单位。',
          '### 接下来 7 天安排',
          '每天一件事：订正一类错题 → 口述该类思路 → 做 5 道同考点变式 → 重做本卷错题……',
          '',
          '> 当前为**内置离线教练**（未接入可用大模型）。配置可用大模型后按四类失分结构逐题归因并给 7 天可执行计划。'
        ].join('\n');
      default:
        return '已收到你的问题。当前为**内置离线教练**（未接入可用大模型：未配置 Key，或本机免费模型/云端暂不可用），' +
               '配置可用大模型后重新提问，即可获得逐层追问、最小提示与完整思路链。\n\n' +
               '你的问题已留档，可在「学习记录」里查看。';
    }
  }

  async function aiChat(spec, ctx) {
    ctx = ctx || {};
    var cfg = await B.llm.config();
    var msgs = window.ZS_PROMPTS.buildChat(spec, ctx.history || []);

    /* 单次对话封装：允许强制通道（兜底切换用）。失败时也带回已生成的正文，
       避免换通道后把同一段答案重复输出一遍。 */
    function doChat(provider) {
      var full = '';
      return B.llm.chat({
        provider: provider,
        system: msgs[0].content,
        messages: msgs.slice(1),
        model: ctx.model,
        signal: ctx.signal,
        images: ctx.images,                     // 多模态：上传图片时透传给支持视觉的模型
        onDelta: function (t) { full += t; if (ctx.onDelta) ctx.onDelta(t); }
      }).then(
        function () { return { ok: true, text: full }; },
        function (e) { return { ok: false, text: full, err: e }; }
      );
    }

    /* 兜底顺序：B1 云端免费模型代理 → 云免密钥 → 本机免费网关 → DeepSeek。
       没配的通道直接跳过；云端页面不再空跑 127.0.0.1（浏览器会拦 PNA 预检）。 */
    var localPage = location.protocol === 'file:' ||
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname);
    var order = [cfg.provider];
    [['free', !!cfg.freeUrl], ['cloud', !!CFG.enabled],
     ['ofm', localPage], ['deepseek', !!cfg.hasKey]].forEach(function (x) {
      if (order.indexOf(x[0]) < 0 && x[1]) order.push(x[0]);
    });

    var partial = '';
    for (var i = 0; i < order.length; i++) {
      var r = await doChat(order[i]);
      if (r.ok) return r.text;
      /* 图片识别只有支持视觉的通道能处理，失败立即报错，不落离线教练误导 */
      if (ctx.images) throw r.err;
      /* 已经吐出正文再断流时，保留已生成部分，不再换通道重复输出 */
      if (r.text) { partial = r.text; break; }
    }
    if (partial) return partial;

    /* 最后一跳：任何情况都可用 —— 内置离线教练，保证 AI 功能永不白屏 */
    var text = offline(spec, ctx);
    if (ctx.onDelta) ctx.onDelta(text);
    return text;
  }

  /* 把 AI 输出流式写进容器（容器内容用 textContent 写入，杜绝模型 HTML 注入） */
  async function aiInto(spec, box, ctx) {
    ctx = ctx || {};
    box.textContent = '';
    box.classList.remove('md-body'); box.dataset.mdDone = '';
    var acc = '', timer = null;
    function flush() {
      box.textContent = acc;
      box.scrollTop = box.scrollHeight;
      if (box.parentElement) box.parentElement.scrollTop = box.parentElement.scrollHeight;
    }
    try {
      var text = await aiChat(spec, Object.assign({}, ctx, {
        onDelta: function (t) {
          acc += t;
          if (!timer) timer = setTimeout(function () { timer = null; flush(); }, 80);
        }
      }));
      acc = text; flush();
      box.classList.add('md-body');
      box.innerHTML = md2html(text);
      box.dataset.mdDone = '1';   // 防止后续 enhance() 把已渲染的 HTML 再当纯文本处理
      renderMath(box);
      return text;
    } catch (e) {
      box.textContent = '调用失败：' + (e && e.message ? e.message : e);
      throw e;
    }
  }

  /* ==================== 语音输入 ==================== */
  function speech(onText, onState, opts) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('当前浏览器不支持语音识别，请直接把转写文字粘到输入框', 'err');
      return null;
    }
    var r = new SR();
    r.lang = (opts && opts.lang) || 'zh-CN';
    r.continuous = true; r.interimResults = true;
    var finalText = '';
    r.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      if (onText) onText(finalText + interim, false);
    };
    r.onerror = function (e) {
      if (onState) onState('error', e.error || '语音识别出错');
      toast('语音识别不可用（' + (e.error || '') + '），可直接打字输入', 'err');
    };
    r.onend = function () { if (onState) onState('end', ''); };
    try { r.start(); if (onState) onState('start', ''); } catch (e) { toast('无法启动麦克风：' + e.message, 'err'); }
    state.activeSpeech = r;
    return r;
  }

  /* ==================== 语音朗读（TTS） ==================== */
  /* 英语跟读 / 听力用：SpeechSynthesis 朗读指定文本，自动挑选对应语种嗓音。
     浏览器默认嗓音可能不是英文，故按 lang 优先匹配 en-US / en 嗓音。 */
  function tts(text, opts) {
    opts = opts || {};
    if (!('speechSynthesis' in window)) { toast('当前浏览器不支持语音朗读', 'err'); return null; }
    try { window.speechSynthesis.cancel(); } catch (e) {}
    var u = new SpeechSynthesisUtterance(String(text || ''));
    u.lang = opts.lang || 'en-US';
    u.rate = (opts.rate != null) ? opts.rate : 0.95;
    u.pitch = (opts.pitch != null) ? opts.pitch : 1;
    u.volume = (opts.volume != null) ? opts.volume : 1;
    if (opts.voice) u.voice = opts.voice;
    else {
      var vs = window.speechSynthesis.getVoices() || [];
      var pick = null;
      if (opts.lang) {
        var pre = opts.lang.toLowerCase().split('-')[0];
        pick = vs.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(pre) === 0; });
        if (opts.lang.indexOf('en') >= 0) {
          pick = pick.filter(function (v) { return /(en[-_]US|united states)/i.test(v.lang + ' ' + (v.name || '')); })
                 .concat(pick.filter(function (v) { return /^en/i.test(v.lang); }));
        }
      }
      if (pick && pick.length) u.voice = pick[0];
    }
    window.speechSynthesis.speak(u);
    return u;
  }
  function stopTts() { if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) {} } }
  function ttsVoices(lang) {
    var vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    if (!lang) return vs;
    var pre = lang.toLowerCase().split('-')[0];
    return vs.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(pre) === 0; });
  }

  /* ==================== 导航 / 路由 ==================== */
  var NAV = [
    { t: '学习', items: [
      ['home', '首', '学习首页'], ['quest', '关', '闯关刷题'], ['kpoint', '点', '知识点图谱'],
      ['diagnose', '诊', '前置补漏'], ['exam', '考', '在线模考'],
      ['papers', '卷', '整卷下载'], ['mypapers', '原', '我的整卷'], ['wrong', '错', '错题本'], ['records', '记', '学习记录']
    ] },
    { t: '六科入口', items: SUBJECTS.map(function (s) { return ['subject/' + s.id, s.short, s.name + '专属']; }) },
    { t: '大模型伴学', items: [
      ['companion', '伴', '语音伴学'], ['english', '英', '英语跟读听力'], ['hot', '热', '热点作文素材'], ['mianpi', '批', '在线面批'], ['notes', '纲', '笔记与提纲'], ['daily', '练', '每日一练']
    ] },
    { t: '资料库', items: [
      ['conclusions', '结', '二级结论'], ['textbooks', '书', '人教版教材'],
      ['drive', '料', '学科资料'], ['volunteer', '愿', '大学志愿'],
      ['files', '档', '本地资料互转'], ['bank', '库', '导入题库'], ['campus', '校', '云逛大学']
    ] },
    { t: '系统', items: [['account', '账', '账号与本机路径']] }
  ];

  function renderNav() {
    var groups = NAV.slice();
    if (Game && state.user && state.user.role === 'admin') {
      groups = groups.concat([{ t: '管理', items: [
        ['admin', '管', '全站设置'], ['teacher', '师', '教师端']
      ] }]);
    }
    el('sidebar').innerHTML = groups.map(function (g) {
      return '<div class="nav-group"><div class="nav-group-t">' + g.t + '</div>' +
        g.items.map(function (it) {
          return '<div class="nav-item" data-go="' + it[0] + '">' +
            '<span class="nav-ico">' + it[1] + '</span><span>' + it[2] + '</span></div>';
        }).join('') + '</div>';
    }).join('');
    $$('#sidebar .nav-item').forEach(function (n) {
      n.onclick = function () { go(n.dataset.go); };
    });
    markNav();
  }
  function markNav() {
    var path = (location.hash || '#/home').replace(/^#\//, '').split('/')[0];
    $$('#sidebar .nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.go.split('/')[0] === path);
    });
  }
  function renderChrome() {
    var r = Game.rank(), n = Game.nextRank();
    el('topbar-center').innerHTML =
      '<div class="rank-badge" title="当前段位">' + r.badge + '</div>' +
      '<div style="min-width:130px;flex:1;max-width:240px">' +
      '<div class="row between" style="font-size:11px;color:var(--ink-3);margin-bottom:3px">' +
      '<span class="strong" style="color:var(--ink)">' + r.name + '</span><span>' + state.xp + ' XP' +
      (n ? ' / ' + n.min : '') + '</span></div>' +
      '<div class="bar thin"><i style="width:' + Game.progressPct() + '%"></i></div></div>';
    var u = state.user;
    el('user-chip').innerHTML = u
      ? '<span class="avatar">' + esc(u.name.slice(0, 1)) + '</span><span>' + esc(u.name) + (u.role === 'admin' ? ' · 管理员' : '') + '</span>'
      : '<span class="avatar">客</span><span>游客</span>';
    el('user-chip').onclick = function () { go('account'); };
    el('mode-chip').textContent = state.mode === 'cloud' ? '云端' : '本地';
    el('mode-chip').className = 'mode-chip' + (state.mode === 'cloud' ? ' cloud' : '');
    el('mode-chip').title = state.mode === 'cloud' ? '数据存 WorkBuddy 云' : '数据只落本机，0 云消耗';
    el('footer-year').textContent = new Date().getFullYear();
  }

  function parseHash() {
    var p = (location.hash || '#/home').replace(/^#\/?/, '');
    var seg = p.split('/').filter(Boolean);
    return { name: seg[0] || 'home', params: seg.slice(1) };
  }
  function go(path) {
    var h = '#/' + String(path).replace(/^#\/?/, '');
    if (location.hash === h) route(); else location.hash = h;
  }
  function view(name, fn) { views[name] = fn; }
  function render(html) {
    var v = el('view');
    v.innerHTML = html;
    enhance(v);
    /* 强制重排后重挂动画类：每次切页都有轻微入场，系统设了「减少动态效果」时 CSS 自动关掉 */
    v.classList.remove('view-in'); void v.offsetWidth; v.classList.add('view-in');
    window.scrollTo(0, 0);
  }
  async function route() {
    var r = parseHash(), fn = views[r.name] || views.home;
    markNav();
    try { await fn(r.params || {}); }
    catch (e) {
      console.error('[中山一号] 视图渲染失败', r.name, e);
      render('<div class="card"><h2>这个页面出了点问题</h2><p class="muted">' + esc(e && e.message || e) +
        '</p><button class="btn primary" onclick="ZSApp.go(\'home\')">回首页</button></div>');
    }
    renderChrome();
  }
  async function refreshChrome() { renderNav(); renderChrome(); }

  /* ==================== 登录 / 注册 ==================== */
  function showAuth() {
    var ov = el('auth-overlay');
    ov.hidden = false;
    var m = window.ZSBackend_LOCAL ? null : null;
    el('auth-note').textContent = state.mode === 'cloud'
      ? '云端模式：注册需邮箱验证码，登录用邮箱 + 密码。不使用短信验证码。'
      : '本地模式：账号与答题记录只存在这台电脑的浏览器里，不上传任何服务器。第一个注册的账号自动成为管理员。';
  }
  function bindAuth() {
    var tab = 'login';
    $$('.auth-tabs .tab').forEach(function (b) {
      b.onclick = function () {
        tab = b.dataset.tab;
        $$('.auth-tabs .tab').forEach(function (x) { x.classList.toggle('active', x === b); });
        el('au-name-wrap').hidden = tab !== 'signup';
        el('au-submit').textContent = tab === 'signup' ? '注册' : '登录';
        el('auth-err').textContent = '';
        el('au-otp-wrap').hidden = true;
        state.otp = null;
      };
    });
    el('au-send-otp').onclick = async function () {
      var account = el('au-account').value.trim();
      if (!account) { el('auth-err').textContent = '先填账号（邮箱）'; return; }
      try {
        state.otp = await B.auth.sendOtp(account);
        toast('验证码已发送，请查收邮箱', 'ok');
      } catch (e) { el('auth-err').textContent = e.message; }
    };
    el('au-guest').onclick = function () { el('auth-overlay').hidden = true; toast('已进入游客模式，刷题记录单独存放'); };
    el('modal-close').onclick = closeModal;
    el('modal-overlay').onclick = function (e) { if (e.target === el('modal-overlay')) closeModal(); };

    el('auth-form').onsubmit = async function (e) {
      e.preventDefault();
      var account = el('au-account').value.trim(), secret = el('au-secret').value;
      var name = el('au-name').value.trim();
      el('auth-err').textContent = '';
      try {
        var payload = { account: account, secret: secret, name: name };
        if (state.otp && state.otp.needOtp) {
          payload.otpToken = el('au-otp').value.trim();
          payload.verificationId = state.otp.verificationId;
          payload.isExistingUser = state.otp.isExistingUser;
          if (!payload.otpToken) { el('auth-err').textContent = '请填邮箱验证码'; return; }
        }
        var u = tab === 'signup' ? await B.auth.signUp(payload) : await B.auth.signIn(payload);
        state.user = u; el('auth-overlay').hidden = true;
        await Game.load(); await refreshChrome();
        toast('欢迎，' + u.name + (u.role === 'admin' ? '（管理员）' : ''), 'ok');
        go('home');
      } catch (err) {
        /* 云端注册首轮必然走这里：拿到 needOtp 后展示验证码框，业务代码已预置 */
        if (err && err.code === 'ZS_NEED_OTP') {
          el('au-otp-wrap').hidden = false;
          try {
            state.otp = await B.auth.sendOtp(account);
            el('auth-err').textContent = '验证码已发到邮箱，填入后再点一次「注册」。';
            toast('验证码已发送', 'ok');
          } catch (e2) { el('auth-err').textContent = e2.message; }
          return;
        }
        el('auth-err').textContent = err && err.message ? err.message : String(err);
      }
    };
  }

  /* ==================== 通用片段（供各视图复用） ==================== */
  function pageHead(title, desc, right) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1><p>' + esc(desc || '') + '</p></div>' +
      '<div class="row">' + (right || '') + '</div></div>';
  }
  function subjectTabs(current, base) {
    return '<div class="tagbar"><a class="chip' + (current === 'all' ? ' sel' : '') + '" href="#/' + base + '/all">全部</a>' +
      SUBJECTS.map(function (s) {
        return '<a class="chip' + (current === s.id ? ' sel' : '') + '" href="#/' + base + '/' + s.id + '">' + s.name + '</a>';
      }).join('') + '</div>';
  }
  function qStemHtml(q) {
    return '<div class="q-stem">' + esc(q.stem || '') + '</div>';
  }
  function emptyBox(title, desc) {
    return '<div class="empty"><b>' + esc(title) + '</b>' + esc(desc || '') + '</div>';
  }
  async function requireLogin(action) {
    if (state.user) return true;
    toast('先登录或注册，才能' + (action || '保存数据') + '（游客也能体验，但不与账号绑定）', 'err');
    return false;
  }

  /* ==================== 主题（浅色 / 深色 / 跟随系统） ==================== */
  var THEME_KEY = 'zs1.theme.v1';
  var THEME_SEQ = ['light', 'dark', 'auto'];
  var THEME_LABEL = { light: '浅色', dark: '深色', auto: '跟随系统' };
  var THEME_ICON = { light: '☀', dark: '☾', auto: '◐' };
  function themePref() {
    try { var v = localStorage.getItem(THEME_KEY); if (THEME_SEQ.indexOf(v) >= 0) return v; } catch (e) {}
    return 'auto';
  }
  function themeResolved(p) {
    if (p === 'auto') {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    return p;
  }
  function applyTheme(p) {
    var r = themeResolved(p);
    document.documentElement.setAttribute('data-theme', r);
    document.documentElement.setAttribute('data-theme-pref', p);
    var meta = document.getElementById('meta-theme');
    if (meta) meta.setAttribute('content', r === 'dark' ? '#12161d' : '#f7f6f2');
    var btn = document.getElementById('theme-btn');
    if (btn) {
      btn.textContent = THEME_ICON[p] + ' ' + THEME_LABEL[p];
      btn.title = '当前：' + THEME_LABEL[p] + '（点击切换浅色 / 深色 / 跟随系统）';
      btn.setAttribute('aria-label', '主题：' + THEME_LABEL[p]);
    }
  }
  function initTheme() {
    applyTheme(themePref());
    var btn = document.getElementById('theme-btn');
    if (btn) btn.onclick = function () {
      var next = THEME_SEQ[(THEME_SEQ.indexOf(themePref()) + 1) % THEME_SEQ.length];
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next);
    };
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onSys = function () { if (themePref() === 'auto') applyTheme('auto'); };
      if (mq.addEventListener) mq.addEventListener('change', onSys);
      else if (mq.addListener) mq.addListener(onSys);
    }
  }

  /* ==================== 启动 ==================== */
  async function start() {
    initTheme();
    try {
      var r = await B.init();
      state.mode = r.mode;
      state.storage = r.storage || (r.mode === 'cloud' ? 'cloud' : 'local');
    } catch (e) {
      console.error(e); state.mode = 'local';
    }
    try { state.user = await B.auth.current(); } catch (e) { state.user = null; }
    await Game.load();
    bindAuth();
    if ('speechSynthesis' in window) { try { window.speechSynthesis.getVoices(); } catch (e) {} }
    renderNav(); renderChrome();
    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/home';
    if (!state.user) showAuth();
    await route();
  }

  window.ZSApp = {
    start: start, go: go, view: view, render: render, esc: esc, $: $, $$: $$, el: el,
    toast: toast, modal: modal, closeModal: closeModal, download: download,
    md2html: md2html, enhance: enhance, renderMath: renderMath, ensureKatex: ensureKatex,
    fmtDate: fmtDate, fmtTime: fmtTime, today: today, addDays: addDays, pick: pick,
    normChoice: normChoice, isMulti: isMulti,
    pageHead: pageHead, subjectTabs: subjectTabs, qStemHtml: qStemHtml, emptyBox: emptyBox,
    aiChat: aiChat, aiInto: aiInto, speech: speech, tts: tts, stopTts: stopTts, ttsVoices: ttsVoices, requireLogin: requireLogin,
    refreshChrome: refreshChrome, showAuth: showAuth,
    state: state, views: views
  };
})();
