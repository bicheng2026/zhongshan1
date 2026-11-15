/* 中山一号 · 高科技动态背景（粒子网络）
 * 纯装饰：fixed 全屏 canvas，z-index 在最底层，pointer-events:none，绝不挡点击。
 * 尊重 prefers-reduced-motion：开启时只画一帧静态网络，不跑动画。
 * 颜色跟随主题（读 --neon），标签页隐藏时暂停，移动端自动减量。 */
(function () {
  'use strict';
  function init() {
    var canvas = document.getElementById('bgfx');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, parts = [], raf = null, lastTheme = '';

    function color() {
      var t = document.documentElement.getAttribute('data-theme') || 'light';
      if (t === lastTheme) return currentColor;
      lastTheme = t;
      var v = (getComputedStyle(document.documentElement).getPropertyValue('--neon') || '').trim();
      currentColor = v || (t === 'dark' ? '#45d2ff' : '#13b8cf');
      return currentColor;
    }
    var currentColor = '#13b8cf';

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var area = W * H;
      var target = Math.max(34, Math.min(96, Math.round(area / 16000)));
      if (window.innerWidth < 760) target = Math.max(18, Math.round(target * 0.5));
      parts = [];
      for (var i = 0; i < target; i++) {
        parts.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
          r: 1 + Math.random() * 1.6
        });
      }
    }

    function frame() {
      ctx.clearRect(0, 0, W, H);
      var c = color();
      var linkDist = Math.min(150, Math.max(110, W / 9));
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
        for (var j = i + 1; j < parts.length; j++) {
          var q = parts[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < linkDist) {
            ctx.globalAlpha = (1 - d / linkDist) * 0.22;
            ctx.strokeStyle = c; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.7;
      for (var k = 0; k < parts.length; k++) {
        var n = parts[k];
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function loop() { frame(); raf = requestAnimationFrame(loop); }

    function start() {
      resize();
      if (reduce) { frame(); return; }
      if (!raf) raf = requestAnimationFrame(loop);
    }

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 200); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
      else if (!reduce) { if (!raf) raf = requestAnimationFrame(loop); }
    });
    // 主题切换时刷新粒子颜色缓存
    var mo = window.MutationObserver && new MutationObserver(function () { lastTheme = ''; if (reduce) frame(); });
    if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-pref'] });

    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
