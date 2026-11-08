/* =====================================================================
 * 中山一号 · 英语跟读 & 听力 模块（views-english.js）
 * 依赖（均由 app.js 暴露到 window.ZSApp）：
 *   A.pageHead / A.render / A.aiChat / A.tts / A.stopTts / A.ttsVoices
 *   A.speech / A.state / S.put / S.all / esc / toast / P.listenQuiz
 * 全部语音能力均走浏览器原生 API，无需联网；听力题生成走本地免费大模型。
 * ===================================================================== */
(function () {
  var A = window.ZSApp, S = window.ZSStore, P = window.ZS_PROMPTS;
  if (!A || !S) { console.warn('views-english: 依赖未就绪'); return; }
  var el = A.el, $$ = A.$$, esc = A.esc, toast = A.toast, state = A.state;

  /* ---------- 内置跟读句子库（高中常见，难度递增） ---------- */
  var READ_LIB = [
    { lv: '入门', t: 'Practice makes perfect.' },
    { lv: '入门', t: 'Where there is a will, there is a way.' },
    { lv: '基础', t: 'The early bird catches the worm.' },
    { lv: '基础', t: 'It is never too late to learn.' },
    { lv: '基础', t: 'Health is better than wealth.' },
    { lv: '进阶', t: 'Knowledge is power, but character is more important.' },
    { lv: '进阶', t: 'Although it was raining, we went out for a walk.' },
    { lv: '进阶', t: 'The teacher asked us to hand in our homework on time.' },
    { lv: '提高', t: 'Despite the heavy snow, the train arrived on schedule.' },
    { lv: '提高', t: 'Not only did he finish the work, but he also helped others.' },
    { lv: '提高', t: 'The more you read, the more you will understand about the world.' },
    { lv: '拔高', t: 'If I had known the truth earlier, I would have acted differently.' }
  ];

  /* ---------- 内置听力短文库（约 60-90 词） ---------- */
  var LISTEN_LIB = [
    { title: '校园日常', passage:
      'Tom is a senior high school student. Every morning, he gets up at six thirty and rides his bike to school. His first class begins at eight. He likes English best because his teacher makes the lessons interesting. After school, he usually plays basketball with his classmates for an hour. In the evening, he spends two hours reviewing what he learned during the day. He believes that steady effort leads to success.' },
    { title: '垃圾分类', passage:
      'Many cities are now encouraging people to sort their garbage. In our community, each family receives three bins: one for food waste, one for recyclables, and one for other trash. At first, some neighbors found it confusing, but after a few weeks, most people got used to it. Sorting waste not only reduces pollution but also helps save resources. Small changes in daily habits can make a big difference to the environment.' },
    { title: '运动与健康', passage:
      'Regular exercise is important for both the body and the mind. A study shows that students who exercise for thirty minutes a day sleep better and feel less stressed. You do not need a gym membership; a brisk walk, cycling, or dancing all count. The key is to choose an activity you enjoy so that you will keep doing it. Remember, a healthy lifestyle is built one small habit at a time.' },
    { title: '手机与学习', passage:
      'Smartphones have changed the way we learn. With a phone, a student can look up new words, watch educational videos, and join online study groups anytime. However, too much screen time may hurt both eyesight and focus. Experts suggest setting clear rules, such as no phones during meals or before sleep. Used wisely, technology becomes a powerful tool; used without control, it becomes a distraction.' }
  ];

  /* ---------- 小工具 ---------- */
  function normWords(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  }
  function scoreRead(orig, said) {
    var ow = normWords(orig), sw = normWords(said);
    var counts = {};
    sw.forEach(function (w) { counts[w] = (counts[w] || 0) + 1; });
    var hit = 0, miss = [];
    ow.forEach(function (w) {
      if (counts[w] > 0) { counts[w]--; hit++; } else { miss.push(w); }
    });
    var score = ow.length ? Math.round(hit / ow.length * 100) : 0;
    return { score: score, hit: hit, total: ow.length, miss: miss };
  }
  function highlightRead(orig, said) {
    var ow = normWords(orig);
    var counts = {};
    normWords(said).forEach(function (w) { counts[w] = (counts[w] || 0) + 1; });
    return ow.map(function (w) {
      if (counts[w] > 0) { counts[w]--; return '<span style="color:#1a7f37;font-weight:600">' + esc(w) + '</span>'; }
      return '<span style="color:#c0392b;text-decoration:line-through">' + esc(w) + '</span>';
    }).join(' ');
  }
  function parseListen(text) {
    var items = [];
    var parts = text.split(/###\s*第\s*\d+\s*题/);
    parts.slice(1).forEach(function (b) {
      var stemM = b.match(/题干[:：]\s*([\s\S]*?)(?=\n\s*A[\.、])/);
      if (!stemM) return;
      var opts = {};
      ['A', 'B', 'C', 'D'].forEach(function (k) {
        var m = b.match(new RegExp(k + '[\\.、]\\s*([^\n]*)'));
        if (m) opts[k] = m[1].trim();
      });
      var ansM = b.match(/答案[:：]\s*([A-D])/);
      var expM = b.match(/解析[:：]\s*([\s\S]*?)(?=\n###|$)/);
      items.push({ stem: stemM[1].trim(), opts: opts, ans: ansM ? ansM[1] : '', exp: expM ? expM[1].trim() : '' });
    });
    return items;
  }

  /* ==================== 主视图：跟读 / 听力 两个子页 ==================== */
  A.view('english', async function () {
    var html = A.pageHead('英语跟读 · 听力', '跟读练发音、听力练理解，全部用浏览器原生语音，离线也能用；听力理解题由本机免费大模型生成。',
      '<span class="chip">本地语音引擎</span>');

    html += '<div class="tagbar" id="en-tabs">' +
      '<a class="chip sel" data-tab="read" href="javascript:;">跟读训练</a>' +
      '<a class="chip" data-tab="listen" href="javascript:;">听力理解</a></div>';

    html += '<div id="en-body"></div>';
    A.render(html);

    $$('#en-tabs .chip').forEach(function (c) {
      c.onclick = function () {
        $$('#en-tabs .chip').forEach(function (x) { x.classList.remove('sel'); });
        c.classList.add('sel');
        (c.dataset.tab === 'listen') ? renderListen() : renderRead();
      };
    });

    renderRead();   // 默认展示跟读

    /* ---------------- 跟读子页 ---------------- */
    function renderRead() {
      var opts = READ_LIB.map(function (s, i) {
        return '<option value="' + i + '">[' + s.lv + '] ' + esc(s.t) + '</option>';
      }).join('');
      var h = '<div class="card pad-s mb">' +
        '<div class="row"><label class="field" style="flex:1">选一句（可改）' +
        '<select id="rd-pick">' + opts + '</select></label>' +
        '<label class="field" style="width:150px">语速' +
        '<select id="rd-rate"><option value="0.7">慢速 0.7×</option>' +
        '<option value="0.95" selected>常速 0.95×</option>' +
        '<option value="1.1">快速 1.1×</option></select></label></div>' +
        '<label class="field">句子（可直接编辑 / 粘贴你想练的内容）' +
        '<textarea id="rd-text" style="min-height:64px">' + esc(READ_LIB[0].t) + '</textarea></label>' +
        '<div class="row mt">' +
        '<button class="btn primary" id="rd-play">🔊 听示范</button>' +
        '<button class="btn" id="rd-go">🎤 开始跟读</button>' +
        '<button class="btn ghost" id="rd-stop" disabled>停止</button>' +
        '<button class="btn ghost" id="rd-rand">随机一句</button>' +
        '</div>' +
        '<p class="small muted mt" id="rd-state">点「听示范」先听一遍，再点「开始跟读」对着麦克风读出来。</p>' +
        '</div>' +
        '<div class="card pad-s mb"><h3>对比结果</h3>' +
        '<div id="rd-orig" class="q-stem" style="line-height:2"></div>' +
        '<div class="row between mt"><span class="small muted">你的发音识别：</span>' +
        '<span id="rd-score" class="chip" style="display:none"></span></div>' +
        '<div id="rd-said" class="mt" style="color:#444"></div>' +
        '<div id="rd-miss" class="mt small muted"></div></div>' +
        '<div class="card" id="rd-hist"><h3>我的跟读记录</h3><div id="rd-hist-list"></div></div>';
      el('en-body').innerHTML = h;

      el('rd-pick').onchange = function () {
        el('rd-text').value = READ_LIB[+el('rd-pick').value].t;
      };
      el('rd-rand').onclick = function () {
        var i = Math.floor(Math.random() * READ_LIB.length);
        el('rd-pick').value = i; el('rd-text').value = READ_LIB[i].t;
      };
      el('rd-play').onclick = function () {
        var t = el('rd-text').value.trim();
        if (!t) { toast('先填一句英文', 'err'); return; }
        A.tts(t, { lang: 'en-US', rate: parseFloat(el('rd-rate').value) });
        el('rd-state').textContent = '播放中……再听一遍可直接重按，或开始跟读。';
      };
      el('rd-stop').onclick = function () {
        if (A.state.activeSpeech) { try { A.state.activeSpeech.stop(); } catch (e) {} }
        el('rd-stop').disabled = true; el('rd-state').textContent = '已停止。';
      };
      el('rd-go').onclick = function () {
        var orig = el('rd-text').value.trim();
        if (!orig) { toast('先填一句英文', 'err'); return; }
        el('rd-state').textContent = '请开始朗读……读完后系统自动停止并打分。';
        el('rd-stop').disabled = false;
        A.speech(function (txt) {
          el('rd-said').textContent = txt || '（没识别到内容，请靠近麦克风、说得慢一点）';
          var r = scoreRead(orig, txt);
          el('rd-orig').innerHTML = highlightRead(orig, txt);
          var chip = el('rd-score');
          chip.style.display = '';
          chip.textContent = '匹配度 ' + r.score + '% （' + r.hit + '/' + r.total + ' 词）';
          chip.className = 'chip ' + (r.score >= 80 ? 'green' : r.score >= 50 ? 'warn' : '');
          el('rd-miss').textContent = r.miss.length ? ('漏读 / 读错：' + r.miss.join(', ')) : '全部命中，很棒！';
          if (A.state.user) {
            S.put('english_reads', { id: 'er_' + Date.now(), at: new Date().toISOString(),
              mode: 'read', text: orig, said: txt, score: r.score }).catch(function () {});
            loadHist();
          }
        }, function (st) {
          if (st === 'end') { el('rd-stop').disabled = true; }
          if (st === 'error') { el('rd-state').textContent = '识别出错，可直接把读的内容粘到下方文本框再对比。'; }
        }, { lang: 'en-US' });
      };

      function loadHist() {
        if (!A.state.user) { el('rd-hist').style.display = 'none'; return; }
        S.all('english_reads').then(function (list) {
          list = (list || []).slice().reverse().slice(0, 8);
          el('rd-hist-list').innerHTML = list.length ? list.map(function (o) {
            return '<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)">' +
              '<span class="small">' + esc(String(o.text || '').slice(0, 40)) + '</span>' +
              '<span class="chip ' + (o.score >= 80 ? 'green' : o.score >= 50 ? 'warn' : '') + '">' + o.score + '%</span></div>';
          }).join('') : '<p class="small muted">还没有记录，登录后跟读会自动留存。</p>';
        }).catch(function () {});
      }
      loadHist();
    }

    /* ---------------- 听力子页 ---------------- */
    function renderListen() {
      var opts = LISTEN_LIB.map(function (p, i) {
        return '<option value="' + i + '">' + esc(p.title) + '</option>';
      }).join('');
      var h = '<div class="card pad-s mb">' +
        '<div class="row"><label class="field" style="flex:1">选一篇听力材料' +
        '<select id="ls-pick">' + opts + '</select></label>' +
        '<label class="field" style="width:150px">语速' +
        '<select id="ls-rate"><option value="0.8">慢速 0.8×</option>' +
        '<option value="0.95" selected>常速 0.95×</option>' +
        '<option value="1.05">快速 1.05×</option></select></label></div>' +
        '<label class="field">或粘贴你自己的英文短文（也可直接出题）' +
        '<textarea id="ls-text" style="min-height:90px">' + esc(LISTEN_LIB[0].passage) + '</textarea></label>' +
        '<div class="row mt">' +
        '<button class="btn primary" id="ls-play">🔊 播放听力</button>' +
        '<button class="btn" id="ls-stop">停止播放</button>' +
        '<button class="btn ghost" id="ls-hide">隐藏材料（闭卷）</button>' +
        '<button class="btn ghost" id="ls-rand">随机一篇</button>' +
        '</div>' +
        '<p class="small muted mt" id="ls-state">建议先隐藏材料、完整听 1-2 遍后再看材料做题。</p>' +
        '</div>' +
        '<div class="card pad-s mb" id="ls-material-box"><h3>听力材料</h3>' +
        '<div id="ls-material" class="q-stem" style="line-height:1.9"></div></div>' +
        '<div class="card mb"><div class="ai-head">✦ 听力理解题' +
        '<span class="spacer"></span><button class="btn sm ghost" id="ls-gen">由大模型生成 3 题</button></div>' +
        '<div id="ls-quiz" class="md-body">选好材料后点「由大模型生成 3 题」，本机免费模型会基于材料出客观理解题。</div>' +
        '<div class="row mt"><button class="btn primary" id="ls-grade" disabled>判分并看解析</button>' +
        '<span id="ls-result" class="chip" style="display:none"></span></div></div>';
      el('en-body').innerHTML = h;

      function curPassage() { return el('ls-text').value.trim(); }
      function showMaterial() {
        el('ls-material').textContent = curPassage();
        el('ls-material-box').style.display = '';
      }
      showMaterial();

      el('ls-pick').onchange = function () {
        el('ls-text').value = LISTEN_LIB[+el('ls-pick').value].passage; showMaterial();
      };
      el('ls-rand').onclick = function () {
        var i = Math.floor(Math.random() * LISTEN_LIB.length);
        el('ls-pick').value = i; el('ls-text').value = LISTEN_LIB[i].passage; showMaterial();
      };
      el('ls-play').onclick = function () {
        var t = curPassage();
        if (!t) { toast('先选或粘贴一篇材料', 'err'); return; }
        A.tts(t, { lang: 'en-US', rate: parseFloat(el('ls-rate').value) });
      };
      el('ls-stop').onclick = function () { A.stopTts(); };
      el('ls-hide').onclick = function () {
        var box = el('ls-material-box');
        if (box.style.display === 'none') { showMaterial(); el('ls-hide').textContent = '隐藏材料（闭卷）'; }
        else { box.style.display = 'none'; el('ls-hide').textContent = '显示材料'; }
      };

      var quizItems = [];
      el('ls-gen').onclick = async function () {
        var t = curPassage();
        if (!t) { toast('先选或粘贴一篇材料', 'err'); return; }
        el('ls-gen').disabled = true; el('ls-grade').disabled = true;
        el('ls-quiz').textContent = '大模型正在基于材料出题……';
        var acc = '';   // onDelta 是增量片段，累加显示
        try {
          var raw = await A.aiChat(P.listenQuiz({ passage: t, n: 3 }), {
            onDelta: function (d) { acc += d; el('ls-quiz').textContent = acc; }
          });
          quizItems = parseListen(raw);
          if (quizItems.length) renderQuiz(quizItems);
          else { el('ls-quiz').className = 'md-body'; el('ls-quiz').innerHTML = A.md2html(raw); }
        } catch (e) {
          el('ls-quiz').textContent = '生成失败：' + (e && e.message ? e.message : e);
        } finally {
          el('ls-gen').disabled = false;
        }
      };

      function renderQuiz(items) {
        var h = items.map(function (it, i) {
          var optHtml = ['A', 'B', 'C', 'D'].map(function (k) {
            if (!it.opts[k]) return '';
            return '<label class="opt"><input type="radio" name="q' + i + '" value="' + k + '"> ' +
              esc(k + '. ' + it.opts[k]) + '</label>';
          }).join('');
          return '<div class="quiz-item" data-i="' + i + '" style="padding:10px 0;border-bottom:1px solid var(--line)">' +
            '<div class="strong">' + (i + 1) + '. ' + esc(it.stem) + '</div>' +
            '<div class="opts">' + optHtml + '</div>' +
            '<div class="q-exp small muted" style="display:none;margin-top:6px"></div></div>';
        }).join('');
        el('ls-quiz').className = '';
        el('ls-quiz').innerHTML = h;
        el('ls-grade').disabled = false;
      }

      el('ls-grade').onclick = function () {
        if (!quizItems.length) return;
        var right = 0;
        quizItems.forEach(function (it, i) {
          var box = $$('.quiz-item')[i];
          var sel = box.querySelector('input:checked');
          var chosen = sel ? sel.value : '';
          var opts = box.querySelectorAll('.opt');
          opts.forEach(function (o) {
            var inp = o.querySelector('input');
            o.style.color = '';
            if (inp.value === it.ans) o.style.color = '#1a7f37';
            else if (inp.value === chosen) o.style.color = '#c0392b';
          });
          if (chosen === it.ans) right++;
          var exp = box.querySelector('.q-exp');
          exp.style.display = '';
          exp.innerHTML = '<b>答案：' + it.ans + '</b>　' + esc(it.exp || '（无解析）');
        });
        var chip = el('ls-result');
        chip.style.display = '';
        chip.textContent = '得分 ' + right + '/' + quizItems.length;
        chip.className = 'chip ' + (right === quizItems.length ? 'green' : right >= quizItems.length / 2 ? 'warn' : '');
        if (A.state.user) {
          S.put('english_listen', { id: 'el_' + Date.now(), at: new Date().toISOString(),
            passage: curPassage().slice(0, 60), score: right, total: quizItems.length }).catch(function () {});
        }
      };
    }
  });
})();
