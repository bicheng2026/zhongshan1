/* =====================================================================
 * 中山一号 · 零依赖图片→PDF 生成器（assets/pdf-writer.js）
 *
 * 为什么自己写：Filee 那条「资料本地互转、不上传」要求纯前端完成，
 * 引 pdfkit/jspdf 会破坏离线单文件；PDF 规范允许把 JPEG 原始字节
 * 用 /Filter /DCTDecode 直接嵌进图像 XObject，所以只需拼对象 + xref 表。
 *
 * 用法：
 *   var bytes = window.ZSPdf.build([
 *     { jpeg: Uint8Array, w: 1200, h: 1600, pw: 595.28, ph: 841.89 }
 *   ]);
 *   // bytes 是完整的 PDF 文件（Uint8Array），交给 Blob 下载即可。
 * 纯函数、无 DOM 依赖，可在 Node 里 require 做结构校验。
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ZSPdf = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var A4 = { pw: 595.28, ph: 841.89 };   // A4，单位 pt（72 dpi）

  /* 把图片按 contain 方式摆进页面，返回 PDF 内容流的变换参数 */
  function fit(w, h, pw, ph) {
    var s = Math.min(pw / w, ph / h);
    var dw = w * s, dh = h * s;
    return { dw: dw, dh: dh, dx: (pw - dw) / 2, dy: (ph - dh) / 2 };
  }
  function f(n) {
    var v = Number(n || 0);
    return (Math.round(v * 100) / 100).toString();
  }
  function pad10(n) { return ('0000000000' + n).slice(-10); }

  function build(pages) {
    if (!pages || !pages.length) throw new Error('没有页面');
    var enc = new TextEncoder();
    var chunks = [], total = 0, offsets = {};

    function put(x) {
      var b = (typeof x === 'string') ? enc.encode(x) : x;
      chunks.push(b); total += b.length;
    }
    function obj(num, body) {
      offsets[num] = total;
      put(num + ' 0 obj\n');
      if (typeof body === 'function') body(); else put(body);
      put('\nendobj\n');
    }

    /* 文件头：%PDF-1.4 + 二进制标记（高位字节必须用字节数组，不能走 UTF-8 编码） */
    put('%PDF-1.4\n');
    put(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

    var n = pages.length;
    var pageIds = [], contentIds = [], imageIds = [];
    for (var i = 0; i < n; i++) {
      pageIds.push(3 + 3 * i); contentIds.push(4 + 3 * i); imageIds.push(5 + 3 * i);
    }
    var size = 3 + 3 * n;   // 含 obj 0 的 /Size

    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + pageIds.map(function (x) { return x + ' 0 R'; }).join(' ') +
      '] /Count ' + n + ' >>');

    pages.forEach(function (pg, i) {
      var jpeg = pg.jpeg, w = pg.w | 0, h = pg.h | 0;
      var pw = pg.pw || A4.pw, ph = pg.ph || A4.ph;
      var fitv = fit(w, h, pw, ph);
      var content = 'q\n' + f(fitv.dw) + ' 0 0 ' + f(fitv.dh) + ' ' +
        f(fitv.dx) + ' ' + f(fitv.dy) + ' cm\n/Im0 Do\nQ\n';
      var cbytes = enc.encode(content);
      var pId = pageIds[i], cId = contentIds[i], imId = imageIds[i];

      obj(pId, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(pw) + ' ' + f(ph) + '] ' +
        '/Resources << /XObject << /Im0 ' + imId + ' 0 R >> >> /Contents ' + cId + ' 0 R >>');

      obj(cId, function () {
        put('<< /Length ' + cbytes.length + ' >>\nstream\n');
        put(cbytes);
        put('endstream');
      });

      obj(imId, function () {
        put('<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
          jpeg.length + ' >>\nstream\n');
        put(jpeg);
        put('endstream');
      });
    });

    /* 交叉引用表：每条必须正好 20 字节 */
    var xrefOffset = total;
    put('xref\n0 ' + size + '\n');
    put('0000000000 65535 f \n');
    for (var k = 1; k < size; k++) {
      put(pad10(offsets[k] || 0) + ' 00000 n \n');
    }
    put('trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n');

    var out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (b) { out.set(b, pos); pos += b.length; });
    return out;
  }

  return { build: build, A4: A4, fit: fit, version: '1.0' };
});
