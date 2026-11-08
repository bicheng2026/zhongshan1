/*
 * 中山一号 · 云后端开关（当前：关闭，跑本地全功能版）
 * ---------------------------------------------------------------------------
 * 【上云零调试】切云只改本文件，页面与业务代码一行都不用动：
 *   1) 在 WorkBuddy 里为本应用开通云服务（弹窗由主公本人点同意），
 *      拿回 publicConfig 的 endpoint / publishableKey / oauthRelayBaseUrl；
 *   2) 把下面三个值填上，enabled 改成 true；
 *   3) 按《切云 Runbook》执行建表 SQL（3 张表 + RLS），一次即可；
 *   4) 发布时复用同一个 applicationId，别另建应用（换域名会 Origin 校验失败）。
 *
 * 三个值只能来自 publicConfig，禁止硬编码域名、禁止从 location 推断。
 * enabled:false 时 SDK 完全不加载，0 资源点、0 云应用名额、0 消耗。
 * --------------------------------------------------------------------------- */
window.ZS_CLOUD_CONFIG = {
  enabled: false,

  endpoint: '',            // publicConfig.endpoint
  publishableKey: '',      // publicConfig.publishableKey
  oauthRelayBaseUrl: '',   // publicConfig.oauthRelayBaseUrl（web 端 OAuth / 回调必需）
  applicationId: '',       // 发布复用同一个，勿另建

  /* 多级 CDN 兜底（2026-11-05 实测：默认 cdn.jsdelivr.net 与 raw.githubusercontent 不通，
     fastly.jsdelivr.net / registry.npmmirror.com / unpkg.com / cdn.bootcdn.net 均 200）。
     按顺序试，前一个失败自动换下一个；全失败时公式降级为原始 LaTeX 文本、功能不受影响。 */
  sdkCdn: 'https://fastly.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js',
  sdkCdns: [
    'https://fastly.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js',
    'https://registry.npmmirror.com/@tencent-ai/workbuddy-cloud-sdk/latest/files/lib/index.global.js',
    'https://unpkg.com/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js'
  ],

  katexCss: 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  katexJs: 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  katexCdns: [
    { css: 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
      js: 'https://fastly.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js' },
    { css: 'https://registry.npmmirror.com/katex/0.16.11/files/dist/katex.min.css',
      js: 'https://registry.npmmirror.com/katex/0.16.11/files/dist/katex.min.js' },
    { css: 'https://cdn.bootcdn.net/ajax/libs/KaTeX/0.16.11/katex.min.css',
      js: 'https://cdn.bootcdn.net/ajax/libs/KaTeX/0.16.11/katex.min.js' },
    { css: 'https://unpkg.com/katex@0.16.11/dist/katex.min.css',
      js: 'https://unpkg.com/katex@0.16.11/dist/katex.min.js' }
  ],

  /* 教材 PDF 备用镜像：fastly 偶发 SSL 握手失败时，把 gh/ 路径换成 raw 镜像 */
  textbookMirrorPrefix: 'https://ghproxy.net/https://raw.githubusercontent.com/',
  textbookRepoPath: 'TapXWorld/ChinaTextbook/master/',

  /* ======================================================================
   * 本机免费模型网关 ofm（默认通道 · 零成本 · 免用户付费 Key）
   * ----------------------------------------------------------------------
   * 这是主公本机跑的「Our Free Model」网关，OpenAI 兼容，26 个免费模型，
   * CORS = *，浏览器可直连。它不是先锋一号（先锋一号计费，不用）。
   *
   * ⚠️ 安全边界：下面的 key 只对本机 127.0.0.1:18900 有效，出了这台机器
   *    毫无用处（别的机器要么没有这个网关，要么 key 不同）。所以内置到前端
   *    不会造成 Key 泄露被盗刷 —— 与「本地运行模型」等价。
   *    若要把网站公开给外网陌生人长期用，请改用云端免密钥大模型（耗平台资源点），
   *    不要依赖本机网关。
   *
  * 「云上能不能用」准确边界（2026-11-07 实测核定，勿再写「HTTPS 可直连回环」）：
  * ofm 是 127.0.0.1 回环网关，只指向**访问者自己的电脑**。别人电脑 / 手机打开云端页面时，
  * 那台机器上没有这个网关；且公网 HTTPS 页面请求 loopback 会触发 Chromium
  * Private Network Access 预检，服务端必须回 Access-Control-Allow-Private-Network: true，
  * Chrome 142+ 还要用户授予「本地网络访问」权限，仅有 CORS=* 不够。
  * 所以「免费模型上云给所有人直接用」靠本机网关做不到。主公 2026-11-08 拍板走 B1：
  * 把免费模型池换成云端可达的免费额度服务，由独立云端代理统一转发并保管 Key
  * （配置见下面 freeProxy，代理代码在 free-llm-proxy/，部署见《切云 Runbook》第九节）。
  * 另两条备选：① 开通云服务切「WorkBuddy 免密钥大模型」（耗资源点）；
  *             ② 自有 DeepSeek Key + 云函数代理（钱走 DeepSeek 账户）。
  * 兜底顺序：当前通道 → 云端免费代理 → 云免密钥 → 本机网关（仅本地页面）→ 离线教练。
   *
   * defaultModel 用 combo:auto-free（自动路由）：各免费模型有独立额度，自动路由能
   * 绕过单模型「Free usage limit reached」限流，最大化“永远免费可用”。
   * ==================================================================== */
  ofm: {
    base: 'http://127.0.0.1:18900/v1/chat/completions',
    modelsUrl: 'http://127.0.0.1:18900/v1/models',
    key: 'ofm-hcsX1KcFzWlImfsbf12y9g594Amz5fOR',
    defaultModel: 'combo:auto-free'
  },

  /* ======================================================================
   * B1 · 云端免费模型代理（2026-11-08 主公拍板，默认通道）
   * ----------------------------------------------------------------------
   * 把原先只在 127.0.0.1:18900 跑的「免费模型转发」搬到云端：
   * 免费额度服务商（OpenRouter 的 :free 模型 / 硅基流动免费模型）的 Key 只放在
   * 云端代理的环境变量里，前端一个 Key 都不存；代理再做模型白名单 + Origin 白名单
   * + 限流，外人就算拿到地址也只能调免费模型，烧不到钱。
   * 云端页面、手机、别人的电脑都能用，且不需要主公电脑 24 小时开机。
   *
   * 部署后把代理地址填进 url（或在「全站设置」里填一次），其余保持默认即可。
   * url 为空时不会白屏：AI 自动按「本机 ofm → 内置离线教练」旧链路兜底。
   *
   * 【2026-11-08 双云落地】WorkBuddy 同一工作区只有一个应用名额，代理不能单独发，
   * 否则会把站点首页覆盖掉。现改为「一个 Node 进程同端口同时服务静态站点 + 代理 API」：
   *   /、/assets/**          → 站点页面与资料
   *   /health、/v1/**        → 免费模型代理
   * 因此 WorkBuddy 站点与代理同源；GitHub Pages 那份静态副本跨域调用同一个代理地址，
   * 代理端 FREE_LLM_ORIGIN 已同时放行 https://zhongshan1.app.workbuddy.host 与
   * https://bicheng2026.github.io。两朵云共用这一处地址，改地址只需改这里。
   * ==================================================================== */
  freeProxy: {
    url: 'https://zhongshan1.app.workbuddy.host',
    /* 双云：GitHub Pages 副本 / 本地预览是跨域访问 WorkBuddy 应用，分享码网关要求
       请求带上 ?sharecode=... 才放行（同源页面已有 __wb_rsc cookie，不用带）。
       这是公开分享链接里的访问码，不是 Key；前端只用它过网关，不涉及任何凭据。 */
    shareQuery: '?sharecode=WAXTKTBRHX',
    token: '',               // 可选，与代理端 FREE_LLM_TOKEN 一致，防陌生人滥用
    defaultModel: 'combo:auto-free',
    visionModel: 'nvidia/nemotron-3.5-super-vl:free',
    /* 隐私默认：试卷/笔记图片不发给云端代理，保持「文件不出本机」。
       确需云端面批时把这里改 true（代理端 FREE_LLM_ALLOW_VISION 也要同时设 true），
       图片才会经代理转发给免费视觉模型。 */
    allowCloudVision: false,
    /* 2026-11-08 实测校准：OpenRouter 当前在线的 :free 模型共 12 个，下面这条
       自动路由池取其中 7 个纯文本模型；视觉模型单列（默认不向云端发图片）。
       旧的 deepseek-r1 / llama-3.3-70b / qwen-2.5-7b / gemini-2.0-flash-exp:free
       已全部下线，别再写回去，否则 combo:auto-free 会连续 404。
       顺序与代理端一致，按真实 Key 实测把可用的排前、常 429 的排后。 */
    models: [
      'combo:auto-free',
      'nvidia/nemotron-3.5-lightning:free',
      'liquid/lfm-2.5-2.6b:free',
      'cohere/north-mini-code:free',
      'recursive/flint-v1.0:free',
      'xingchen-agi/xing4.0-29b-a4b:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'liquid/lfm-3-1.7b:free',
      'nvidia/nemotron-3.5-super-vl:free'
    ]
  },

  /* 云端需要建的 3 张表（完整 SQL 见《切云 Runbook》）
     zs_rows      通用 KV 业务表：id TEXT / owner_id TEXT DEFAULT auth.uid() / ns / data JSONB
                  —— 业务对象原样存 JSONB，以后加任何功能都不用改表结构
     profiles     账号资料：id / account / name / role / local_dir / created_at（登录用户可读）
     admin_config 全站设置：key TEXT / value JSONB（管理员可写，登录用户可读）
  */
  tables: ['zs_rows', 'profiles', 'admin_config'],

  /* 题目适用范围：广西优先，可拓展到新课标 II 卷省份与其他省份 */
  regions: ['广西', '新课标II卷', '新课标I卷', '全国甲卷', '北京', '上海', '天津', '浙江', '山东', '广东', '江苏', '湖南', '湖北', '河北', '福建', '其他']
};
