/* =====================================================================
 * 中山一号 · 本地资料互转工作台（views-files.js）
 *  对应建站留档 S01 Filee：试卷 PDF / 图片 / 文本资料本地互转，资料不出本机。
 *
 *  四个子页：
 *   ① 图片 → PDF   多图合并、排序、A4/原图，零依赖生成器（assets/pdf-writer.js）
 *   ② PDF → 图片   逐页渲染成 PNG（联网时按需加载 pdf.js；离线给出降级说明）
 *   ③ 文本 → MD    TXT/MD/HTML/CSV/JSON 读取清洗并导出 Markdown（EPUB 说明降级）
 *   ④ 图片识别     复用本机 ofm 视觉模型做试卷 OCR，结果导出 Markdown
 *
 *  隐私：所有文件只在浏览器内处理；没有 fetch 上传、没有第三方接收。
 *        OCR 走 127.0.0.1 本机网关，图片同样不出这台电脑。
 * ===================================================================== */
(function () {
  'use strict';
  var A = window.ZSApp, S = window.ZSStore, P = window.ZS_PROMPTS, PDFW = window.ZSPdf;
  if (!A || !PDFW) { console.warn('views-files: 依赖未就绪'); return; }
  var el = A.el, $$ = A.$$, esc = A.esc, toast = A.toast;

  var imgList = [];       // {jpeg:Uint8Array, w, h, url(dataURL), name}
  var pdfPages = [];      // PDF→图片 渲染结果，可回灌到 imgList
  var lastText = '';      // 文本→MD 结果
  var lastOcr = '';       // OCR 结果

  var MAX_IMG = 60, MAX_DIM = 1600, MAX_PDF_PAGES = 20;

  function saveBlob(name, bytes, mime) {
    var blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function dataURL(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  /* 图片 → 压缩 JPEG 字节（白底，避免透明 PNG 转 JPEG 变黑） */
  function toJpeg(file, maxDim, q) {
    return dataURL(file).then(function (url) {
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height, s = Math.min(1, maxDim / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
          var c = document.createElement('canvas'); c.width = cw; c.height = ch;
          var cx = c.getContext('2d');
          cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cw, ch);
          cx.drawImage(img, 0, 0, cw, ch);
          c.toBlob(function (blob) {
            if (!blob) { rej(new Error('图片转换失败')); return; }
            var fr = new FileReader();
            fr.onload = function () {
              res({ jpeg: new Uint8Array(fr.result), w: cw, h: ch, url: url, name: file.name });
            };
            fr.onerror = rej;
            fr.readAsArrayBuffer(blob);
          }, 'image/jpeg', q || 0.85);
        };
        img.onerror = rej;
        img.src = url;
      });
    });
  }
  function fmtSize(n) { return (n / 1024).toFixed(0) + ' KB'; }
  /* dataURL → Uint8Array（直接解码，不走 fetch，file:// 下同样可靠） */
  function dataURLToBytes(u) {
    var bin = atob(String(u).split(',')[1] || '');
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ==================== 主视图 ==================== */
  A.view('files', async function () {
    var html = A.pageHead('本地资料工作台', '试卷图片合成 PDF、PDF 拆成图片、文本资料整理成 Markdown、图片识别成文字。全程只在你浏览器里处理。',
      '<span class="chip green">文件不出本机</span>');
    html += '<div class="tagbar" id="fw-tabs">' +
      '<a class="chip sel" data-fw="img2pdf" href="javascript:;">图片 → PDF</a>' +
      '<a class="chip" data-fw="pdf2img" href="javascript:;">PDF → 图片</a>' +
      '<a class="chip" data-fw="text2md" href="javascript:;">文本 → Markdown</a>' +
      '<a class="chip" data-fw="ocr" href="javascript:;">图片识别成文字</a></div>';
    html += '<div class="card pad-s mb small">🔒 隐私说明：本页不向任何服务器上传文件，所有转换都用浏览器 API 在本机完成；' +
      '「图片识别」调用的是本机 ofm 免费模型网关（127.0.0.1），图片也不离开这台电脑。' +
      '仅「PDF → 图片」在需要时按需加载 pdf.js 公共库（联网才有，离线会自动提示降级）。</div>';
    html += '<div id="fw-body"></div>';
    A.render(html);

    $$('#fw-tabs .chip').forEach(function (c) {
      c.onclick = function () {
        $$('#fw-tabs .chip').forEach(function (x) { x.classList.remove('sel'); });
        c.classList.add('sel');
        ({ img2pdf: renderImg2Pdf, pdf2img: renderPdf2Img, text2md: renderText2Md, ocr: renderOcr })[c.dataset.fw]();
      };
    });
    renderImg2Pdf();

    /* ---------------- ① 图片 → PDF ---------------- */
    function renderImg2Pdf() {
      el('fw-body').innerHTML =
        '<div class="card pad-s mb"><h3>① 选择试卷 / 错题截图（可多选，顺序即页序）</h3>' +
        '<div class="fw-drop" id="fw-drop">点击选择，或把图片拖到这里<br>' +
        '<span class="small muted">支持 JPG / PNG / WEBP，自动压缩到长边 ' + MAX_DIM + ' px，最多 ' + MAX_IMG + ' 张</span></div>' +
        '<input type="file" id="fw-imgs" accept="image/*" multiple hidden>' +
        '<div id="fw-thumbs" class="fw-thumbs mt"></div></div>' +
        '<div class="card pad-s"><div class="row wrap">' +
        '<label class="field" style="flex:1;min-width:180px">页面尺寸<select id="fw-size">' +
        '<option value="a4">A4 适配（图片等比居中，推荐打印）</option>' +
        '<option value="raw">原图尺寸（按 72 dpi 一像素一点）</option></select></label>' +
        '<label class="field" style="flex:1;min-width:150px">文件名<input type="text" id="fw-name" value="中山一号-试卷"></label>' +
        '</div><div class="row wrap mt"><button class="btn primary" id="fw-build">生成并下载 PDF</button>' +
        '<button class="btn ghost" id="fw-clear">清空列表</button>' +
        '<span class="small muted" id="fw-info"></span></div></div>' +
        '<div class="card mt"><p class="small muted">生成的 PDF 是标准 PDF 1.4，图像以 JPEG 原始流嵌入（/DCTDecode），' +
        '不依赖任何外部库；可直接打印、交给老师或用其它 PDF 工具打开。</p></div>';

      var drop = el('fw-drop'), input = el('fw-imgs');
      drop.onclick = function () { input.click(); };
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = function () { drop.classList.remove('over'); };
      drop.ondrop = function (e) {
        e.preventDefault(); drop.classList.remove('over');
        addFiles(e.dataTransfer.files);
      };
      input.onchange = function () { addFiles(input.files); input.value = ''; };

      function addFiles(files) {
        var arr = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
        if (!arr.length) { toast('请选择图片文件', 'err'); return; }
        if (imgList.length + arr.length > MAX_IMG) { toast('最多 ' + MAX_IMG + ' 张，已截断', 'err'); arr = arr.slice(0, MAX_IMG - imgList.length); }
        toast('正在处理 ' + arr.length + ' 张图片…');
        Promise.all(arr.map(function (f) { return toJpeg(f, MAX_DIM, 0.85); })).then(function (rows) {
          rows.forEach(function (r) { imgList.push(r); });
          drawThumbs();
          toast('已加入 ' + rows.length + ' 张', 'ok');
        }).catch(function (e) { toast('处理失败：' + e.message, 'err'); });
      }
      function drawThumbs() {
        el('fw-thumbs').innerHTML = imgList.map(function (it, i) {
          return '<div class="fw-thumb"><span class="fw-num">' + (i + 1) + '</span>' +
            '<img src="' + it.url + '" alt="' + esc(it.name) + '">' +
            '<div class="fw-name" title="' + esc(it.name) + '">' + esc(it.name) + '</div>' +
            '<div class="fw-ops"><button data-up="' + i + '">↑</button><button data-dn="' + i + '">↓</button>' +
            '<button data-rm="' + i + '">删</button></div></div>';
        }).join('');
        el('fw-info').textContent = imgList.length
          ? ('共 ' + imgList.length + ' 页 · 约 ' + fmtSize(imgList.reduce(function (a, x) { return a + x.jpeg.length; }, 0)))
          : '还没有图片';
        $$('#fw-thumbs [data-up]').forEach(function (b) {
          b.onclick = function () { var i = +b.dataset.up; if (i > 0) { var t = imgList[i]; imgList[i] = imgList[i - 1]; imgList[i - 1] = t; drawThumbs(); } };
        });
        $$('#fw-thumbs [data-dn]').forEach(function (b) {
          b.onclick = function () { var i = +b.dataset.dn; if (i < imgList.length - 1) { var t = imgList[i]; imgList[i] = imgList[i + 1]; imgList[i + 1] = t; drawThumbs(); } };
        });
        $$('#fw-thumbs [data-rm]').forEach(function (b) {
          b.onclick = function () { imgList.splice(+b.dataset.rm, 1); drawThumbs(); };
        });
      }
      el('fw-clear').onclick = function () { imgList = []; drawThumbs(); };
      el('fw-build').onclick = function () {
        if (!imgList.length) { toast('先选几张图片', 'err'); return; }
        var mode = el('fw-size').value;
        var pages = imgList.map(function (it) {
          return mode === 'raw'
            ? { jpeg: it.jpeg, w: it.w, h: it.h, pw: it.w, ph: it.h }
            : { jpeg: it.jpeg, w: it.w, h: it.h, pw: PDFW.A4.pw, ph: PDFW.A4.ph };
        });
        try {
          var bytes = PDFW.build(pages);
          var name = (el('fw-name').value.trim() || '中山一号-试卷').replace(/[\\/:*?"<>|]/g, '_') + '.pdf';
          saveBlob(name, bytes, 'application/pdf');
          toast('已生成 ' + pages.length + ' 页 PDF（' + fmtSize(bytes.length) + '）', 'ok');
        } catch (e) { toast('生成失败：' + e.message, 'err'); }
      };
      drawThumbs();
    }

    /* ---------------- ② PDF → 图片 ---------------- */
    function renderPdf2Img() {
      el('fw-body').innerHTML =
        '<div class="card pad-s mb"><h3>② 把 PDF 逐页拆成图片</h3>' +
        '<p class="small muted">此功能需要 pdf.js 公共库（按需联网加载）。若当前离线或 CDN 不可达，' +
        '会用浏览器自带 PDF 阅读器打开、或直接截图，本站不做假转换。</p>' +
        '<div class="row wrap mt"><input type="file" id="fw-pdf" accept="application/pdf,.pdf">' +
        '<button class="btn sm" id="fw-loadjs">加载 pdf.js</button>' +
        '<span class="small muted" id="fw-js-state">未加载</span></div></div>' +
        '<div class="card pad-s" id="fw-pdf-out"><p class="small muted">选一个 PDF 文件后开始渲染，最多处理前 ' + MAX_PDF_PAGES + ' 页。</p></div>';

      var state0 = '未加载';
      function setJs(msg, ok) { el('fw-js-state').textContent = msg; el('fw-js-state').style.color = ok ? '#1a7f37' : ''; }
      if (window.pdfjsLib) setJs('已就绪', true);

      el('fw-loadjs').onclick = function () {
        if (window.pdfjsLib) { setJs('已就绪', true); return; }
        setJs('正在加载…');
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = function () {
          try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            setJs('已就绪', true); toast('pdf.js 已加载', 'ok');
          } catch (e) { setJs('加载异常：' + e.message); }
        };
        s.onerror = function () { setJs('离线 / CDN 不可达，请用浏览器直接打开 PDF 或截图'); toast('联网失败，已降级', 'err'); };
        document.head.appendChild(s);
      };

      el('fw-pdf').onchange = async function () {
        var f = el('fw-pdf').files[0]; if (!f) return;
        if (!window.pdfjsLib) { toast('先点「加载 pdf.js」；离线请看下方降级说明', 'err'); showFallback(); return; }
        var box = el('fw-pdf-out');
        box.innerHTML = '<p class="small">正在渲染…</p>';
        try {
          var buf = await f.arrayBuffer();
          var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
          var n = Math.min(pdf.numPages, MAX_PDF_PAGES);
          pdfPages = [];
          var cards = [];
          for (var i = 1; i <= n; i++) {
            var page = await pdf.getPage(i);
            var vp = page.getViewport({ scale: 1.4 });
            var c = document.createElement('canvas');
            c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            var url = c.toDataURL('image/jpeg', 0.85);
            var jpeg = dataURLToBytes(url);
            pdfPages.push({ jpeg: jpeg, w: c.width, h: c.height, url: url, name: f.name + ' 第' + i + '页' });
            cards.push('<div class="fw-thumb"><span class="fw-num">' + i + '</span>' +
              '<img src="' + url + '" alt="第' + i + '页">' +
              '<div class="fw-name">第 ' + i + ' 页</div>' +
              '<div class="fw-ops"><button data-png="' + (i - 1) + '">下载 PNG</button></div></div>');
          }
          box.innerHTML = '<h3>渲染结果（' + n + ' / ' + pdf.numPages + ' 页）</h3>' +
            '<div class="fw-thumbs mt">' + cards.join('') + '</div>' +
            '<div class="row wrap mt"><button class="btn primary" id="fw-topdf">把这些页送回「图片 → PDF」</button>' +
            '<span class="small muted">可再排序、改成 A4 后重新合成 PDF。</span></div>';
          $$('#fw-pdf-out [data-png]').forEach(function (b) {
            b.onclick = function () {
              var idx = +b.dataset.png, it = pdfPages[idx];
              var c = document.createElement('canvas');
              var im = new Image();
              im.onload = function () {
                c.width = im.width; c.height = im.height;
                c.getContext('2d').drawImage(im, 0, 0);
                c.toBlob(function (pb) {
                  var fr = new FileReader();
                  fr.onload = function () { saveBlob(f.name.replace(/\.pdf$/i, '') + '-第' + (idx + 1) + '页.png', new Uint8Array(fr.result), 'image/png'); };
                  fr.readAsArrayBuffer(pb);
                }, 'image/png');
              };
              im.src = it.url;
            };
          });
          el('fw-topdf').onclick = function () {
            if (!pdfPages.length) return;
            imgList = pdfPages.slice(0, MAX_IMG);
            $$('#fw-tabs .chip').forEach(function (x) { x.classList.remove('sel'); });
            var t = $$('#fw-tabs .chip')[0]; t.classList.add('sel');
            renderImg2Pdf();
            toast('已送回图片列表，可排序后合成 PDF', 'ok');
          };
        } catch (e) {
          showFallback(e && e.message ? e.message : '');
        }
      };
      function showFallback(msg) {
        el('fw-pdf-out').innerHTML = '<h3>离线降级方案</h3>' +
          '<p class="small">' + esc(msg || 'pdf.js 未加载或当前无网络') + '</p>' +
          '<ul class="kp-ul small">' +
          '<li>用浏览器直接打开该 PDF，逐页截图后回到「图片 → PDF」重新合成；</li>' +
          '<li>或用系统自带的「打印 → 另存为 PDF / 图片」处理；</li>' +
          '<li>本站不假装转换成功，也不把文件传到外部服务器代转。</li></ul>';
      }
    }

    /* ---------------- ③ 文本 → Markdown ---------------- */
    function renderText2Md() {
      el('fw-body').innerHTML =
        '<div class="card pad-s mb"><h3>③ 文本资料整理成 Markdown</h3>' +
        '<p class="small muted">支持 TXT / MD / HTML / XHTML / CSV / JSON。' +
        'EPUB 是 zip 容器：请先用系统解压，把里面的 .html / .xhtml 文件拖进来即可（本站不内置解压库，也不代传文件）。</p>' +
        '<input type="file" id="fw-txt" class="mt" accept=".txt,.md,.markdown,.html,.htm,.xhtml,.csv,.json,.epub,text/*"></div>' +
        '<div class="card pad-s"><div class="row between"><h3 style="margin:0">整理结果</h3>' +
        '<button class="btn sm" id="fw-txt-dl" disabled>导出 .md</button></div>' +
        '<div id="fw-txt-pre" class="fw-preview mt">还没有文件。</div></div>';
      el('fw-txt').onchange = async function () {
        var f = el('fw-txt').files[0]; if (!f) return;
        var nm = f.name.toLowerCase();
        if (/\.epub$/.test(nm)) {
          el('fw-txt-pre').textContent = '检测到 EPUB。EPUB 本质是 zip 压缩包，本站为保持离线单文件、不引解压库，' +
            '不直接解析。请用系统自带解压工具打开 .epub，把其中的 .html / .xhtml / .txt 文件拖到上方输入框即可整理。' +
            '（全程仍在你本机，不上传。）';
          el('fw-txt-dl').disabled = true; return;
        }
        var raw = await f.text();
        var body = nm.match(/\.x?html?$/) ? htmlToText(raw)
          : /\.csv$/.test(nm) ? csvToMd(raw)
            : /\.json$/.test(nm) ? jsonToMd(raw) : raw;
        lastText = '# ' + f.name.replace(/\.[^.]+$/, '') + '\n\n> 来源：本机文件 ' + f.name +
          '　整理时间：' + A.fmtTime(new Date().toISOString()) + '\n\n' + body.trim() + '\n';
        el('fw-txt-pre').textContent = lastText;
        el('fw-txt-dl').disabled = false;
        toast('已整理 ' + f.name, 'ok');
      };
      el('fw-txt-dl').onclick = function () {
        if (lastText) {
          A.download('中山一号-资料-' + A.today() + '.md', lastText, 'text/markdown;charset=utf-8');
          toast('已导出 Markdown', 'ok');
        }
      };
      function htmlToText(s) {
        return s.replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<head[\s\S]*?<\/head>/gi, '')
          .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n');
      }
      function csvToMd(s) {
        var rows = s.split(/\r?\n/).filter(function (x) { return x.trim(); }).slice(0, 200)
          .map(function (line) { return '| ' + line.split(',').map(function (c) { return c.trim().replace(/\|/g, '\\|'); }).join(' | ') + ' |'; });
        if (rows.length) rows.splice(1, 0, rows[0].replace(/[^|]/g, '-'));
        return rows.join('\n');
      }
      function jsonToMd(s) {
        try { return '```json\n' + JSON.stringify(JSON.parse(s), null, 2) + '\n```'; }
        catch (e) { return '```\n' + s + '\n```'; }
      }
    }

    /* ---------------- ④ 图片识别成文字 ---------------- */
    function renderOcr() {
      el('fw-body').innerHTML =
        '<div class="card pad-s mb"><h3>④ 试卷 / 笔记图片识别成文字</h3>' +
        '<p class="small muted">调用本机 ofm 免费视觉模型（127.0.0.1:18900）识别科目、题干与作答，' +
        '输出结构化 Markdown。没开 ofm 网关时会明确报错，不会偷偷把图传到外面。</p>' +
        '<div class="row wrap mt"><input type="file" id="fw-ocr-img" accept="image/*">' +
        '<button class="btn primary" id="fw-ocr-go">开始识别</button>' +
        '<span class="small muted" id="fw-ocr-state"></span></div>' +
        '<div id="fw-ocr-prev" class="fw-thumbs mt"></div></div>' +
        '<div class="card pad-s"><div class="row between"><h3 style="margin:0">识别结果</h3>' +
        '<button class="btn sm" id="fw-ocr-dl" disabled>导出 .md</button></div>' +
        '<div id="fw-ocr-out" class="fw-preview mt">还没有识别结果。</div></div>';
      var ocrData = null;
      el('fw-ocr-img').onchange = async function () {
        var f = el('fw-ocr-img').files[0]; if (!f) return;
        ocrData = await dataURL(f);
        el('fw-ocr-prev').innerHTML = '<div class="fw-thumb"><img src="' + ocrData + '" alt="待识别图片">' +
          '<div class="fw-name">' + esc(f.name) + '</div></div>';
      };
      el('fw-ocr-go').onclick = async function () {
        if (!ocrData) { toast('先选一张图片', 'err'); return; }
        var box = el('fw-ocr-out');
        box.textContent = '正在调用本机视觉模型识别…';
        el('fw-ocr-state').textContent = '识别中';
        var acc = '';   // onDelta 是增量片段，累加显示
        try {
          var md = await A.aiChat(P.paperScan({}), { images: [ocrData], onDelta: function (d) { acc += d; box.textContent = acc; } });
          lastOcr = md;
          box.innerHTML = A.md2html(md);
          el('fw-ocr-dl').disabled = false;
          el('fw-ocr-state').textContent = '完成';
        } catch (e) {
          box.textContent = '识别失败：' + (e && e.message ? e.message : e) +
            '\n\n请确认本机 ofm 免费模型网关已启动（127.0.0.1:18900），且视觉模型可用；' +
            '图片识别不走云端兜底，避免把试卷发到外部。';
          el('fw-ocr-state').textContent = '失败';
        }
      };
      el('fw-ocr-dl').onclick = function () {
        if (lastOcr) {
          A.download('中山一号-图片识别-' + A.today() + '.md', lastOcr, 'text/markdown;charset=utf-8');
          toast('已导出 Markdown', 'ok');
        }
      };
    }
  });
})();
