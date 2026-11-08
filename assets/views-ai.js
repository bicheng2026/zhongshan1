/* 中山一号 · AI 伴学与资料/系统视图
 * companion / notes / daily / conclusions / textbooks / campus / account / admin */
(function () {
  'use strict';
  var A = window.ZSApp, S = window.ZSStore, G = window.ZSGame, B = window.ZSBackend;
  var CFG = window.ZS_CLOUD_CONFIG, SUBJECTS = window.ZS_SUBJECTS, SMAP = window.ZS_SUBJECT_MAP;
  var esc = A.esc, el = A.el, $$ = A.$$, go = A.go, toast = A.toast, state = A.state;
  var P = window.ZS_PROMPTS;

  function sname(id) { return (SMAP[id] && SMAP[id].name) || id || '全科'; }
  function sanitize(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }
  /* 把上传的图片文件压缩到 maxDim 以内并转 dataURL，避免原图太大撑爆 IndexedDB */
  function fileToDataURL(file, maxDim, q) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height, scale = Math.min(1, maxDim / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var c = document.createElement('canvas'); c.width = cw; c.height = ch;
          c.getContext('2d').drawImage(img, 0, 0, cw, ch);
          resolve(c.toDataURL('image/jpeg', q || 0.82));
        };
        img.onerror = function () { reject(new Error('图片解析失败')); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('读取文件失败')); };
      fr.readAsDataURL(file);
    });
  }
  /* fastly 偶发 SSL 握手失败，给同一 PDF 生成 ghproxy 备用直链 */
  function mirrorUrl(url) {
    var m = /^https:\/\/fastly\.jsdelivr\.net\/gh\/TapXWorld\/ChinaTextbook@master\/(.+)$/.exec(url || '');
    return m ? (CFG.textbookMirrorPrefix + CFG.textbookRepoPath + m[1]) : '';
  }
  function subjectSelect(id, cur) {
    return '<select id="' + id + '">' + SUBJECTS.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === cur ? ' selected' : '') + '>' + s.name + '</option>';
    }).join('') + '</select>';
  }

  /* ==================== 语音伴学 ==================== */
  A.view('companion', async function (p) {
    var subject = p[0] && SMAP[p[0]] ? p[0] : (state.compSubject || 'math');
    state.compSubject = subject;
    var recs = await S.query('study_records', function (r) { return r.subject === subject; });
    var weak = {};
    recs.filter(function (r) { return !r.correct; }).forEach(function (r) {
      (r.tags || []).forEach(function (t) { weak[t] = (weak[t] || 0) + 1; });
    });
    var weakTags = Object.keys(weak).sort(function (a, b) { return weak[b] - weak[a]; }).slice(0, 6);
    var cfg = await B.llm.config();
    var ready = await B.llm.isReady().catch(function () { return false; });
    var llmLabel = ready
      ? (cfg.provider === 'ofm' ? '本机免费模型已就绪'
         : cfg.provider === 'free' ? '云端免费模型已就绪' : '大模型已就绪')
      : (cfg.provider === 'ofm' ? '本机免费模型离线 · 离线教练兜底'
         : cfg.provider === 'free' ? '云端免费代理未连通 · 离线教练兜底' : '未配置 · 离线教练');
    var llmCls = ready ? 'green' : 'warn';
    var html = A.pageHead('语音伴学 · 讲一遍本周所学',
      '对着麦克风把这周学到的讲一遍，大模型逐条核对、纠错、补全，再生成复习提纲和自测题。',
      '<span class="chip ' + llmCls + '">' + llmLabel + '</span>' +
      '<a class="btn sm" href="#/admin">去设置</a>');
    html += '<div class="tagbar">' + SUBJECTS.map(function (s) {
      return '<a class="chip' + (s.id === subject ? ' sel' : '') + '" href="#/companion/' + s.id + '">' + s.name + '</a>';
    }).join('') + '</div>';

    html += '<div class="grid g2"><div>' +
      '<div class="card mb"><h3>本周复盘</h3>' +
      '<p class="small muted">讲什么：这一周学了哪几章、公式定理怎么用、哪道题卡住了、你觉得哪些还没弄懂。想到哪说到哪，不用背稿。</p>' +
      '<div class="row mb"><span class="chip">本周范围：' + weekRange() + '</span>' +
      (weakTags.length ? '<span class="chip red">薄弱考点：' + esc(weakTags.join('、')) + '</span>' : '<span class="chip">暂无错题数据</span>') + '</div>' +
      '<textarea id="cp-text" style="min-height:150px" placeholder="可以直接打字，或点下面的麦克风开始口述…"></textarea>' +
      '<div class="row mt"><button class="mic" id="cp-mic" title="开始语音输入">●</button>' +
      '<span class="small muted" id="cp-mic-tip">点麦克风开始说话，再点一次结束。浏览器不支持语音时直接打字即可。</span>' +
      '<span class="spacer"></span><button class="btn ghost sm" id="cp-clear">清空</button></div>' +
      '<div class="row mt"><button class="btn primary" id="cp-review">开始本周复盘</button>' +
      '<button class="btn" id="cp-ask">自由提问</button></div></div>' +
      '<div class="card"><h3>提纲存档</h3><div id="cp-outlines" class="small muted">载入中…</div></div></div>' +

      '<div class="card"><div class="row between"><h3 style="margin:0">伴学对话</h3>' +
      '<button class="btn sm ghost" id="cp-new">开启新对话</button></div>' +
      '<div class="chat-wrap mt"><div class="chat-log" id="cp-log">' +
      '<div class="msg sys">先讲一遍本周所学，或直接在下面问我问题。我会先追问、给最小提示，再展开完整思路。</div>' +
      '</div><div class="chat-input"><textarea id="cp-input" placeholder="问一个问题…（Ctrl+Enter 发送）"></textarea>' +
      '<button class="btn primary" id="cp-send">发送</button></div></div>' +
      '<div class="row mt"><button class="btn sm" id="cp-save">把最后一轮存成提纲</button>' +
      '<span class="small muted">对话只保留最近 8 轮作为上下文</span></div></div></div>';
    A.render(html);
    loadOutlines();

    /* 语音输入 */
    var rec = null;
    el('cp-mic').onclick = function () {
      if (rec) {
        try { rec.stop(); } catch (e) {}
        rec = null; el('cp-mic').classList.remove('rec');
        el('cp-mic-tip').textContent = '已结束录音，文字已填入上方，可手动修改后再复盘。';
        return;
      }
      rec = A.speech(function (text) { el('cp-text').value = text; }, function (st, msg) {
        if (st === 'start') { el('cp-mic').classList.add('rec'); el('cp-mic-tip').textContent = '正在听…再点一次结束。'; }
        if (st === 'end' || st === 'error') {
          rec = null; el('cp-mic').classList.remove('rec');
          if (st === 'error') el('cp-mic-tip').textContent = '语音不可用（' + msg + '），请直接打字输入。';
        }
      });
    };
    el('cp-clear').onclick = function () { el('cp-text').value = ''; };

    /* 本周复盘 */
    el('cp-review').onclick = async function () {
      var text = el('cp-text').value.trim();
      if (!text) { toast('先讲点什么，或把转写文字粘进来', 'err'); return; }
      addMsg('user', '【本周复盘】' + text);
      var box = addMsg('ai', '正在逐条核对…');
      var spec = P.weeklyReview({ subject: subject, transcript: text,
        weekRange: weekRange(), weakTags: weakTags });
      try {
        var full = await A.aiInto(spec, box, { scene: 'weekly', subject: subject,
          transcript: text, weekRange: weekRange(), weakTags: weakTags, history: state.chatHistory });
        state.chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: full });
        await G.unlock('talk1');
        state.lastAIOutput = full; state.lastAITitle = sname(subject) + '本周复盘 ' + A.today();
      } catch (e) { box.textContent = '复盘失败：' + e.message; }
    };

    /* 自由提问 */
    async function send() {
      var t = el('cp-input').value.trim(); if (!t) return;
      el('cp-input').value = '';
      addMsg('user', t);
      var box = addMsg('ai', '正在想…');
      var spec = P.companion({ subject: subject, message: t });
      try {
        var full = await A.aiInto(spec, box, { subject: subject, scene: 'companion', history: state.chatHistory });
        state.chatHistory.push({ role: 'user', content: t }, { role: 'assistant', content: full });
        state.lastAIOutput = full; state.lastAITitle = sname(subject) + '伴学 ' + A.today();
      } catch (e) { box.textContent = '调用失败：' + e.message; }
    }
    el('cp-send').onclick = send;
    el('cp-input').onkeydown = function (e) { if (e.ctrlKey && e.key === 'Enter') send(); };
    el('cp-new').onclick = function () {
      state.chatHistory = []; el('cp-log').innerHTML = '<div class="msg sys">新对话已开始。</div>';
    };
    el('cp-save').onclick = async function () {
      if (!state.lastAIOutput) { toast('还没有可保存的内容', 'err'); return; }
      await S.put('outlines', { id: 'o_' + Date.now(), title: state.lastAITitle,
        subject: subject, content: state.lastAIOutput, source: '语音伴学', at: new Date().toISOString() });
      await G.unlock('outline1'); loadOutlines(); toast('已存入提纲库', 'ok');
    };

    function addMsg(role, text) {
      var d = document.createElement('div');
      d.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
      d.textContent = text;
      var log = el('cp-log'); log.appendChild(d); log.scrollTop = log.scrollHeight;
      return d;
    }
    async function loadOutlines() {
      var list = (await S.all('outlines')).slice().reverse().slice(0, 6);
      var box = el('cp-outlines'); if (!box) return;
      box.innerHTML = list.length ? list.map(function (o) {
        return '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)">' +
          '<span>' + esc(o.title) + '</span><button class="btn sm ghost" data-ol="' + esc(o.id) + '">查看</button></div>';
      }).join('') : '<p class="small muted">还没有提纲。完成一次复盘后点「把最后一轮存成提纲」。</p>';
      $$('[data-ol]', box).forEach(function (n) {
        n.onclick = async function () {
          var o = await S.get('outlines', n.dataset.ol);
          if (o) A.modal(o.title, '<div class="md-body">' + esc(o.content) + '</div>' +
            '<button class="btn sm mt" id="ol-dl">导出 Markdown</button>');
          var dl = el('ol-dl'); if (dl) dl.onclick = function () {
            A.download(sanitize(o.title) + '.md', o.content, 'text/markdown;charset=utf-8');
          };
          A.enhance(el('modal-body'));
        };
      });
    }
  });
  function weekRange() {
    var d = new Date(), day = d.getDay() || 7, mon = new Date(d); mon.setDate(d.getDate() - day + 1);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return A.fmtDate(mon.toISOString()) + ' ~ ' + A.fmtDate(sun.toISOString());
  }

  /* ==================== 笔记与提纲 ==================== */
  A.view('notes', async function (p) {
    var subject = p[0] || 'all';
    var files = await B.file.list();
    var outlines = (await S.all('outlines')).slice().reverse();
    var localPath = await B.file.localPath();

    var html = A.pageHead('笔记与提纲', '口述、粘贴、上传笔记或教材，汇总后由大模型整理成分层复习提纲。',
      '<button class="btn" id="nt-bind">绑定本机目录</button>');
    html += A.subjectTabs(subject, 'notes');
    html += '<div class="card pad-s mb small">当前账号本机对应路径：<b class="mono">' + esc(localPath || '（未绑定）') +
      '</b>　<span class="muted">' + (state.mode === 'cloud' ? '云端模式文件存在你的云空间，「同步到本机」会下载到浏览器默认下载目录。'
        : '本地模式文件存浏览器数据库；绑定目录后可一键写回本机磁盘。') + '</span></div>';

    html += '<div class="grid g2 mb"><div class="card"><h3>① 收集材料</h3>' +
      '<label class="field">材料标题<input type="text" id="nt-title" placeholder="例：本周物理笔记 + 教材第三章"></label>' +
      '<div class="row mb">' + subjectSelect('nt-subject', subject === 'all' ? 'math' : subject) +
      '<button class="mic" id="nt-mic" title="口述录入">●</button><span class="small muted">口述录入</span></div>' +
      '<textarea id="nt-text" style="min-height:130px" placeholder="把课堂笔记、口述知识点、教材摘录粘到这里…"></textarea>' +
      '<div class="mt"><input type="file" id="nt-file" multiple accept=".txt,.md,.json,.csv,.html,.htm"></div>' +
      '<div class="small muted mt">支持 txt / md / 文本类文件上传；PDF 教材请走「人教版教材」栏目的直链，不必上传。</div>' +
      '<div class="row mt"><button class="btn primary" id="nt-add">存入材料库</button>' +
      '<button class="btn accent" id="nt-outline">整理成复习提纲</button></div></div>' +

      '<div class="card"><h3>② 材料库</h3><div id="nt-files" class="small">' +
      (files.length ? files.map(function (f) {
        return '<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line)">' +
          '<span>' + esc(f.name) + ' <span class="muted tiny">' + Math.round((f.size || 0) / 1024) + ' KB</span></span>' +
          '<span class="row"><button class="btn sm ghost" data-fd="' + esc(f.name) + '">下载</button>' +
          '<button class="btn sm ghost" data-fs="' + esc(f.name) + '">同步本机</button>' +
          '<button class="btn sm ghost" data-fr="' + esc(f.name) + '">删除</button></span></div>';
      }).join('') : '<p class="muted">还没有材料。粘贴一段笔记或上传一个 txt 就能开始。</p>') +
      '</div><div class="divider"></div><h3>③ 提纲库</h3><div id="nt-outlines" class="small">' +
      (outlines.length ? outlines.map(function (o) {
        return '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)">' +
          '<span>' + esc(o.title) + '</span><span class="row"><button class="btn sm ghost" data-ov="' + esc(o.id) + '">查看</button>' +
          '<button class="btn sm ghost" data-od="' + esc(o.id) + '">导出</button></span></div>';
      }).join('') : '<p class="muted">还没有提纲。</p>') + '</div></div></div>';
    A.render(html);

    /* 口述 */
    var rec = null;
    el('nt-mic').onclick = function () {
      if (rec) { try { rec.stop(); } catch (e) {} rec = null; el('nt-mic').classList.remove('rec'); toast('录音结束'); return; }
      rec = A.speech(function (t) { el('nt-text').value = t; }, function (st) {
        if (st === 'start') el('nt-mic').classList.add('rec');
        else { rec = null; el('nt-mic').classList.remove('rec'); }
      });
    };
    /* 上传 / 粘贴入库 */
    el('nt-add').onclick = async function () {
      var title = el('nt-title').value.trim() || ('材料 ' + A.today());
      var text = el('nt-text').value.trim();
      var fs = el('nt-file').files;
      if (!text && !fs.length) { toast('先粘贴文字或选文件', 'err'); return; }
      if (text) await B.file.put(sanitize(title) + '-' + Date.now() + '.txt',
        new Blob([text], { type: 'text/plain;charset=utf-8' }), { note: '粘贴/口述' });
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        await B.file.put('upload-' + Date.now() + '-' + f.name, f, { note: '上传' });
      }
      await S.put('notes', { id: 'n_' + Date.now(), title: title, subject: el('nt-subject').value,
        at: new Date().toISOString(), chars: text.length + '' });
      await G.unlock('note1');
      toast('材料已入库', 'ok'); go('notes/' + subject);
    };
    /* 整理成提纲 */
    el('nt-outline').onclick = async function () {
      var title = el('nt-title').value.trim() || ('复习提纲 ' + A.today());
      var subj = el('nt-subject').value;
      var parts = [], typed = el('nt-text').value.trim();
      if (typed) parts.push('【粘贴/口述】\n' + typed);
      var fl = await B.file.list();
      for (var i = 0; i < Math.min(fl.length, 8); i++) {
        var blob = await B.file.get(fl[i].name);
        if (blob) {
          var t = await blob.text();
          parts.push('【' + fl[i].name + '】\n' + t.slice(0, 4000));
        }
      }
      if (!parts.length) { toast('材料库是空的，先粘贴或上传', 'err'); return; }
      var materials = parts.join('\n\n').slice(0, 16000);
      var spec = P.outline({ subject: subj, title: title, materials: materials });
      A.modal('正在整理复习提纲', '<div class="ai-panel"><div class="ai-head">✦ ' + esc(title) + '</div>' +
        '<div class="md-body" id="nt-ai">正在组织…</div></div>' +
        '<button class="btn primary mt" id="nt-save" disabled>保存到提纲库</button>');
      var full = '';
      try {
        full = await A.aiInto(spec, el('nt-ai'), { scene: 'outline', subject: subj,
          title: title, materials: materials });
        await S.put('outlines', { id: 'o_' + Date.now(), title: title, subject: subj,
          content: full, source: '笔记整理', at: new Date().toISOString() });
        await G.unlock('outline1');
        el('nt-save').disabled = false;
        el('nt-save').textContent = '已自动保存 · 导出 Markdown';
        el('nt-save').onclick = function () { A.download(sanitize(title) + '.md', full, 'text/markdown;charset=utf-8'); };
      } catch (e) { el('nt-ai').textContent = '生成失败：' + e.message; }
    };
    el('nt-bind').onclick = async function () {
      var r = await B.file.bindLocalDir();
      toast(r.ok ? ('已绑定：' + r.label) : r.label, r.ok ? 'ok' : 'err');
      go('notes/' + subject);
    };
    $$('[data-fd]').forEach(function (n) {
      n.onclick = async function () {
        var blob = await B.file.get(n.dataset.fd); if (!blob) { toast('文件不在库里', 'err'); return; }
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = n.dataset.fd;
        a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      };
    });
    $$('[data-fs]').forEach(function (n) {
      n.onclick = async function () {
        var ok = await B.file.syncToLocal(n.dataset.fs);
        toast(ok ? '已同步到本机目录' : '未绑定本机目录，请点右上「绑定本机目录」', ok ? 'ok' : 'err');
      };
    });
    $$('[data-fr]').forEach(function (n) {
      n.onclick = async function () { await B.file.remove(n.dataset.fr); go('notes/' + subject); };
    });
    $$('[data-ov]').forEach(function (n) {
      n.onclick = async function () {
        var o = await S.get('outlines', n.dataset.ov);
        if (o) { A.modal(o.title, '<div class="md-body">' + esc(o.content) + '</div>'); A.enhance(el('modal-body')); }
      };
    });
    $$('[data-od]').forEach(function (n) {
      n.onclick = async function () {
        var o = await S.get('outlines', n.dataset.od);
        if (o) A.download(sanitize(o.title) + '.md', o.content, 'text/markdown;charset=utf-8');
      };
    });
  });

  /* ==================== 每日一练 · 七天包 ==================== */
  A.view('daily', async function (p) {
    var subject = p[0] && SMAP[p[0]] ? p[0] : (state.dailySubject || 'math');
    state.dailySubject = subject;
    await S.ensure(subject);
    var start = A.today(), packId = 'pack_' + subject + '_' + start;
    var pack = await S.get('daily_packs', packId);
    var qs = S.filter(subject, state.region);

    var html = A.pageHead('每日一练 · 七天包', '一次生成七天、一键导出可打印练习册；题目按考点轮换，稳定可复现。',
      '<a class="btn" href="#/notes">笔记成纲</a>');
    html += '<div class="tagbar">' + SUBJECTS.map(function (s) {
      return '<a class="chip' + (s.id === subject ? ' sel' : '') + '" href="#/daily/' + s.id + '">' + s.name + '</a>';
    }).join('') + '</div>';
    html += '<div class="card pad-s mb"><div class="row">' +
      '<span class="small">起始日期</span><input type="text" id="dl-start" value="' + start + '" style="width:130px">' +
      '<span class="small">每天题数</span><input type="number" id="dl-n" value="' + (state.dailyN || 8) + '" min="3" max="20" style="width:80px">' +
      '<button class="btn primary" id="dl-gen">生成 / 重建七天包</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn accent" id="dl-export"' + (pack ? '' : ' disabled') + '>一次导出七天</button>' +
      '<button class="btn" id="dl-today"' + (pack ? '' : ' disabled') + '>做今天这包</button>' +
      '</div><div class="small muted mt">题库当前 ' + qs.length + ' 题。若点「做今天这包」，答完同样触发大模型逐题指导。</div></div>';

    if (!pack) html += A.emptyBox('还没有七天包', '点上面「生成 / 重建七天包」，一次排好七天题目');
    else {
      var mp = {}; S.q(subject).forEach(function (q) { mp[q.id] = q; });
      html += '<div class="grid g3">' + pack.days.map(function (d, i) {
        var tags = {};
        d.qids.forEach(function (id) { if (mp[id]) (mp[id].tags || []).forEach(function (t) { tags[t] = 1; }); });
        return '<div class="pack-day' + (d.date === A.today() ? ' today' : '') + '">' +
          '<div class="row between"><div class="strong">第 ' + (i + 1) + ' 天 · ' + d.date.slice(5) + '</div>' +
          (d.date === A.today() ? '<span class="chip orange">今天</span>' : '') + '</div>' +
          '<div class="small muted mt">考点：' + esc(Object.keys(tags).slice(0, 4).join('、') || '综合') + '</div>' +
          '<div class="small mt">' + d.qids.length + ' 题 · 预计 ' + (d.qids.length * 3) + ' 分钟</div>' +
          '<div class="row mt"><button class="btn sm" data-dd="' + i + '">做这包</button>' +
          '<button class="btn sm ghost" data-dt="' + i + '">' + (d.done ? '已完成 ✓' : '标记完成') + '</button>' +
          '<button class="btn sm ghost" data-da="' + i + '">AI 导语</button></div></div>';
      }).join('') + '</div>';
      html += '<div class="card mt"><div class="row between"><div><h3 style="margin:0">整包进度</h3>' +
        '<p class="small muted" style="margin:4px 0 0">' + pack.days.filter(function (d) { return d.done; }).length + ' / 7 天已完成</p></div>' +
        '<div style="width:220px"><div class="bar"><i style="width:' +
        Math.round(pack.days.filter(function (d) { return d.done; }).length / 7 * 100) + '%"></i></div></div></div></div>';
    }
    A.render(html);

    el('dl-gen').onclick = async function () {
      var n = Math.max(3, Math.min(20, Number(el('dl-n').value) || 8));
      var date0 = el('dl-start').value.trim() || A.today();
      state.dailyN = n;
      var pool = S.filter(subject, state.region).slice();
      if (pool.length < 3) { toast('该科题库数据量不足', 'err'); return; }
      var days = [];
      for (var i = 0; i < 7; i++) {
        /* 用 (日期, 科目, 天序) 作种子，保证同一包反复打开题目不变 */
        var seed = date0.split('-').join('') * 1 + i * 7919 + subject.length * 131;
        var seg = A.pick(pool, Math.min(n, pool.length), seed);
        days.push({ date: A.addDays(date0, i), qids: seg.map(function (q) { return q.id; }), done: false });
      }
      await S.put('daily_packs', { id: 'pack_' + subject + '_' + date0, subject: subject,
        startDate: date0, perDay: n, days: days, at: new Date().toISOString() });
      toast('七天包已生成', 'ok'); go('daily/' + subject);
    };
    el('dl-export').onclick = function () { exportPack(pack, subject); };
    el('dl-today').onclick = function () { startDay(pack, 0); };
    $$('[data-dd]').forEach(function (n) { n.onclick = function () { startDay(pack, Number(n.dataset.dd)); }; });
    $$('[data-dt]').forEach(function (n) {
      n.onclick = async function () {
        var i = Number(n.dataset.dt);
        pack.days[i].done = !pack.days[i].done;
        await S.put('daily_packs', pack);
        if (pack.days.every(function (d) { return d.done; })) await G.unlock('daily7');
        go('daily/' + subject);
      };
    });
    $$('[data-da]').forEach(function (n) {
      n.onclick = async function () {
        var i = Number(n.dataset.da), d = pack.days[i];
        var mp2 = {}; S.q(subject).forEach(function (q) { mp2[q.id] = q; });
        var tags = [];
        d.qids.forEach(function (id) { if (mp2[id]) tags = tags.concat(mp2[id].tags || []); });
        var spec = P.daily({ subject: subject, day: i + 1, count: d.qids.length,
          tags: Array.from(new Set(tags)).slice(0, 6), weakTags: [] });
        A.modal('第 ' + (i + 1) + ' 天 · 练习导语', '<div class="md-body" id="dl-ai">正在生成…</div>');
        try { await A.aiInto(spec, el('dl-ai'), { scene: 'daily', subject: subject,
          day: i + 1, count: d.qids.length, tags: tags }); } catch (e) {}
      };
    });

    function startDay(pk, i) {
      state.dailyQids = pk.days[i].qids.slice();
      state.dailyPackId = pk.id; state.dailyDay = i;
      go('practice/' + pk.subject + '/daily');
    }
    function exportPack(pk, subj) {
      var mp = {}; S.q(subj).forEach(function (q) { mp[q.id] = q; });
      var out = ['# 中山一号 · ' + sname(subj) + ' 每日一练（七天包）', '',
        '起始：' + pk.startDate + '　每天 ' + pk.perDay + ' 题　适用范围：' + state.region, '',
        '姓名：________　目标：________　家长签字：________', '', '---', ''];
      pk.days.forEach(function (d, i) {
        out.push('## 第 ' + (i + 1) + ' 天 · ' + d.date, '');
        d.qids.forEach(function (id, j) {
          var q = mp[id]; if (!q) return;
          out.push('### ' + (j + 1) + '. （' + (q.score || 5) + ' 分 · ' + (q.type === 'choice' ? '选择' : q.type === 'fill' ? '填空' : '解答') + '）', '');
          out.push(String(q.stem || ''), '');
          (q.options || []).forEach(function (o) { out.push(o.key + '. ' + o.text); });
          out.push('', q.type === 'choice' ? '答：______' : '答：____________________________________________', '');
          out.push('<sub>出处：' + (q.source || '开源题库') + '</sub>', '');
        });
        out.push('', '---', '');
      });
      out.push('# 参考答案与解析', '');
      pk.days.forEach(function (d, i) {
        out.push('## 第 ' + (i + 1) + ' 天', '');
        d.qids.forEach(function (id, j) {
          var q = mp[id]; if (!q) return;
          out.push((j + 1) + '. **答案：** ' + (q.answer || '（题库未给）'));
          if (q.analysis) out.push('   **解析：** ' + String(q.analysis).replace(/\n/g, ' ').slice(0, 500));
        });
        out.push('');
      });
      out.push('', '---', '', '中山一号 · 题目逐条标注出处 · 生成于 ' + A.fmtTime(new Date().toISOString()));
      A.download('中山一号-' + sname(subj) + '-七天练习-' + pk.startDate + '.md',
        out.join('\n'), 'text/markdown;charset=utf-8');
      toast('七天练习册已导出（含答案）', 'ok');
    }
  });

  /* ==================== 二级结论 ==================== */
  A.view('conclusions', async function (p) {
    var subject = p[0] || 'all';
    var all = S.conclusions(subject);
    var html = A.pageHead('二级结论', '先按课本基础结论核对再记；每条都写清成立前提与用错就翻车的情形。',
      '<button class="btn" id="cl-export">导出全部</button>');
    html += A.subjectTabs(subject, 'conclusions');
    html += '<div class="card pad-s mb"><input type="text" id="cl-search" placeholder="搜标题、公式或关键词…"></div>';
    html += '<div id="cl-list">' + conclusionCards(all) + '</div>';
    A.render(html);
    el('cl-search').oninput = function () {
      var k = el('cl-search').value.trim().toLowerCase();
      var list = all.filter(function (c) {
        return !k || [c.title, c.formula, c.content, (c.tags || []).join('')].join('').toLowerCase().indexOf(k) >= 0;
      });
      el('cl-list').innerHTML = conclusionCards(list);
      bindCards(); A.enhance(el('cl-list'));
    };
    el('cl-export').onclick = function () {
      var out = ['# 中山一号 · 二级结论集', '', '导出：' + A.fmtTime(new Date().toISOString()), ''];
      all.forEach(function (c, i) {
        out.push('## ' + (i + 1) + '. [' + sname(c.subject) + '] ' + c.title, '',
          '**结论**：' + (c.formula || ''), '', (c.content || ''), '', '来源：' + (c.source || ''), '');
      });
      A.download('中山一号-二级结论-' + A.today() + '.md', out.join('\n'), 'text/markdown;charset=utf-8');
      toast('已导出', 'ok');
    };
    bindCards();
    function conclusionCards(list) {
      if (!list.length) return A.emptyBox('没有匹配的结论', '换个关键词，或换个科目');
      return '<div class="grid g2">' + list.map(function (c) {
        return '<div class="card pad-s"><div class="row between"><div class="row">' +
          '<span class="chip blue">' + sname(c.subject) + '</span>' +
          (c.tags || []).slice(0, 2).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') +
          '</div><span class="tiny muted">' + esc(String(c.source || '').slice(0, 20)) + '</span></div>' +
          '<h3 class="mt">' + esc(c.title) + '</h3>' +
          '<div class="f" style="background:var(--surface-2);padding:9px 12px;border-radius:8px;overflow-x:auto">' + esc(c.formula) + '</div>' +
          '<p class="small" style="margin:8px 0">' + esc(c.content || '') + '</p>' +
          '<button class="btn sm" data-cl="' + esc(c.id) + '">大模型精讲（前提 / 反例 / 用法）</button></div>';
      }).join('') + '</div>';
    }
    function bindCards() {
      $$('[data-cl]').forEach(function (n) {
        n.onclick = function () {
          var c = all.find(function (x) { return x.id === n.dataset.cl; }); if (!c) return;
          var spec = P.conclusion({ subject: c.subject, title: c.title,
            formula: c.formula, content: c.content, source: c.source });
          A.modal(c.title, '<div class="row mb"><span class="chip blue">' + sname(c.subject) + '</span>' +
            '<span class="chip">来源：' + esc(c.source || '') + '</span></div>' +
            '<div class="f" style="background:var(--surface-2;padding:10px;border-radius:8px">' + esc(c.formula) + '</div>' +
            '<div class="ai-panel mt"><div class="ai-head">✦ 结论精讲</div><div class="md-body" id="cl-ai">正在组织…</div></div>');
          A.aiInto(spec, el('cl-ai'), { scene: 'conclusion', subject: c.subject }).catch(function () {});
        };
      });
    }
  });

  /* ==================== 人教版教材 ==================== */
  A.view('textbooks', async function (p) {
    var subject = p[0] || 'all';
    var all = S.textbooks(subject);
    var html = A.pageHead('全套人教版高中教材', '最新人教版电子课本，走开源直链/本机文件，不进云存储、不耗下载流量点数。',
      '<button class="btn" id="tb-export">导出清单</button>');
    html += A.subjectTabs(subject, 'textbooks');
    html += '<div class="card pad-s mb"><h3>取证与边界</h3><p class="small muted" style="line-height:1.9">' +
      '教材清单来自开源仓库 <b>TapXWorld/ChinaTextbook</b>（人教版 PDF 全套）与 <b>iiiiqt/HighSchoolTextbooks</b>。' +
      '本站不托管 PDF 副本：点击「打开」走 fastly.jsdelivr 镜像直链，旁边的「备用镜像」走 ghproxy 转发 raw.githubusercontent（本机实测可达）。' +
      '两个链接都打不开时，可在「笔记与提纲」里绑定本机教材目录。' +
      '这样即使将来上云，教材也不会产生云存储常驻费与 CDN 流量费。' +
      '清单里的仓库路径已从 Git Trees API 核实存在，但 PDF 体积大未逐本在线校验，故标注「直链待校验」。</p></div>';
    var groups = {};
    all.forEach(function (b) { (groups[b.subject] = groups[b.subject] || []).push(b); });
    html += Object.keys(groups).map(function (sid) {
      var s = SMAP[sid] || { name: sid, color: 'var(--primary)' };
      return '<div class="card mb"><h3 style="color:' + s.color + '">' + s.name + '（' + groups[sid].length + ' 册）</h3>' +
        '<div class="grid g3">' + groups[sid].map(function (b) {
          return '<div class="card pad-s" style="box-shadow:none"><div class="strong small">' + esc(b.title) + '</div>' +
            '<div class="small muted mt">' + esc(b.grade || '') + ' · ' + esc(b.volume || '') + '</div>' +
            '<div class="tiny muted mt">' + esc(String(b.source || '').slice(0, 40)) + '</div>' +
            '<div class="row mt">' + (b.url
              ? '<a class="btn sm primary" href="' + esc(b.url) + '" target="_blank" rel="noopener">打开教材 ↗</a>' +
                (mirrorUrl(b.url) ? '<a class="btn sm ghost" href="' + esc(mirrorUrl(b.url)) + '" target="_blank" rel="noopener">备用镜像</a>' : '')
              : '<span class="chip warn">' + esc(b.note || '待接直链') + '</span>') + '</div></div>';
        }).join('') + '</div></div>';
    }).join('') || A.emptyBox('教材清单整理中', '');
    A.render(html);
    el('tb-export').onclick = function () {
      var out = ['# 中山一号 · 人教版高中教材清单', '', '导出：' + A.today(), ''];
      all.forEach(function (b) {
        out.push('- [' + sname(b.subject) + '] ' + b.title + (b.url ? ' → ' + b.url : ' （本机待登记）'));
      });
      A.download('中山一号-教材清单-' + A.today() + '.md', out.join('\n'), 'text/markdown;charset=utf-8');
      toast('清单已导出', 'ok');
    };
  });

  /* ==================== 云逛大学 ==================== */
  A.view('campus', async function () {
    var all = S.universities();
    var DIV = window.ZSDIV;
    var provCount = {};
    all.forEach(function (u) { provCount[u.province] = (provCount[u.province] || 0) + 1; });
    var provinces = DIV ? DIV.provinces() : Object.keys(provCount);
    var html = A.pageHead('云逛大学', '按省 → 市 → 区三级粗筛院校，收录院校基础信息；后面慢慢补校园图、专业分数线、学长经验。',
      '<span class="chip">省市区三级联动</span>');
    html += '<div class="card pad-s mb"><div class="row wrap">' +
      '<input type="text" id="cu-search" placeholder="搜校名 / 城市 / 类型…" style="max-width:240px">' +
      '<label class="field" style="margin:0;min-width:150px">省 / 直辖市<select id="cu-prov"><option value="">全部</option>' +
      provinces.map(function (x) {
        return '<option value="' + esc(x) + '">' + esc(x) + (provCount[x] ? ' · ' + provCount[x] + ' 所' : '（暂无收录）') + '</option>';
      }).join('') + '</select></label>' +
      '<label class="field" style="margin:0;min-width:130px">市<select id="cu-city"><option value="">全部</option></select></label>' +
      '<label class="field" style="margin:0;min-width:130px">区 / 县<select id="cu-dist"><option value="">全部</option></select></label>' +
      '<span class="spacer"></span><span class="small muted" id="cu-count">共 ' + all.length + ' 所</span></div>' +
      '<div class="row wrap mt"><span class="small" id="cu-path">当前范围：全国</span>' +
      '<button class="btn sm" id="cu-use-region">把该省设为题目默认适用范围</button></div>' +
      '<p class="small muted mt">' + esc(DIV ? DIV.note() : '省市区数据未加载，仅按高校库省份筛选。') +
      '　<span class="chip sm">' + esc(DIV ? DIV.version() : '—') + '</span></p></div>';
    html += '<div id="cu-list" class="grid g3">' + uniCards(all) + '</div>';
    html += '<div class="card mt"><h3>这个栏目后面会补什么</h3><p class="small muted">' +
      '校园实景与专业介绍、广西历年录取位次、选科要求对照（3+1+2）、志愿填报时间轴、学长学姐笔记。' +
      '内容以官方招生章程与考试院公布数据为准，本站不编造分数线。</p></div>';
    A.render(html);
    function uniCards(list) {
      if (!list.length) return A.emptyBox('没有匹配的院校', '换个关键词试试');
      return list.map(function (u) {
        return '<div class="uni-card hover" data-cu="' + esc(u.id) + '"><div class="u-name">' + esc(u.name) + '</div>' +
          '<div class="u-tags"><span class="chip blue">' + esc(u.province) + ' · ' + esc(u.city || '') + '</span> ' +
          '<span class="chip">' + esc(u.type || '') + '</span>' +
          (u.level ? '<span class="chip orange">' + esc(u.level) + '</span>' : '') + '</div>' +
          '<p class="small muted" style="margin:6px 0 0">' + esc(u.intro || '') + '</p></div>';
      }).join('');
    }
    function bind() {
      $$('[data-cu]').forEach(function (n) {
        n.onclick = function () {
          var u = all.find(function (x) { return x.id === n.dataset.cu; }); if (!u) return;
          A.modal(u.name, '<div class="row mb"><span class="chip blue">' + esc(u.province) + ' · ' + esc(u.city || '') + '</span>' +
            '<span class="chip">' + esc(u.type || '') + '</span><span class="chip orange">' + esc(u.level || '') + '</span></div>' +
            '<p>' + esc(u.intro || '') + '</p>' +
            (u.site ? '<p class="small">官网：<a href="https://' + esc(u.site) + '" target="_blank" rel="noopener">' + esc(u.site) + ' ↗</a></p>' : '') +
            '<div class="divider"></div><p class="small muted">栏目内容持续丰富中：专业、选科要求、录取位次、校园实景待补。' +
            '信息以学校官方招生章程和广西招生考试院公布为准。</p>');
        };
      });
    }
    /* 市：合并字典市 + 高校库里真实出现的市，避免字典没列就漏筛 */
    function fillCity() {
      var pv = el('cu-prov').value, cities = [];
      if (pv && DIV) DIV.cities(pv).forEach(function (c) { if (cities.indexOf(c) < 0) cities.push(c); });
      all.forEach(function (u) {
        if ((!pv || u.province === pv) && u.city && cities.indexOf(u.city) < 0) cities.push(u.city);
      });
      el('cu-city').innerHTML = '<option value="">全部</option>' + cities.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      }).join('');
      fillDist();
    }
    /* 区县：仅作地区参考，高校库无 district 字段，不参与过滤 */
    function fillDist() {
      var pv = el('cu-prov').value, ct = el('cu-city').value;
      var ds = (DIV && pv && ct) ? DIV.districts(pv, ct) : [];
      el('cu-dist').innerHTML = '<option value="">全部</option>' + ds.map(function (d) {
        return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
      }).join('');
    }
    function refresh() {
      var k = el('cu-search').value.trim().toLowerCase();
      var pv = el('cu-prov').value, ct = el('cu-city').value, dt = el('cu-dist').value;
      var list = all.filter(function (u) {
        return (!pv || u.province === pv) && (!ct || u.city === ct) &&
          (!k || [u.name, u.city, u.type, u.level, u.intro].join('').toLowerCase().indexOf(k) >= 0);
      });
      el('cu-list').innerHTML = uniCards(list);
      el('cu-count').textContent = '共 ' + list.length + ' 所';
      var parts = [pv, ct, dt].filter(Boolean);
      var path = parts.length ? parts.join(' / ') : '全国';
      el('cu-path').innerHTML = '当前范围：<b>' + esc(path) + '</b>' +
        (dt ? '　<span class="small muted">区县级仅作参考，高校库只到市级，不参与过滤</span>' : '') +
        '　<span class="small muted">题目默认适用范围：' + esc(state.region) + '</span>';
      bind();
    }
    el('cu-search').oninput = refresh;
    el('cu-prov').onchange = function () { fillCity(); refresh(); };
    el('cu-city').onchange = function () { fillDist(); refresh(); };
    el('cu-dist').onchange = refresh;
    el('cu-use-region').onclick = function () {
      var pv = el('cu-prov').value;
      if (!pv) { toast('先选一个省 / 直辖市', 'err'); return; }
      state.region = pv;
      toast('已设为 ' + pv + '：闯关 / 整卷 / 每日一练按此优先筛题，题库无该省标签时自动退回全量', 'ok');
      refresh();
    };
    fillCity();
    refresh();
  });

  /* ==================== 账号与本机路径 ==================== */
  A.view('account', async function () {
    var u = state.user;
    var localPath = await B.file.localPath();
    var html = A.pageHead('账号与本机路径', '每个账号的数据互相隔离；本机路径对应 E:\\中山一号\\accounts\\<账号>。');
    html += '<div class="grid g2"><div class="card"><h3>当前账号</h3>' +
      (u ? '<table class="tbl"><tr><th>账号</th><td>' + esc(u.account) + '</td></tr>' +
        '<tr><th>昵称</th><td>' + esc(u.name) + '</td></tr>' +
        '<tr><th>角色</th><td>' + (u.role === 'admin' ? '<span class="chip orange">管理员</span>' : '<span class="chip blue">学生</span>') + '</td></tr>' +
        '<tr><th>注册时间</th><td>' + A.fmtDate(u.createdAt) + '</td></tr>' +
        '<tr><th>数据模式</th><td>' + (state.mode === 'cloud' ? 'WorkBuddy 云' : '本机浏览器（不上传）') + '</td></tr>' +
        '<tr><th>存储引擎</th><td>' + (state.storage === 'idb' ? 'IndexedDB（完整持久化）'
          : state.storage === 'ls' ? '本机轻量存储（IndexedDB 不可用时的自动降级，答题记录仍持久化；上传的笔记刷新后不保留）'
          : '云端') + '</td></tr>' +
        '<tr><th>本机路径</th><td class="mono small">' + esc(localPath || '未登记') + '</td></tr></table>'
        : '<p class="muted">当前是游客模式，答题记录单独存放，不与任何账号绑定。</p>' +
          '<button class="btn primary mt" id="ac-login">登录 / 注册</button>') +
      '<div class="row mt"><button class="btn" id="ac-bind">绑定 / 更换本机目录</button>' +
      (u ? '<button class="btn ghost" id="ac-logout">退出登录</button>' : '') + '</div></div>' +
      '<div class="card"><h3>数据说明</h3><p class="small" style="line-height:1.9">' +
      (state.mode === 'cloud'
        ? '账号、答题记录、错题本、笔记元数据存在 WorkBuddy 云；教材与整卷 PDF 走开源直链，不进云存储。' +
          '云资源点用尽会暂停服务且期间无法导出，请定期在「学习记录」导出完整备份。'
        : '账号与全部学习数据只存在这台电脑的浏览器数据库（IndexedDB / localStorage），不上传任何服务器，0 云消耗。' +
          '换电脑或清浏览器数据前，请到「学习记录」导出 JSON 备份。') +
      '</p><div class="divider"></div><p class="small muted">隐私：本站不收集姓名、学号、班级、手机号；' +
      '公开部署时任何同学信息一律不入库。</p>' +
      '<div class="row mt"><a class="btn sm" href="#/records">去导出备份</a></div></div></div>';

    /* 管理员：账号列表 */
    if (u && u.role === 'admin') {
      var users = [];
      try { users = await B.auth.users(); } catch (e) {}
      html += '<div class="card mt"><div class="row between"><h3 style="margin:0">已注册账号（' + users.length + '）</h3>' +
        '<a class="btn sm primary" href="#/admin">去全站设置注册新账号</a></div>' +
        '<table class="tbl mt"><tr><th>账号</th><th>昵称</th><th>角色</th><th>本机对应路径</th><th>注册时间</th></tr>' +
        users.map(function (x) {
          return '<tr><td>' + esc(x.account) + '</td><td>' + esc(x.name) + '</td>' +
            '<td>' + (x.role === 'admin' ? '管理员' : '学生') + '</td>' +
            '<td class="mono small">' + esc(x.localDir || '') + '</td>' +
            '<td class="small muted">' + A.fmtDate(x.createdAt) + '</td></tr>';
        }).join('') + '</table></div>';
    }
    A.render(html);
    if (el('ac-login')) el('ac-login').onclick = A.showAuth;
    if (el('ac-logout')) el('ac-logout').onclick = async function () {
      await B.auth.signOut(); state.user = null; await G.load(); await A.refreshChrome();
      toast('已退出'); A.showAuth(); go('home');
    };
    el('ac-bind').onclick = async function () {
      var r = await B.file.bindLocalDir();
      toast(r.ok ? ('已绑定：' + r.label) : r.label, r.ok ? 'ok' : 'err');
    };
  });

  /* ==================== 管理员 · 全站设置 ==================== */
  A.view('admin', async function () {
    var isAdmin = await B.auth.isAdmin();
    if (!isAdmin) {
      A.render(A.pageHead('全站设置', '只有管理员能进这里。') + A.emptyBox('没有权限', '请用管理员账号登录后重试'));
      return;
    }
    var cfg = await B.llm.config();
    var users = [];
    try { users = await B.auth.users(); } catch (e) {}
    var maskedKey = cfg.key ? cfg.key.slice(0, 5) + '****' + cfg.key.slice(-4) : '';

    var html = A.pageHead('全站设置', '管理员配一次，全站所有登录账号共用；页面代码不用改。',
      '<span class="chip ' + (CFG.enabled ? 'green' : 'blue') + '">' + (CFG.enabled ? '云端模式' : '本地模式') + '</span>');
    html += '<div class="grid g2"><div class="card"><h3>大模型伴学（通道）</h3>' +
      '<p class="small muted">默认走<b>云端免费模型代理（B1）</b>：免费额度模型由云端代理统一转发，' +
      '服务商 Key 只存在服务端，前端一个都不放；<b>电脑、手机、外网访客都能用</b>，不需要本机开机。' +
      '代理还没部署时，自动回退本机免费网关 / 云端免密钥 / 内置离线教练，不白屏。' +
      '<br>💡 <b>要填其他服务商的 Key</b>（硅基流动 / OpenRouter / Groq / Gemini 兼容端点等）：' +
      '把下面通道切到「DeepSeek 直连」，展开的区块里有「多服务商 Key」预设区，多把 Key 并存、一键切换。</p>' +
      '<label class="field">通道<select id="ad-provider">' +
      '<option value="free"' + (cfg.provider === 'free' ? ' selected' : '') + '>云端免费模型代理（B1·推荐·零成本）</option>' +
      '<option value="ofm"' + (cfg.provider === 'ofm' ? ' selected' : '') + '>本机免费模型网关 ofm（只限本机）</option>' +
      '<option value="deepseek"' + (cfg.provider === 'deepseek' ? ' selected' : '') + '>DeepSeek 直连（不耗云资源点，需填 Key）</option>' +
      '<option value="cloud"' + (cfg.provider === 'cloud' ? ' selected' : '') + '>WorkBuddy 免密钥大模型（仅云端模式，耗资源点）</option>' +
      '</select></label>' +
      '<div id="ad-free-box" style="display:' + (cfg.provider === 'free' ? 'block' : 'none') + '">' +
        '<div class="row"><span id="ad-free-status" class="chip">探测中…</span>' +
        '<span class="small muted">服务商 Key 在代理服务端，前端不可见</span></div>' +
        '<label class="field">代理地址<input type="text" id="ad-free-url" value="' + esc(cfg.freeUrl || '') + '" placeholder="https://你的代理域名"></label>' +
        '<label class="field">访问令牌（可选，与代理端 FREE_LLM_TOKEN 一致）<input type="text" id="ad-free-token" value="' + esc(cfg.freeToken || '') + '" placeholder="留空表示不设令牌"></label>' +
        '<label class="field">默认模型<select id="ad-free-model"></select></label>' +
      '</div>' +
      '<div id="ad-ofm-box" style="display:' + (cfg.provider === 'ofm' ? 'block' : 'none') + '">' +
        '<div class="row"><span id="ad-ofm-status" class="chip">探测中…</span>' +
        '<span class="small muted">内置 Key 为本机 127.0.0.1 专属，出本机无效、不会泄露</span></div>' +
        '<label class="field">网关地址<input type="text" id="ad-ofm-base" value="' + esc(cfg.ofmBase || '') + '"></label>' +
        '<label class="field">默认模型<select id="ad-ofm-model"></select></label>' +
      '</div>' +
      '<div id="ad-ds-box" style="display:' + (cfg.provider === 'deepseek' ? 'block' : 'none') + '">' +
        '<div class="form-grid"><label class="field">模型<input type="text" id="ad-model" value="' + esc(cfg.model || 'deepseek-chat') + '"></label>' +
        '<label class="field">API 地址<input type="text" id="ad-base" value="' + esc(cfg.base || '') + '"></label></div>' +
        '<label class="field">DeepSeek Key ' + (maskedKey ? '（当前 ' + esc(maskedKey) + '，留空表示不改）' : '') +
        '<input type="password" id="ad-key" placeholder="' + (maskedKey ? '不修改就留空' : 'sk-...') + '"></label>' +
        '<label class="field">服务端代理地址（可选，上云公开时填，Key 留服务端）<input type="text" id="ad-proxy" value="' + esc(cfg.proxyUrl || '') + '" placeholder="https://你的云函数/chat"></label>' +
        '<div class="card pad-s mt" style="box-shadow:none;background:var(--surface-2)">' +
          '<h3 style="margin:0 0 6px">多服务商 Key（并存 · 一键切换）</h3>' +
          '<p class="small muted" style="line-height:1.8">这里可以填<b>任意 OpenAI 兼容服务</b>的 Key：DeepSeek、硅基流动、OpenRouter、Groq、Gemini 兼容端点等。' +
          '把上面的「API 地址 / 模型 / Key」填好，起个名字存成预设，以后下拉一键切回来，不用反复覆盖。' +
          '常用地址：DeepSeek <code>https://api.deepseek.com/v1</code> · 硅基流动 <code>https://api.siliconflow.cn/v1</code> · OpenRouter <code>https://openrouter.ai/api/v1</code>。</p>' +
          '<div class="row wrap mt"><label class="field" style="flex:1;min-width:180px">预设名称' +
          '<input type="text" id="ad-preset-name" placeholder="例：硅基流动备用"></label>' +
          '<label class="field" style="flex:1;min-width:200px">已有预设<select id="ad-preset"></select></label></div>' +
          '<div class="row wrap mt"><button class="btn sm" id="ad-preset-apply">应用预设到上方</button>' +
          '<button class="btn sm" id="ad-preset-save">把上方存为预设</button>' +
          '<button class="btn sm ghost" id="ad-preset-del">删除选中预设</button>' +
          '<span class="small muted" id="ad-preset-msg"></span></div>' +
          '<p class="small muted mt" style="line-height:1.8">⚠️ 这里填的 Key 存在<b>本浏览器的 localStorage</b>，只在这台电脑生效；' +
          '公开站上前端明文 Key 会被人按 F12 取走，正式公开请改用「服务端代理地址」把 Key 留服务端。' +
          '<b>B1 云端免费代理用的 OpenRouter Key 不在这里填</b>，它只在 <code>free-llm-proxy/config.json</code> 服务端。</p>' +
        '</div>' +
      '</div>' +
      '<div class="row"><button class="btn primary" id="ad-save">保存设置</button>' +
      '<button class="btn" id="ad-test">测试连接</button><span id="ad-test-msg" class="small muted"></span></div></div>' +

      '<div><div class="card mb"><h3>注册新账号</h3>' +
      (CFG.enabled
        ? '<p class="small muted">云端模式的账号走「邮箱 + 验证码 + 密码」，由平台 Auth 管理，管理员不能代建。' +
          '请让对方在登录页切到「注册」自行完成，注册后默认是学生角色。</p>'
        : '<p class="small muted">本地模式下管理员可直接代家人注册，注册后你仍保持管理员登录，不会被挤下线。</p>' +
          '<div class="form-grid"><label class="field">账号（建议邮箱）<input type="text" id="ad-account" placeholder="brother@example.com"></label>' +
          '<label class="field">昵称<input type="text" id="ad-name" placeholder="弟弟"></label></div>' +
          '<div class="form-grid"><label class="field">密码<input type="password" id="ad-secret" placeholder="至少 4 位"></label>' +
          '<label class="field">确认密码<input type="password" id="ad-secret2"></label></div>' +
          '<button class="btn primary" id="ad-reg">注册学生账号</button>') +
      '</div><div class="card"><h3>账号列表（' + users.length + '）</h3>' +
      '<table class="tbl"><tr><th>账号</th><th>昵称</th><th>角色</th></tr>' +
      users.map(function (x) { return '<tr><td class="small">' + esc(x.account) + '</td><td>' + esc(x.name) + '</td>' +
        '<td>' + (x.role === 'admin' ? '管理员' : '学生') + '</td></tr>'; }).join('') + '</table></div></div></div>';

    /* 云配置状态 + 切云 runbook 摘要 */
    html += '<div class="card mt"><h3>上云状态（当前未开通、未消耗）</h3>' +
      '<table class="tbl"><tr><th>项目</th><th>值</th><th>说明</th></tr>' +
      '<tr><td>云开关</td><td>' + (CFG.enabled ? '已开启' : '关闭') + '</td><td>data/cloud-config.js 的 enabled</td></tr>' +
      '<tr><td>endpoint</td><td class="mono small">' + (CFG.endpoint ? '已填' : '空') + '</td><td>来自 publicConfig</td></tr>' +
      '<tr><td>publishableKey</td><td>' + (CFG.publishableKey ? '已填' : '空') + '</td><td>来自 publicConfig</td></tr>' +
      '<tr><td>oauthRelayBaseUrl</td><td>' + (CFG.oauthRelayBaseUrl ? '已填' : '空') + '</td><td>web 端回调必需</td></tr>' +
      '<tr><td>SDK 镜像</td><td class="mono small">' + esc(CFG.sdkCdn) + '</td><td>国内可达</td></tr></table>' +
      '<div class="divider"></div><p class="small" style="line-height:1.9"><b>切云只需两步，页面与业务代码零改动：</b><br>' +
      '① 在 WorkBuddy 里为本站开通云服务，把 publicConfig 三个值填进 <span class="mono">data/cloud-config.js</span>，' +
      '<span class="mono">enabled</span> 改 true；<br>' +
      '② 按《切云 Runbook》建 3 张表（<span class="mono">zs_rows / profiles / admin_config</span>）与 RLS。<br>' +
      '本地阶段管理员填的 DeepSeek 配置会自动迁移上云，不用重填。' +
      '注册页的邮箱验证码分支、文件同步分支、云免密钥大模型分支都已预置在代码里，切过去即可用。</p></div>';

    /* 全站参数 */
    html += '<div class="card mt"><h3>全站学习参数</h3><div class="form-grid">' +
      '<label class="field">默认适用范围<input type="text" id="ad-region" value="' + esc(state.region) + '" placeholder="广西"></label>' +
      '<label class="field">每日一练默认题数<input type="number" id="ad-dailyn" min="3" max="20" value="' + (state.dailyN || 8) + '"></label>' +
      '</div><button class="btn primary" id="ad-param">保存参数</button>' +
      '<span class="small muted" style="margin-left:10px">每科关卡数与每关题数在 data/subjects.js 调整</span></div>';
    A.render(html);

    /* 多服务商 Key 预设：只存本机 localStorage，切换时把值填进上面的输入框，
       由「保存设置」统一写进 B.llm.setConfig —— 不改底层 LLM 链路。 */
    var PRESET_KEY = 'zs1.llm.presets.v1';
    function loadPresets() {
      try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]') || []; } catch (e) { return []; }
    }
    function savePresets(a) { localStorage.setItem(PRESET_KEY, JSON.stringify(a)); }
    function maskKey(k) { return k ? String(k).slice(0, 5) + '****' + String(k).slice(-4) : '（无 Key）'; }
    function drawPresets(selId) {
      var arr = loadPresets(), s = el('ad-preset');
      if (!s) return;
      s.innerHTML = arr.length ? arr.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === selId ? ' selected' : '') + '>' +
          esc(x.label) + ' · ' + esc(x.model || '') + ' · ' + esc(maskKey(x.key)) + '</option>';
      }).join('') : '<option value="">（还没有预设）</option>';
      el('ad-preset-msg').textContent = arr.length ? '共 ' + arr.length + ' 把 Key' : '';
    }
    drawPresets();
    el('ad-preset-apply').onclick = function () {
      var id = el('ad-preset').value;
      var x = loadPresets().find(function (v) { return v.id === id; });
      if (!x) { toast('请先存一个预设', 'err'); return; }
      el('ad-base').value = x.base || '';
      el('ad-model').value = x.model || '';
      if (x.key) el('ad-key').value = x.key;
      el('ad-preset-name').value = x.label || '';
      el('ad-preset-msg').textContent = '已填入「' + x.label + '」，点「保存设置」生效';
      toast('预设已填入，记得保存设置', 'ok');
    };
    el('ad-preset-save').onclick = function () {
      var name = el('ad-preset-name').value.trim();
      var base = el('ad-base').value.trim(), model = el('ad-model').value.trim();
      var key = el('ad-key').value.trim();
      if (!name) { toast('先给预设起个名字', 'err'); return; }
      var arr = loadPresets(), old = arr.find(function (v) { return v.label === name; });
      if (!key && old) key = old.key;
      var item = { id: old ? old.id : 'pk_' + Date.now(), label: name, base: base, model: model, key: key };
      if (old) arr[arr.indexOf(old)] = item; else arr.push(item);
      savePresets(arr); drawPresets(item.id);
      el('ad-preset-msg').textContent = '已保存「' + name + '」' + (key ? '（含 Key）' : '（未填 Key）');
      toast('预设已保存', 'ok');
    };
    el('ad-preset-del').onclick = function () {
      var id = el('ad-preset').value, arr = loadPresets();
      var x = arr.find(function (v) { return v.id === id; });
      if (!x) { toast('没有可删除的预设', 'err'); return; }
      if (!confirm('删除预设「' + x.label + '」？（只删本机这份记录，不影响已保存的当前配置）')) return;
      arr.splice(arr.indexOf(x), 1); savePresets(arr); drawPresets();
      toast('预设已删除', 'ok');
    };

    el('ad-save').onclick = async function () {
      var c = { provider: el('ad-provider').value };
      if (c.provider === 'free') {
        c.freeUrl = el('ad-free-url').value.trim();
        c.freeToken = el('ad-free-token').value.trim();
        c.freeModel = el('ad-free-model') ? el('ad-free-model').value : 'combo:auto-free';
      } else if (c.provider === 'ofm') {
        c.ofmBase = el('ad-ofm-base').value.trim();
        c.ofmModel = el('ad-ofm-model') ? el('ad-ofm-model').value : 'combo:auto-free';
      } else {
        c.model = el('ad-model').value.trim();
        c.base = el('ad-base').value.trim();
        c.proxyUrl = el('ad-proxy').value.trim();
        var k = el('ad-key').value.trim();
        if (k) c.key = k;
      }
      try { await B.llm.setConfig(c); toast('全站大模型设置已保存', 'ok'); go('admin'); }
      catch (e) { toast('保存失败：' + e.message, 'err'); }
    };
    el('ad-test').onclick = async function () {
      var m = el('ad-test-msg'); m.textContent = '正在测试…';
      try {
        var c2 = await B.llm.config();
        if (c2.provider === 'free') {
          var sf = await B.llm.status('free');
          if (!sf.online) throw new Error('云端免费模型代理未连通（检查代理地址与部署状态）');
        } else if (c2.provider === 'ofm') {
          var s = await B.llm.status('ofm');
          if (!s.online) throw new Error('本机免费模型网关离线（127.0.0.1:18900 未运行）');
        } else if (c2.provider !== 'cloud' && !c2.hasKey) {
          throw new Error('还没填 Key 或代理地址');
        }
        var t = await A.aiChat(P.companion({ subject: 'math', message: '只回复两个字：正常' }), { scene: 'companion' });
        m.textContent = '连接正常：' + String(t).slice(0, 30);
        toast('大模型连接正常', 'ok');
      } catch (e) { m.textContent = '失败：' + e.message; toast('测试失败', 'err'); }
    };

    /* 当前通道的模型下拉 + 在线状态 + 通道切换显隐 */
    function fillModelSelect(sel, ids, cur) {
      if (!sel) return;
      sel.innerHTML = ids.map(function (id) {
        return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc(id) + ' · 免费</option>';
      }).join('');
    }
    function refreshOfm() {
      B.llm.status('ofm').then(function (s) {
        var st = el('ad-ofm-status');
        if (!st) return;
        if (s.online) { st.textContent = '本机免费模型：在线'; st.className = 'chip green'; }
        else { st.textContent = '本机免费模型：离线'; st.className = 'chip warn'; }
        fillModelSelect(el('ad-ofm-model'), s.models || [B.llm.config().ofmModel], B.llm.config().ofmModel);
      }).catch(function () {});
    }
    function refreshFree() {
      B.llm.status('free').then(function (s) {
        var st = el('ad-free-status');
        if (!st) return;
        if (s.online) { st.textContent = '云端免费模型：在线'; st.className = 'chip green'; }
        else { st.textContent = '云端免费模型：未连通'; st.className = 'chip warn'; }
        var ids = (s.online && s.models && s.models.length)
          ? s.models : ((CFG.freeProxy && CFG.freeProxy.models) || ['combo:auto-free']);
        fillModelSelect(el('ad-free-model'), ids, B.llm.config().freeModel);
      }).catch(function () {});
    }
    if (cfg.provider === 'free') refreshFree();
    if (cfg.provider === 'ofm') refreshOfm();
    el('ad-provider').onchange = function () {
      var p = el('ad-provider').value;
      if (el('ad-free-box')) el('ad-free-box').style.display = (p === 'free') ? 'block' : 'none';
      if (el('ad-ofm-box')) el('ad-ofm-box').style.display = (p === 'ofm') ? 'block' : 'none';
      if (el('ad-ds-box')) el('ad-ds-box').style.display = (p === 'deepseek') ? 'block' : 'none';
      if (p === 'free') refreshFree();
      if (p === 'ofm') refreshOfm();
    };
    if (el('ad-reg')) el('ad-reg').onclick = async function () {
      var a = el('ad-account').value.trim(), n = el('ad-name').value.trim();
      var s1 = el('ad-secret').value, s2 = el('ad-secret2').value;
      if (!a || !s1) { toast('账号和密码不能为空', 'err'); return; }
      if (s1 !== s2) { toast('两次密码不一致', 'err'); return; }
      try { var u = await B.auth.signUp({ account: a, secret: s1, name: n }); toast('已注册：' + u.name, 'ok'); go('admin'); }
      catch (e) { toast('注册失败：' + e.message, 'err'); }
    };
    el('ad-param').onclick = function () {
      state.region = el('ad-region').value.trim() || '广西';
      state.dailyN = Math.max(3, Math.min(20, Number(el('ad-dailyn').value) || 8));
      toast('参数已保存（本次会话生效）', 'ok');
    };
  });

  /* ==================== 在线面批（上传图片识别 + 数据诊断） ==================== */
  A.view('mianpi', async function () {
    var cfg = await B.llm.config();
    var ready = await B.llm.isReady().catch(function () { return false; });
    var llmLabel = ready
      ? (cfg.provider === 'ofm' ? '本机免费模型已就绪'
         : cfg.provider === 'free' ? '云端免费模型已就绪' : '大模型已就绪')
      : (cfg.provider === 'ofm' ? '本机免费模型离线 · 离线教练兜底'
         : cfg.provider === 'free' ? '云端免费代理未连通 · 离线教练兜底' : '未配置 · 离线教练');
    var llmCls = ready ? 'green' : 'warn';
    var exams = (await S.all('exam_records')).slice().reverse();
    var recsAll = await S.all('study_records');

    var html = A.pageHead('在线面批', '把你的模考试卷或平时学习数据交给大模型，做一次专业的认知诊断与提分规划。支持上传试卷照片，由视觉模型自动识别科目、得分与逐题情况。',
      '<span class="chip ' + llmCls + '">' + llmLabel + '</span><a class="btn sm" href="#/admin">去设置</a>');

    html += '<div class="card pad-s mb"><div class="row"><label class="field" style="flex:1">面批范围' +
      '<select id="fp-mode"><option value="exam">一次模考试卷（本地记录）</option><option value="summary">汇总近期学习数据</option><option value="none">仅用上传的试卷照片</option></select></label>' +
      '<label class="field" style="flex:1">备考目标<select id="fp-goal">' +
      '<option value="">未填（按稳步提升）</option><option value="冲一本线">冲一本线</option>' +
      '<option value="冲双一流">冲双一流</option><option value="稳固本科">稳固本科</option>' +
      '<option value="消灭薄弱科">消灭薄弱科</option></select></label>' +
      '<label class="field" style="flex:1">距大考<select id="fp-weeks">' +
      '<option value="">未填</option><option value="2">约 2 周</option><option value="4">约 4 周</option>' +
      '<option value="8">约 8 周</option><option value="12">约 12 周</option></select></label></div>' +
      '<div id="fp-exam-box" class="mt"><label class="field">选择模考记录<select id="fp-exam">' +
      (exams.length ? exams.map(function (r) {
        return '<option value="' + esc(r.id) + '">' + esc(String(r.title || '模拟卷').slice(0, 24)) + ' · ' +
          sname(r.subject) + ' · ' + r.score + '/' + r.total + ' · ' + A.fmtDate(r.at) + '</option>';
      }).join('') : '<option value="">（还没有模考记录，先去「在线模考」考一次）</option>') +
      '</select></label></div>' +
      '<div id="fp-sum-box" class="mt" style="display:none"><div class="row">' +
      '<label class="field" style="flex:1">科目<select id="fp-subject"><option value="all">全科</option>' +
      SUBJECTS.map(function (s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="field" style="flex:1">时间范围<select id="fp-range">' +
      '<option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="all">全部</option>' +
      '</select></label></div>' +
      (recsAll.length ? '' : '<p class="small muted mt">提示：当前还没有平时答题记录，诊断信息会偏少，建议先在「闯关刷题」产生数据，或用模考模式。</p>') +
      '</div>' +
      '<div class="card pad-s mb"><label class="field">上传试卷照片（可多张，自动识别科目 / 得分 / 逐题）' +
      '<input type="file" id="fp-images" accept="image/*" multiple></label>' +
      '<div id="fp-previews" class="row wrap mt"></div>' +
      '<p class="small muted">图片只在你本机浏览器里做识别与分析，不会上传到任何外部服务器。</p></div>' +
      '<div class="mt"><label class="field">补充粘贴（可选）：把某次试卷、答题情况、或最想解决的困惑粘进来' +
      '<textarea id="fp-extra" style="min-height:90px" placeholder="例：上周月考导数大题完全不会；立体几何建系总漏条件…"></textarea></label>' +
      '<div class="row mt"><button class="btn primary" id="fp-go">开始面批</button>' +
      '<span class="small muted" id="fp-tip">数据只在本机分析，不会上传。</span></div></div>';

    html += '<div class="ai-panel mb"><div class="ai-head">✦ 面批报告' +
      '<span class="spacer"></span><button class="btn sm ghost" id="fp-dl" disabled>导出 Markdown</button></div>' +
      '<div class="md-body" id="fp-ai">选择上方范围或上传试卷照片，点「开始面批」，大模型会基于你的真实数据给出诊断与计划。</div></div>';

    var reports = (await S.all('face_reports')).slice().reverse().slice(0, 6);
    html += '<div class="card"><h3>历史面批报告</h3>' +
      (reports.length ? reports.map(function (o) {
        return '<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line)">' +
          '<span>' + esc(o.title) + '</span><span class="row">' +
          '<button class="btn sm ghost" data-fv="' + esc(o.id) + '">查看</button>' +
          '<button class="btn sm ghost" data-fx="' + esc(o.id) + '">导出</button>' +
          '<button class="btn sm ghost" data-fd="' + esc(o.id) + '">删除</button></span></div>';
      }).join('') : '<p class="small muted">还没有面批报告。</p>') + '</div>';
    A.render(html);

    el('fp-mode').onchange = function () {
      var m = el('fp-mode').value;
      el('fp-exam-box').style.display = (m === 'exam') ? 'block' : 'none';
      el('fp-sum-box').style.display = (m === 'summary') ? 'block' : 'none';
    };

    /* 图片预览（压缩到合理尺寸，避免 IndexedDB 爆掉） */
    var imageData = [];
    el('fp-images').onchange = function () {
      var files = el('fp-images').files;
      Array.prototype.forEach.call(files, function (f) {
        fileToDataURL(f, 1280, 0.82).then(function (d) {
          imageData.push(d);
          var img = document.createElement('img');
          img.src = d; img.style.cssText = 'width:90px;height:120px;object-fit:cover;border-radius:8px;margin:4px';
          img.title = f.name;
          el('fp-previews').appendChild(img);
        }).catch(function () {});
      });
    };

    var lastFull = '';
    el('fp-go').onclick = async function () {
      var mode = el('fp-mode').value, subject = 'all', examText = '', studyText = '', scanText = '';
      if (mode === 'exam') {
        var e = await buildExamText(el('fp-exam').value);
        if (!e) { toast('请先选一份模考记录', 'err'); return; }
        subject = e.subject; examText = e.text;
      } else if (mode === 'summary') {
        var s = await buildStudyText(el('fp-subject').value, el('fp-range').value);
        subject = s.subject; studyText = s.text;
      } else if (!imageData.length) {
        toast('请上传试卷照片，或切换面批范围', 'err'); return;
      }
      var box = el('fp-ai');
      box.className = 'md-body'; box.dataset.mdDone = ''; box.textContent = '';
      var full = '';
      function append(t) {
        full += t; box.textContent = full; box.scrollTop = box.scrollHeight;
        if (box.parentElement) box.parentElement.scrollTop = box.parentElement.scrollHeight;
      }
      el('fp-tip').textContent = '诊断中…';
      try {
        if (imageData.length) {
          el('fp-tip').textContent = '正在识别试卷图片…';
          append('## 一、试卷识别（图像识别中…）\n\n');
          scanText = await A.aiChat(P.paperScan({}), { images: imageData, onDelta: append });
          if (mode === 'none') subject = detectSubject(scanText);
          append('\n\n## 二、面批诊断与提分规划（分析中…）\n\n');
        }
        var spec = P.faceReview({ subject: subject, mode: (mode === 'none' ? 'image' : mode),
          examText: examText, studyText: studyText, scanText: scanText,
          goal: el('fp-goal').value, weeks: el('fp-weeks').value, extra: el('fp-extra').value.trim() });
        await A.aiChat(spec, { onDelta: append });
        box.innerHTML = A.md2html(full); A.renderMath(box); box.dataset.mdDone = '1';
        lastFull = full; el('fp-dl').disabled = false;
        var u = state.user || { name: '游客', account: 'guest' };
        await S.put('face_submits', { id: 'fs_' + Date.now(), at: new Date().toISOString(),
          subject: subject, submitter: { name: u.name, account: u.account, role: (u.role || 'student') },
          goal: el('fp-goal').value, weeks: el('fp-weeks').value,
          images: imageData.slice(), scanText: scanText, examText: examText, studyText: studyText, report: lastFull });
        await S.put('face_reports', { id: 'f_' + Date.now(), title: '面批 · ' +
          sname(subject) + ' · ' + A.today(), subject: subject, mode: mode, content: lastFull, at: new Date().toISOString() });
        el('fp-tip').textContent = '面批完成，已存档。';
        toast('面批完成，已存档', 'ok');
      } catch (e2) {
        append('\n\n> 面批中断：' + e2.message);
        el('fp-tip').textContent = '面批失败：' + e2.message;
      }
    };
    el('fp-dl').onclick = function () { if (lastFull) A.download('中山一号-面批报告-' + A.today() + '.md', lastFull, 'text/markdown;charset=utf-8'); };
    $$('[data-fv]').forEach(function (n) {
      n.onclick = async function () { var o = await S.get('face_reports', n.dataset.fv); if (o) { A.modal(o.title, '<div class="md-body">' + esc(o.content) + '</div>'); A.enhance(el('modal-body')); } };
    });
    $$('[data-fx]').forEach(function (n) {
      n.onclick = async function () { var o = await S.get('face_reports', n.dataset.fx); if (o) A.download(sanitize(o.title) + '.md', o.content, 'text/markdown;charset=utf-8'); };
    });
    $$('[data-fd]').forEach(function (n) {
      n.onclick = async function () { await S.remove('face_reports', n.dataset.fd); go('mianpi'); };
    });

    async function buildExamText(id) {
      var list = await S.all('exam_records');
      var r = list.find(function (x) { return x.id === id; }); if (!r) return null;
      var rate = r.total ? Math.round(r.score / r.total * 100) : 0;
      var lines = ['卷名：' + (r.title || '模拟卷'), '科目：' + sname(r.subject),
        '得分：' + r.score + '/' + r.total + '（' + rate + '%）', '用时：' + r.minutes + ' 分钟', '日期：' + A.fmtDate(r.at), '逐题：'];
      (r.detail || []).forEach(function (d) {
        lines.push('  第' + d.i + '题 答' + (d.ans || '空') + ' ' +
          (d.correct === null ? '主观自评' : d.correct ? '对' : '错') + ' 考点：' + (d.tags || []).join('、'));
      });
      return { subject: r.subject, text: lines.join('\n') };
    }
    function buildStudyText(subject, rangeDays) {
      return S.all('study_records').then(function (recs) {
        if (subject !== 'all') recs = recs.filter(function (r) { return r.subject === subject; });
        if (rangeDays && rangeDays !== 'all') {
          var cut = Date.now() - Number(rangeDays) * 86400000;
          recs = recs.filter(function (r) { return new Date(r.at).getTime() >= cut; });
        }
        var total = recs.length, ok = recs.filter(function (r) { return r.correct; }).length;
        var rate = total ? Math.round(ok / total * 100) : 0, tagStat = {};
        recs.forEach(function (r) { (r.tags || []).forEach(function (t) { tagStat[t] = tagStat[t] || { n: 0, ok: 0 }; tagStat[t].n++; if (r.correct) tagStat[t].ok++; }); });
        var byTag = Object.keys(tagStat).map(function (t) { return { t: t, n: tagStat[t].n, ok: tagStat[t].ok, err: tagStat[t].n - tagStat[t].ok }; })
          .filter(function (x) { return x.err >= 2; }).sort(function (a, b) { return b.err - a.err; }).slice(0, 12);
        var lines = ['范围：' + (subject === 'all' ? '全科' : sname(subject)) + ' 最近' + (rangeDays === 'all' ? '全部' : rangeDays + '天'),
          '答题总数：' + total + '　正确率：' + rate + '%', '高频错点（错误≥2 次，按错误频次降序）：'];
        if (byTag.length) byTag.forEach(function (x) { lines.push('  ' + x.t + '：错 ' + x.err + ' / 答 ' + x.n + '（正确率 ' + Math.round(x.ok / x.n * 100) + '%）'); });
        else lines.push('  （暂无明显重复错点；若平时答题记录未带知识点标签，建议改用「一次模考试卷」模式，诊断更准）');
        return { subject: subject, text: lines.join('\n') };
      });
    }
    /* 从识别文本粗判科目，供面批定位 */
    function detectSubject(text) {
      var map = { chinese: /语文|作文|古诗|文言文|论述类|文学类/, math: /数学|函数|导数|立体几何|解析几何|数列/,
        english: /英语|reading|grammar|cloze|完形|七选五|reading comprehension/i,
        physics: /物理|牛顿|电场|磁场|动量|圆周运动/, chemistry: /化学|化学平衡|有机|离子|反应原理/,
        politics: /政治|经济|法治|哲学|中国特色社会主义|逻辑与思维/ };
      for (var k in map) if (map[k].test(text || '')) return k;
      return 'all';
    }
  });

  /* ==================== 面批后台 · 教师审阅台（仅管理员） ==================== */
  A.view('mianpi-admin', async function () {
    if (!(await B.auth.isAdmin())) {
      A.render(A.pageHead('面批后台', '只有管理员能进这里。') + A.emptyBox('没有权限', '请用管理员账号登录后重试'));
      return;
    }
    var list = (await S.adminAll('face_submits')).slice().sort(function (a, b) {
      return new Date(b.at) - new Date(a.at);
    });
    var html = A.pageHead('面批后台 · 教师审阅台', '查看全班 / 全站提交的面批试卷照片与 AI 诊断报告。仅管理员可见。',
      '<a class="btn sm" href="#/mianpi">去面批</a>');
    html += '<div class="card pad-s mb small muted">共 ' + list.length + ' 份提交。图片与报告均存储在本机数据库，不上传任何外部服务器。</div>';
    if (!list.length) html += A.emptyBox('还没有面批提交', '学生在「在线面批」上传试卷照片并提交后，会显示在这里');
    else {
      html += '<div class="grid g2">' + list.map(function (o) {
        var thumb = (o.images && o.images[0])
          ? '<img src="' + esc(o.images[0]) + '" style="width:100%;height:130px;object-fit:cover;border-radius:8px">'
          : '<div class="empty" style="height:130px">无图片</div>';
        return '<div class="card pad-s"><div class="row between"><b>' + esc((o.submitter && o.submitter.name) || '匿名') +
          '</b><span class="chip">' + sname(o.subject) + '</span></div>' +
          '<div class="small muted">' + A.fmtTime(o.at) + '</div>' + thumb +
          '<div class="row mt"><button class="btn sm" data-v="' + esc(o.id) + '">查看</button>' +
          '<button class="btn sm ghost" data-d="' + esc(o.id) + '">删除</button></div></div>';
      }).join('') + '</div>';
    }
    A.render(html);
    $$('[data-v]').forEach(function (n) {
      n.onclick = async function () {
        var o = list.find(function (x) { return x.id === n.dataset.v; }); if (!o) return;
        var imgs = (o.images || []).map(function (s) { return '<img src="' + esc(s) + '" style="max-width:100%;border-radius:8px;margin:6px 0">'; }).join('');
        A.modal('面批提交 · ' + esc((o.submitter && o.submitter.name) || '匿名'),
          '<div class="small muted">' + sname(o.subject) + ' · ' + A.fmtTime(o.at) + '</div>' +
          (imgs ? '<div class="mt">' + imgs + '</div>' : '') +
          (o.scanText ? '<h3 class="mt">识别结果</h3><div class="md-body">' + A.md2html(o.scanText) + '</div>' : '') +
          '<h3 class="mt">面批报告</h3><div class="md-body">' + esc(o.report || '') + '</div>');
        A.enhance(el('modal-body'));
      };
    });
    $$('[data-d]').forEach(function (n) {
      n.onclick = async function () {
        if (confirm('确认删除这份提交？（图片与报告将一并删除）')) { await S.remove('face_submits', n.dataset.d); go('mianpi-admin'); }
      };
    });
  });

  /* ==================== 教师端：看学生记录 + 点评（仅管理员） ==================== */
  /* 数据边界：本地模式下所有账号的记录都在「同一个浏览器」里按 owner 隔离，
     S.adminAll 绕过 owner 读全班 —— 前提是学生在同一台电脑、同一个浏览器登录过。
     跨设备看全班记录必须开通云服务并给教师配 RLS（当前 enabled:false 未开通）。 */
  A.view('teacher', async function (p) {
    if (!(await B.auth.isAdmin())) {
      A.render(A.pageHead('教师端', '只有管理员能进这里。') + A.emptyBox('没有权限', '请用管理员账号登录后重试'));
      return;
    }
    var users = [];
    try { users = await B.auth.users(); } catch (e) { users = []; }
    var students = users.filter(function (u) { return u.role !== 'admin'; });
    var sid = (p && p[0]) || (students[0] && students[0].id) || '';
    var stu = students.find(function (u) { return u.id === sid; }) || null;

    var allRecs = [], allExams = [], allWrongs = [], allFaces = [], allComments = [];
    try {
      allRecs = await S.adminAll('study_records');
      allExams = await S.adminAll('exam_records');
      allWrongs = await S.adminAll('wrong_book');
      allFaces = await S.adminAll('face_submits');
      allComments = await S.adminAll('teacher_comments');
    } catch (e) {
      A.render(A.pageHead('教师端', '读取全班数据失败。') + A.emptyBox('读取失败', e.message));
      return;
    }
    var pick = function (arr) { return sid ? arr.filter(function (r) { return r.owner === sid; }) : []; };
    var recs = pick(allRecs).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var exams = pick(allExams).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var wrongs = pick(allWrongs).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var faces = pick(allFaces).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var comments = allComments.filter(function (c) { return c.targetUser === sid || c.owner === sid; })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

    var total = recs.length, ok = recs.filter(function (r) { return r.correct === true; }).length;
    var rate = total ? Math.round(ok / total * 100) + '%' : '—';
    var pending = wrongs.filter(function (w) { return !w.mastered; }).length;
    var last = recs[0] ? A.fmtTime(recs[0].at) : '暂无记录';
    var subjStat = {};
    recs.forEach(function (r) {
      var k = r.subject || 'other';
      subjStat[k] = subjStat[k] || { n: 0, ok: 0 };
      subjStat[k].n++; if (r.correct === true) subjStat[k].ok++;
    });

    var html = A.pageHead('教师端', '查看每个学生的学习记录、模考与错题，写点评；学生在自己的「学习记录」页能看到点评。',
      '<span class="chip blue">仅管理员可见</span><a class="btn sm" href="#/admin">全站设置</a>');
    html += '<div class="card pad-s mb"><div class="row wrap">' +
      '<label class="field" style="flex:1;min-width:220px">选择学生<select id="tc-stu">' +
      (students.length ? students.map(function (u) {
        return '<option value="' + esc(u.id) + '"' + (u.id === sid ? ' selected' : '') + '>' +
          esc(u.name) + '（' + esc(u.account) + '）</option>';
      }).join('') : '<option value="">（还没有学生账号）</option>') + '</select></label>' +
      '<span class="small muted">共 ' + students.length + ' 个学生账号 · 数据截止本次读取</span></div>' +
      '<p class="small muted mt" style="line-height:1.8">⚠️ <b>数据范围</b>：本地模式下记录只存在各自登录时用的那个浏览器里，' +
      '这里能看到的是<b>在这台电脑、这个浏览器登录过</b>的学生记录；学生用自己手机 / 电脑产生的数据不在这台机器上。' +
      '要让全班跨设备汇总，需开通云服务并给教师端配好 RLS（见《切云 Runbook》）。' +
      '云端免费代理 B1 只转发 AI 对话，<b>不同步学习记录</b>。</p></div>';

    if (!students.length) {
      html += A.emptyBox('还没有学生账号', '到「全站设置 → 注册新账号」建一个学生账号，对方在这台浏览器登录后开始记录');
      A.render(html);
      el('tc-stu').onchange = function () { go('teacher/' + el('tc-stu').value); };
      return;
    }

    html += '<div class="grid g4 mb">' +
      stat2(total, '累计答题') + stat2(rate, '总正确率') +
      stat2(exams.length, '模考次数') + stat2(pending + ' / ' + wrongs.length, '待消灭 / 总错题') + '</div>';
    html += '<div class="grid g3 mb">' +
      stat2(faces.length, '面批提交') + stat2(comments.length, '已收点评') + stat2(last, '最近活跃') + '</div>';

    /* 分科表现 */
    var sKeys = Object.keys(subjStat);
    html += '<div class="card mb"><h3>分科表现</h3>' +
      (sKeys.length ? '<table class="tbl"><tr><th>科目</th><th>答题</th><th>答对</th><th>正确率</th></tr>' +
        sKeys.map(function (k) {
          var s = subjStat[k];
          return '<tr><td>' + sname(k) + '</td><td>' + s.n + '</td><td>' + s.ok + '</td><td>' +
            Math.round(s.ok / s.n * 100) + '%</td></tr>';
        }).join('') + '</table>' : '<p class="small muted">还没有答题记录。</p>') + '</div>';

    /* 点评 */
    html += '<div class="card mb"><h3>写点评 · ' + esc(stu ? stu.name : '') + '</h3>' +
      '<div class="row wrap"><label class="field" style="min-width:150px">科目<select id="tc-subj">' +
      '<option value="all">全科 / 综合</option>' +
      SUBJECTS.map(function (s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('') +
      '</select></label><span class="spacer"></span>' +
      '<button class="btn sm" id="tc-ai">AI 生成点评草稿</button></div>' +
      '<label class="field mt">点评内容<textarea id="tc-text" style="min-height:110px" ' +
      'placeholder="例：导数大题的分类讨论还缺一步，建议先把近三次错题按「求导→单调区间→极值」重做一遍…"></textarea></label>' +
      '<div class="row"><button class="btn primary" id="tc-save">发给该学生</button>' +
      '<span class="small muted" id="tc-msg">点评写进学生自己的数据区，学生登录后在「学习记录」页可见。</span></div>' +
      '<div class="divider"></div><h3>历史点评（' + comments.length + '）</h3>' +
      (comments.length ? comments.slice(0, 20).map(function (c) {
        return '<div class="card pad-s mb"><div class="row between"><span class="chip">' +
          (c.subject && c.subject !== 'all' ? sname(c.subject) : '综合') + '</span>' +
          '<span class="small muted">' + esc(A.fmtTime(c.at)) + ' · ' + esc(c.author || '管理员') + '</span></div>' +
          '<div class="mt" style="white-space:pre-wrap;line-height:1.8">' + esc(c.content || '') + '</div>' +
          '<div class="row mt"><button class="btn sm ghost" data-tcdel="' + esc(c.id) + '">删除</button></div></div>';
      }).join('') : '<p class="small muted">还没有点评。</p>') + '</div>';

    /* 学习记录明细 */
    html += '<div class="card mb"><h3>学习记录明细（最近 60 条 / 共 ' + recs.length + '）</h3>' +
      (recs.length ? '<table class="tbl"><tr><th>时间</th><th>科目</th><th>题目</th><th>结果</th><th>知识点</th></tr>' +
        recs.slice(0, 60).map(function (r) {
          return '<tr><td class="small">' + esc(A.fmtTime(r.at)) + '</td><td>' + sname(r.subject) + '</td>' +
            '<td class="small">' + esc(String(r.qid || r.source || '—').slice(0, 26)) + '</td>' +
            '<td>' + (r.correct === true ? '<span class="chip green">对</span>' :
              r.skipped ? '<span class="chip">跳过</span>' : '<span class="chip orange">错</span>') + '</td>' +
            '<td class="small">' + esc((r.tags || []).join('、') || '—') + '</td></tr>';
        }).join('') + '</table>' : A.emptyBox('暂无答题记录', '学生在这台浏览器刷题后会出现在这里')) + '</div>';

    /* 模考 + 错题 */
    html += '<div class="grid g2 mb"><div class="card"><h3>模考记录（' + exams.length + '）</h3>' +
      (exams.length ? '<table class="tbl"><tr><th>时间</th><th>卷名</th><th>科目</th><th>得分</th></tr>' +
        exams.slice(0, 20).map(function (e) {
          return '<tr><td class="small">' + esc(A.fmtDate(e.at)) + '</td><td class="small">' +
            esc(String(e.title || '模拟卷').slice(0, 20)) + '</td><td>' + sname(e.subject) + '</td><td>' +
            e.score + '/' + e.total + '</td></tr>';
        }).join('') + '</table>' : '<p class="small muted">还没有模考记录。</p>') + '</div>' +
      '<div class="card"><h3>错题本（待消灭 ' + pending + '）</h3>' +
      (wrongs.length ? '<table class="tbl"><tr><th>时间</th><th>科目</th><th>题号</th><th>状态</th></tr>' +
        wrongs.slice(0, 20).map(function (w) {
          return '<tr><td class="small">' + esc(A.fmtDate(w.at)) + '</td><td>' + sname(w.subject) + '</td>' +
            '<td class="small">' + esc(String(w.qid || '—').slice(0, 20)) + '</td><td>' +
            (w.mastered ? '<span class="chip green">已掌握</span>' : '<span class="chip orange">待消灭</span>') + '</td></tr>';
        }).join('') + '</table>' : '<p class="small muted">错题本是空的。</p>') + '</div></div>';

    /* 面批提交 */
    html += '<div class="card mb"><h3>面批提交（' + faces.length + '）</h3>' +
      (faces.length ? '<table class="tbl"><tr><th>时间</th><th>科目</th><th>目标</th><th>图片</th><th>报告</th></tr>' +
        faces.slice(0, 20).map(function (f) {
          return '<tr><td class="small">' + esc(A.fmtTime(f.at)) + '</td><td>' + sname(f.subject) + '</td>' +
            '<td class="small">' + esc(f.goal || '未填') + '</td><td>' + ((f.images || []).length) + ' 张</td>' +
            '<td><button class="btn sm" data-tcface="' + esc(f.id) + '">查看</button></td></tr>';
        }).join('') + '</table>' : '<p class="small muted">还没有面批提交。<a href="#/mianpi-admin">去面批审阅台 →</a></p>') + '</div>';
    A.render(html);

    el('tc-stu').onchange = function () { go('teacher/' + el('tc-stu').value); };
    el('tc-ai').onclick = async function () {
      var btn = el('tc-ai'), msg = el('tc-msg');
      btn.disabled = true; msg.textContent = '正在根据该生数据生成草稿…';
      var weak = Object.keys(subjStat).map(function (k) {
        return sname(k) + ' ' + subjStat[k].n + ' 题 / 正确率 ' + Math.round(subjStat[k].ok / subjStat[k].n * 100) + '%';
      }).join('；') || '暂无答题数据';
      var promptText = '你是班主任兼学科教练，请给这位学生写一段 150 字以内的学习点评，' +
        '先肯定具体做得好的地方，再点出 1–2 个最该改的问题，最后给一条明天就能执行的建议。' +
        '语气平实、不要空话套话、不要用「AI」「作为模型」这类措辞，不要加标题。\n' +
        '学生数据：累计答题 ' + total + ' 题，总正确率 ' + rate + '，模考 ' + exams.length + ' 次，' +
        '待消灭错题 ' + pending + ' 条，面批提交 ' + faces.length + ' 份。分科：' + weak + '。';
      try {
        var draft = await A.aiChat(P.companion({ subject: 'math', message: promptText }), {});
        el('tc-text').value = String(draft || '').trim();
        msg.textContent = '草稿已生成，可自行修改后再发送。';
      } catch (e) { msg.textContent = '草稿生成失败：' + e.message + '（可以手动写）'; }
      btn.disabled = false;
    };
    el('tc-save').onclick = async function () {
      var text = el('tc-text').value.trim(), msg = el('tc-msg');
      if (!text) { toast('点评内容不能为空', 'err'); return; }
      var me = state.user || { name: '管理员' };
      try {
        await S.putFor('teacher_comments', {
          id: 'tc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          at: new Date().toISOString(), targetUser: sid, targetName: stu ? stu.name : '',
          subject: el('tc-subj').value, content: text, author: me.name
        }, sid);
        toast('点评已发送给 ' + (stu ? stu.name : '学生'), 'ok');
        go('teacher/' + sid);
      } catch (e) {
        msg.textContent = '保存失败：' + e.message + (CFG.enabled ? '（云端需在 RLS 里放行教师写 teacher_comments）' : '');
        toast('点评保存失败', 'err');
      }
    };
    $$('[data-tcdel]').forEach(function (n) {
      n.onclick = async function () {
        if (!confirm('删除这条点评？学生端将不再显示。')) return;
        await S.adminRemove('teacher_comments', n.dataset.tcdel);
        go('teacher/' + sid);
      };
    });
    $$('[data-tcface]').forEach(function (n) {
      n.onclick = async function () {
        var f = faces.find(function (x) { return x.id === n.dataset.tcface; });
        if (!f) return;
        var imgs = (f.images || []).map(function (s) {
          return '<img src="' + esc(s) + '" style="max-width:100%;border-radius:8px;margin:6px 0">';
        }).join('');
        A.modal('面批提交 · ' + esc(stu ? stu.name : '学生'),
          '<div class="small muted">' + sname(f.subject) + ' · ' + A.fmtTime(f.at) + '</div>' +
          (imgs ? '<div class="mt">' + imgs + '</div>' : '') +
          '<h3 class="mt">面批报告</h3><div class="md-body">' + esc(f.report || '') + '</div>');
        A.enhance(el('modal-body'));
      };
    });

    function stat2(v, label) {
      return '<div class="card pad-s"><div style="font-size:22px;font-weight:700">' + esc(String(v)) +
        '</div><div class="small muted">' + esc(label) + '</div></div>';
    }
  });
})();
