/*
 * 中山一号 · 统一后端适配层  window.ZSBackend
 * ---------------------------------------------------------------------------
 * 【架构约定 · 上云零调试】
 * 全站业务代码只认这一层，且**所有后端调用一律 await**。
 * 本地实现同步返回、云实现返回 Promise，await 对两者都成立，
 * 所以切云时业务页面一行都不用改。
 *
 * 两套实现同契约：
 *   LocalBackend  —— IndexedDB + localStorage + File System Access API + DeepSeek SSE
 *   CloudBackend  —— WorkBuddy 云 SDK（Auth / PostgREST / Storage / LLM）
 *
 * 切云只需两步（不用改本文件、不用改任何页面）：
 *   1) data/cloud-config.js 填 publicConfig 三值并把 enabled 改 true；
 *   2) 按《切云 runbook》建 3 张表 + RLS。
 *
 * 云表设计刻意做成通用 KV：zs_rows(id TEXT, owner_id, ns, data JSONB)，
 * 业务层传什么对象都原样存，不需要随功能迭代改 DDL —— 这是零调试的关键。
 * --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var CFG = window.ZS_CLOUD_CONFIG || { enabled: false };

  /* ============ 统一接口契约（两套实现必须逐条对齐） ============
   * init()                                    -> {mode, ready}
   * auth.sendOtp(account)                     -> {needOtp, verificationId, isExistingUser}
   * auth.signUp({account,secret,name,otpToken,verificationId,isExistingUser}) -> user
   * auth.signIn({account,secret})             -> user
   * auth.signOut()                           -> void
   * auth.current()                           -> user|null
   * auth.users()                             -> user[]   (仅 admin)
   * auth.isAdmin()                           -> bool
   *
   * db.all(ns) / db.get(ns,id) / db.put(ns,row) / db.query(ns,fn)
   * db.remove(ns,id) / db.exportAll() / db.importAll(json)
   *
   * file.put(name,blob,meta) / file.get(name) / file.list() / file.remove(name)
   * file.bindLocalDir() / file.localPath() / file.syncToLocal(name)
   *
   * llm.models() / llm.chat({system,messages,onDelta,signal,model})
   * llm.config() / llm.setConfig(cfg)
   *
   * 【重要】业务层对以上每一个方法都用 await 调用。
   * ---------------------------------------------------------------------- */

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function hash(s) { // 本地版只做混淆，不是安全边界
    var h = 5381, i;
    for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(16);
  }
  function publicUser(u) {
    return { id: u.id, account: u.account, name: u.name, role: u.role,
             localDir: u.localDir, createdAt: u.createdAt };
  }

  /* 读 OpenAI 兼容 SSE 流，边读边回调，返回完整文本。本地/云 DeepSeek 共用。
     captureReasoning=true 时（ofm 部分免费模型只回思考链）把 reasoning 也并入答案，
     避免拿到空回复；content 优先，reasoning 作为补充。 */
  function readSSE(body, onDelta, captureReasoning) {
    var reader = body.getReader(), dec = new TextDecoder('utf-8'), buf = '', full = '';
    return (function pump() {
      return reader.read().then(function (r) {
        if (r.done) return full;
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\n'); buf = lines.pop();
        lines.forEach(function (line) {
          if (line.indexOf('data:') !== 0) return;
          var d = line.slice(5).trim();
          if (!d || d === '[DONE]') return;
          try {
            var j = JSON.parse(d), dl = j.choices && j.choices[0] && j.choices[0].delta;
            if (!dl) return;
            var t = dl.content, rt = dl.reasoning;
            if (t) { full += t; if (onDelta) onDelta(t); }
            else if (captureReasoning && rt) { full += rt; if (onDelta) onDelta(rt); }
          } catch (e) { /* 跳过半包/心跳 */ }
        });
        return pump();
      });
    })();
  }

  /* 与 DeepSeek（或自建代理）对话。两条实现共用，保证切云后行为一致。
     cfg.proxyUrl 有值时走服务端代理（Key 不落前端），否则直连 DeepSeek。 */
  function deepseekChat(cfg, o) {
    var base = cfg.proxyUrl || (cfg.base || 'https://api.deepseek.com/v1').replace(/\/$/, '') + '/chat/completions';
    var headers = { 'Content-Type': 'application/json' };
    if (!cfg.proxyUrl) {
      if (!cfg.key) throw new Error('管理员还没在「全站设置」里填 DeepSeek Key');
      headers['Authorization'] = 'Bearer ' + cfg.key;
    }
    return fetch(base, {
      method: 'POST', headers: headers, signal: o.signal,
      body: JSON.stringify({
        model: o.model || cfg.model || 'deepseek-chat', stream: true,
        messages: [{ role: 'system', content: o.system }].concat(o.messages || [])
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('大模型请求失败：HTTP ' + r.status);
      return readSSE(r.body, o.onDelta);
    });
  }

  function defaultLLMConfig() {
    var o = CFG.ofm || {}, f = CFG.freeProxy || {};
    return { provider: 'free',      // B1 默认：云端免费模型代理；未配地址时自动回退旧链路
             base: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
             proxyUrl: '', key: '', hasKey: false,
             freeUrl: f.url || '', freeToken: f.token || '',
             freeModel: f.defaultModel || 'combo:auto-free',
             freeVisionModel: f.visionModel || 'nvidia/nemotron-3.5-super-vl:free',
             ofmBase: o.base || 'http://127.0.0.1:18900/v1/chat/completions',
             ofmModelsUrl: o.modelsUrl || 'http://127.0.0.1:18900/v1/models',
             ofmKey: o.key || '', ofmModel: o.defaultModel || 'combo:auto-free',
             /* 视觉/多模态模型：用于「上传试卷图片识别」。该端点免费，走 ofm 网关。
                nvidia/nemotron-3.5-super-vl:free 实测可稳定接收 image_url（无前缀的同名模型偶发 502）。 */
             ofmVisionModel: o.visionModel || 'nvidia/nemotron-3.5-super-vl:free' };
  }

  /* ======================================================================
   * 本地实现（当前默认，数据全落本机，0 资源点）
   * ==================================================================== */
  var DB_NAME = 'zhongshan1';
  var K_META = 'zs1.meta.v1';
  var K_LLM = 'zs1.llm.v1';
  var K_ROWS = 'zs1.rows.v1';
  var STORE = 'rows', FILES = 'files', HANDLES = 'handles';
  var _db = null, _engine = null, _memFiles = {}, _memHandles = {};

  /* IndexedDB 不可用时（隐私模式、站点数据被禁、无头/受限环境）自动降级：
     结构化数据落 localStorage，文件落内存。功能全可用，只是刷新后文件不保留。
     2.5 秒超时保证启动绝不卡在数据库初始化上 —— 这是防白屏的关键。 */
  function openIDB() {
    if (_db) return Promise.resolve(_db);
    if (_engine === 'ls') return Promise.reject(new Error('已切换本机轻量存储'));
    return new Promise(function (resolve, reject) {
      var done = false, req;
      function finish(v, err) { if (!done) { done = true; err ? reject(err) : resolve(v); } }
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { _engine = 'ls'; return finish(null, e); }
      var timer = setTimeout(function () {
        _engine = 'ls'; finish(null, new Error('IndexedDB 初始化超时，已切换本机轻量存储'));
      }, 2500);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('by_ns', 'ns', { unique: false });
          s.createIndex('by_owner', 'owner', { unique: false });
        }
        if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES);
        if (!d.objectStoreNames.contains(HANDLES)) d.createObjectStore(HANDLES);
      };
      req.onsuccess = function () { if (done) return; clearTimeout(timer); _db = req.result; _engine = 'idb'; finish(_db); };
      req.onerror = function () { if (done) return; clearTimeout(timer); _engine = 'ls'; finish(null, req.error || new Error('IndexedDB 不可用')); };
    });
  }
  /* 返回当前可用引擎 'idb' | 'ls'，永不 reject；业务层按引擎走对应分支 */
  function engine() { return openIDB().then(function () { return 'idb'; }).catch(function () { return 'ls'; }); }
  function lsRows() { try { return JSON.parse(localStorage.getItem(K_ROWS) || '{}'); } catch (e) { return {}; } }
  function saveLsRows(o) { try { localStorage.setItem(K_ROWS, JSON.stringify(o)); } catch (e) { /* 配额满时静默 */ } }
  function tx(store, mode, fn) {
    return openIDB().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode), s = t.objectStore(store), r = fn(s);
        t.oncomplete = function () { resolve(r && r.result !== undefined ? r.result : r); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  function meta() { try { return JSON.parse(localStorage.getItem(K_META) || '{}'); } catch (e) { return {}; } }
  function saveMeta(m) { localStorage.setItem(K_META, JSON.stringify(m)); }

  var LocalAuth = {
    /* 本地模式不需要验证码。返回 needOtp:false，业务层就不渲染验证码输入框。
       云模式返回 needOtp:true，同一套页面代码自动显示验证码框 —— 零调试。 */
    sendOtp: function () { return { needOtp: false, verificationId: '', isExistingUser: false }; },
    signUp: function (o) {
      var m = meta(); m.users = m.users || [];
      var prev = m.current;                       // 管理员代注册他人时，不能把自己挤下线
      if (!o.account || !o.secret) throw new Error('账号和密码不能为空');
      if (m.users.some(function (u) { return u.account === o.account; })) throw new Error('账号已存在');
      var u = {
        id: uid(), account: o.account, name: o.name || o.account, secret: hash(o.secret),
        role: m.users.length === 0 ? 'admin' : 'student',   // 首个注册者 = 管理员
        localDir: 'E:\\中山一号\\accounts\\' + o.account,
        createdAt: new Date().toISOString()
      };
      m.users.push(u); m.current = prev || u.id; saveMeta(m);
      return publicUser(u);
    },
    signIn: function (o) {
      var m = meta(), u = (m.users || []).find(function (x) {
        return x.account === o.account && x.secret === hash(o.secret);
      });
      if (!u) throw new Error('账号或密码不对');
      m.current = u.id; saveMeta(m); return publicUser(u);
    },
    signOut: function () { var m = meta(); m.current = null; saveMeta(m); },
    current: function () {
      var m = meta(), u = (m.users || []).find(function (x) { return x.id === m.current; });
      return u ? publicUser(u) : null;
    },
    users: function () {
      if (!LocalAuth.isAdmin()) throw new Error('只有管理员能看账号列表');
      return (meta().users || []).map(publicUser);
    },
    isAdmin: function () { var u = LocalAuth.current(); return !!u && u.role === 'admin'; }
  };

  function backupJson(rows) {
    return JSON.stringify({ app: '中山一号', version: 1,
      exportedAt: new Date().toISOString(), users: meta().users || [], rows: rows }, null, 2);
  }
  var LocalDB = {
    all: function (ns) { return LocalDB.query(ns, function () { return true; }); },
    /* 管理员跨账号读取：绕过 owner 隔离，用于「面批后台 / 教师审阅台」查看全班提交。
       仅当当前账号为管理员时由业务层调用；普通账号看不到他人数据。 */
    adminAll: function (ns) {
      return engine().then(function (e) {
        if (e === 'ls') {
          var o = lsRows(), out = [];
          Object.keys(o).forEach(function (k) { if (o[k] && o[k].ns === ns) out.push(o[k]); });
          return out;
        }
        return openIDB().then(function (d) {
          return new Promise(function (resolve, reject) {
            var out = [], t = d.transaction(STORE, 'readonly'), req = t.objectStore(STORE).openCursor();
            req.onsuccess = function (ev) {
              var c = ev.target.result;
              if (!c) { resolve(out); return; }
              if (c.value.ns === ns) out.push(c.value);
              c.continue();
            };
            req.onerror = function () { reject(req.error); };
          });
        });
      });
    },
    get: function (ns, id) {
      return LocalDB.query(ns, function (r) { return r.id === id; })
        .then(function (a) { return a[0] || null; });
    },
    put: function (ns, row) {
      var u = LocalAuth.current(), r = Object.assign({}, row);
      r.id = r.id || uid(); r.ns = ns; r.owner = u ? u.id : 'guest';
      r.updatedAt = new Date().toISOString();
      return engine().then(function (e) {
        if (e === 'ls') { var o = lsRows(); o[r.id] = r; saveLsRows(o); return r; }
        return tx(STORE, 'readwrite', function (s) { s.put(r); }).then(function () { return r; });
      });
    },
    /* 教师端专用：管理员写一条「归属指定学生」的记录（教师点评）。
       写进去的 owner 是学生 id，学生用普通 S.all() 就能读到自己的点评，
       不需要给学生端开任何跨账号读取权限。业务层必须自己先校验 isAdmin。 */
    putFor: function (ns, row, ownerId) {
      if (!ownerId) throw new Error('缺少目标账号');
      var r = Object.assign({}, row);
      r.id = r.id || uid(); r.ns = ns; r.owner = ownerId;
      r.updatedAt = new Date().toISOString();
      return engine().then(function (e) {
        if (e === 'ls') { var o = lsRows(); o[r.id] = r; saveLsRows(o); return r; }
        return tx(STORE, 'readwrite', function (s) { s.put(r); }).then(function () { return r; });
      });
    },
    query: function (ns, fn) {
      var u = LocalAuth.current(), owner = u ? u.id : 'guest';
      return engine().then(function (e) {
        if (e === 'ls') {
          var o = lsRows(), out = [];
          Object.keys(o).forEach(function (k) {
            var r = o[k];
            if (r.ns === ns && r.owner === owner) {
              try { if (fn(r)) out.push(r); } catch (err) { /* 忽略坏行 */ }
            }
          });
          return out;
        }
        return openIDB().then(function (d) {
          return new Promise(function (resolve, reject) {
            var out = [], t = d.transaction(STORE, 'readonly'), req = t.objectStore(STORE).openCursor();
            req.onsuccess = function (ev) {
              var c = ev.target.result;
              if (!c) { resolve(out); return; }
              var r = c.value;
              if (r.ns === ns && r.owner === owner) {
                try { if (fn(r)) out.push(r); } catch (err) { /* 忽略坏行 */ }
              }
              c.continue();
            };
            req.onerror = function () { reject(req.error); };
          });
        });
      });
    },
    remove: function (ns, id) {
      return LocalDB.get(ns, id).then(function (r) {
        if (!r) return false;
        return engine().then(function (e) {
          if (e === 'ls') { var o = lsRows(); delete o[id]; saveLsRows(o); return true; }
          return tx(STORE, 'readwrite', function (s) { s.delete(id); }).then(function () { return true; });
        });
      });
    },
    /* 教师端：管理员删除自己写给学生的点评。普通 remove 按 owner 过滤，
       管理员不是那条记录的 owner，会静默失败，所以这里绕过 owner 直接按 id 删。 */
    adminRemove: function (ns, id) {
      return engine().then(function (e) {
        if (e === 'ls') {
          var o = lsRows();
          if (!o[id] || o[id].ns !== ns) return false;
          delete o[id]; saveLsRows(o); return true;
        }
        return tx(STORE, 'readwrite', function (s) { s.delete(id); }).then(function () { return true; });
      });
    },
    exportAll: function () {
      return engine().then(function (e) {
        if (e === 'ls') { var o = lsRows(); return backupJson(Object.keys(o).map(function (k) { return o[k]; })); }
        return openIDB().then(function (d) {
          return new Promise(function (resolve, reject) {
            var out = [], t = d.transaction(STORE, 'readonly'), req = t.objectStore(STORE).openCursor();
            req.onsuccess = function (ev) {
              var c = ev.target.result;
              if (!c) { resolve(backupJson(out)); return; }
              out.push(c.value); c.continue();
            };
            req.onerror = function () { reject(req.error); };
          });
        });
      });
    },
    importAll: function (json) {
      var data = JSON.parse(json);
      if (data.app !== '中山一号') throw new Error('不是中山一号的备份文件');
      var rows = data.rows || [];
      return engine().then(function (e) {
        if (e === 'ls') { var o = lsRows(); rows.forEach(function (r) { o[r.id] = r; }); saveLsRows(o); return { count: rows.length }; }
        return Promise.all(rows.map(function (r) {
          return tx(STORE, 'readwrite', function (s) { s.put(r); });
        })).then(function () { return { count: rows.length }; });
      });
    }
  };

  function readDirHandle(uidStr) {
    return engine().then(function (e) {
      if (e === 'ls') return _memHandles['dir:' + uidStr] || null;
      return openIDB().then(function (d) {
        return new Promise(function (resolve) {
          var t = d.transaction(HANDLES, 'readonly'), req = t.objectStore(HANDLES).get('dir:' + uidStr);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        });
      });
    });
  }
  var LocalFile = {
    put: function (name, blob, m) {
      var info = { name: name, size: blob.size, type: blob.type,
                   at: new Date().toISOString(), note: (m && m.note) || '' };
      return engine().then(function (e) {
        if (e === 'ls') { _memFiles[name] = blob; _memHandles['meta:' + name] = info; return info; }
        return tx(FILES, 'readwrite', function (s) { s.put(blob, name); })
          .then(function () { return tx(HANDLES, 'readwrite', function (s) { s.put(info, 'meta:' + name); }); })
          .then(function () { return info; });
      });
    },
    get: function (name) {
      return engine().then(function (e) {
        if (e === 'ls') return _memFiles[name] || null;
        return tx(FILES, 'readonly', function (s) { return s.get(name); });
      });
    },
    list: function () {
      return engine().then(function (e) {
        if (e === 'ls') {
          return Object.keys(_memHandles).filter(function (k) { return k.indexOf('meta:') === 0; })
            .map(function (k) { return _memHandles[k]; });
        }
        return openIDB().then(function (d) {
          return new Promise(function (resolve, reject) {
            var out = [], t = d.transaction(HANDLES, 'readonly'), req = t.objectStore(HANDLES).openCursor();
            req.onsuccess = function (ev) {
              var c = ev.target.result;
              if (!c) { resolve(out); return; }
              if (String(c.key).indexOf('meta:') === 0) out.push(c.value);
              c.continue();
            };
            req.onerror = function () { reject(req.error); };
          });
        });
      });
    },
    remove: function (name) {
      return engine().then(function (e) {
        if (e === 'ls') { delete _memFiles[name]; delete _memHandles['meta:' + name]; return true; }
        return tx(FILES, 'readwrite', function (s) { s.delete(name); })
          .then(function () { return tx(HANDLES, 'readwrite', function (s) { s.delete('meta:' + name); }); })
          .then(function () { return true; });
      });
    },
    /* File System Access API：给当前账号授权一个本机目录。
       浏览器不能凭字符串写任意磁盘路径，必须由用户点一次「选择文件夹」。 */
    bindLocalDir: function () {
      if (!window.showDirectoryPicker) return Promise.resolve({ ok: false, label: '当前浏览器不支持本机目录绑定（需 Edge/Chrome）' });
      return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (dir) {
        var u = LocalAuth.current(); if (!u) throw new Error('请先登录');
        return engine().then(function (e) {
          if (e === 'ls') { _memHandles['dir:' + u.id] = dir; return { ok: true, label: dir.name }; }
          return tx(HANDLES, 'readwrite', function (s) { s.put(dir, 'dir:' + u.id); })
            .then(function () { return { ok: true, label: dir.name }; });
        });
      });
    },
    localPath: function () { var u = LocalAuth.current(); return u ? u.localDir : ''; },
    syncToLocal: function (name) {
      var u = LocalAuth.current(); if (!u) return Promise.resolve(false);
      return readDirHandle(u.id).then(function (dir) {
        if (!dir || !dir.getFileHandle) return false;
        return LocalFile.get(name).then(function (blob) {
          if (!blob) return false;
          return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); })
            .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
            .then(function () { return true; });
        });
      });
    }
  };

  /* ofm 专用 SSE 读取：优先 content（最终回答），reasoning（思考链）仅兜底。
     避免把推理模型的英文 thinking 混进学生看到的答案。 */
  function readOfmSSE(body, onDelta) {
    var reader = body.getReader(), dec = new TextDecoder('utf-8'), buf = '', full = '', reasoning = '';
    return (function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          if (!full && reasoning) { full = reasoning; if (onDelta) onDelta(reasoning); }
          return full;
        }
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\n'); buf = lines.pop();
        lines.forEach(function (line) {
          if (line.indexOf('data:') !== 0) return;
          var d = line.slice(5).trim();
          if (!d || d === '[DONE]') return;
          try {
            var j = JSON.parse(d), dl = j.choices && j.choices[0] && j.choices[0].delta;
            if (!dl) return;
            var t = dl.content, rt = dl.reasoning;
            if (t) { full += t; if (onDelta) onDelta(t); }
            else if (rt) { reasoning += rt; }
          } catch (e) { /* 跳过半包/心跳 */ }
        });
        return pump();
      });
    })();
  }

  /* ofm 本机免费模型网关：OpenAI 兼容，CORS=*，浏览器可直连；带 Key。
     自动路由模型 combo:auto-free 能绕过单模型免费额度限流。 */
  var OFM_CACHE = { online: null, models: null, at: 0 };
  function ofmChat(cfg, o) {
    var base = cfg.ofmBase || (CFG.ofm && CFG.ofm.base) || 'http://127.0.0.1:18900/v1/chat/completions';
    if (!/\/chat\/completions$/.test(base)) base = base.replace(/\/$/, '') + '/chat/completions';
    var headers = { 'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (cfg.ofmKey || (CFG.ofm && CFG.ofm.key) || '') };
    if (!cfg.ofmKey && !(CFG.ofm && CFG.ofm.key)) throw new Error('本机免费模型网关未配置 Key');

    /* 多模态：上传图片（试卷 / 笔记 / 作文手写稿）时，把最后一条用户消息的文本与图片
       合并为 content 数组，并强制走视觉模型（纯文本模型处理不了图片）。
       视觉模型默认 nvidia/nemotron-3.5-super-vl:free（实测稳定支持 image_url）。 */
    var useVision = !!(o.images && o.images.length);
    var model = useVision
      ? (o.model || cfg.ofmVisionModel || 'nvidia/nemotron-3.5-super-vl:free')
      : (o.model || cfg.ofmModel || 'combo:auto-free');
    var msgs = [{ role: 'system', content: o.system }].concat(o.messages || []);
    if (useVision) {
      var last = msgs[msgs.length - 1];
      var text = (last && last.role === 'user' && typeof last.content === 'string') ? last.content : '';
      var content = [{ type: 'text', text: text }];
      o.images.forEach(function (img) { content.push({ type: 'image_url', image_url: { url: img } }); });
      msgs[msgs.length - 1] = { role: 'user', content: content };
    }
    return fetch(base, {
      method: 'POST', headers: headers, signal: o.signal,
      body: JSON.stringify({ model: model, stream: true, messages: msgs })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        var msg = '大模型请求失败：HTTP ' + r.status;
        try { var j = JSON.parse(t); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
        throw new Error(msg);
      });
      /* 只展示最终回答（content）；思考链 reasoning 仅在该模型完全没回 content 时兜底，
         避免把英文 thinking trace 混进高中生的答案里。 */
      return readOfmSSE(r.body, o.onDelta);
    });
  }
  /* 探测 ofm 在线状态 + 拉模型清单（带 2.5s 超时，绝不卡启动；结果缓存 60s） */
  function detectOfm() {
    var now = Date.now();
    if (OFM_CACHE.at && now - OFM_CACHE.at < 60000) {
      return Promise.resolve({ online: OFM_CACHE.online, models: OFM_CACHE.models, cached: true });
    }
    var url = (CFG.ofm && CFG.ofm.modelsUrl) || 'http://127.0.0.1:18900/v1/models';
    var key = (CFG.ofm && CFG.ofm.key) || '';
    var ctrl = new AbortController(), to = setTimeout(function () { ctrl.abort(); }, 2500);
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + key }, signal: ctrl.signal })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (j) {
        clearTimeout(to);
        var ms = (j.data || []).map(function (m) { return m.id; })
          .filter(function (id) { return !/image|wanx/i.test(id); });   // 排除画图模型
        if (ms.indexOf('combo:auto-free') < 0) ms.unshift('combo:auto-free');
        OFM_CACHE = { online: true, models: ms, at: Date.now() };
        return { online: true, models: ms, cached: false };
      })
      .catch(function () {
        clearTimeout(to);
        OFM_CACHE = { online: false, models: OFM_CACHE.models, at: Date.now() };
        return { online: false, models: OFM_CACHE.models, cached: false };
      });
  }

  /* ======================================================================
   * B1 · 云端免费模型代理
   * 前端只发 OpenAI 兼容请求到云端代理，服务商 Key 全在代理的环境变量里。
   * 代理负责：模型白名单（只允许 :free / combo:auto-free）、Origin 白名单、
   * 限流、自动路由绕开单模型限流。前端零 Key、零费用、零本机依赖。
   * ==================================================================== */
  var FREE_CACHE = { online: null, models: null, at: 0 };
  function freeHeaders(cfg) {
    var h = { 'Content-Type': 'application/json' };
    if (cfg.freeToken) h['X-ZS-Token'] = cfg.freeToken;
    return h;
  }
  /* 双云：同源页面（WorkBuddy 站点）自带 __wb_rsc cookie；跨域副本（GitHub Pages、
     本地预览）没有 cookie，必须把公开分享码挂在查询串上，网关才放行。
     见 站/data/cloud-config.js 的 freeProxy.shareQuery。 */
  function freeEndpoint(cfg, path) {
    var base = String(cfg.freeUrl || '').replace(/\/$/, '');
    if (!base) throw new Error('还没配置云端免费模型代理地址（在「全站设置」里填）');
    var q = (CFG.freeProxy && CFG.freeProxy.shareQuery) || '';
    if (q) {
      try {
        if (typeof location !== 'undefined' && new URL(base).origin !== location.origin) return base + path + q;
      } catch (e) { /* 老浏览器不支持 URL：退回不带参数，仍可由 cookie 放行 */ }
    }
    return base + path;
  }
  function freeChat(cfg, o) {
    var useVision = !!(o.images && o.images.length);
    /* 隐私默认：云端代理不接收图片。试卷照片可能含姓名/学号，保持文件不出本机。 */
    if (useVision && !(CFG.freeProxy && CFG.freeProxy.allowCloudVision)) {
      throw new Error('云端代理默认不接收图片（文件不出本机）；如需云端面批，请把 cloud-config.js 的 freeProxy.allowCloudVision 改为 true');
    }
    var model = useVision
      ? (o.model || cfg.freeVisionModel || 'nvidia/nemotron-3.5-super-vl:free')
      : (o.model || cfg.freeModel || 'combo:auto-free');
    var msgs = [{ role: 'system', content: o.system }].concat(o.messages || []);
    if (useVision) {
      var last = msgs[msgs.length - 1];
      var text = (last && last.role === 'user' && typeof last.content === 'string') ? last.content : '';
      var content = [{ type: 'text', text: text }];
      o.images.forEach(function (img) { content.push({ type: 'image_url', image_url: { url: img } }); });
      msgs[msgs.length - 1] = { role: 'user', content: content };
    }
    return fetch(freeEndpoint(cfg, '/v1/chat/completions'), {
      method: 'POST', headers: freeHeaders(cfg), signal: o.signal,
      body: JSON.stringify({ model: model, stream: true, messages: msgs })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        var msg = '云端免费模型请求失败：HTTP ' + r.status;
        try { var j = JSON.parse(t); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
        throw new Error(msg);
      });
      /* 部分免费推理模型只回 reasoning，captureReasoning=true 兜底，避免空答案 */
      return readSSE(r.body, o.onDelta, true);
    });
  }
  /* 探测云端代理在线状态 + 拉可用免费模型（3s 超时，结果缓存 60s） */
  function detectFree() {
    var now = Date.now();
    if (FREE_CACHE.at && now - FREE_CACHE.at < 60000) {
      return Promise.resolve({ online: FREE_CACHE.online, models: FREE_CACHE.models, cached: true });
    }
    var c = LocalLLM.config();
    var base = String(c.freeUrl || '').replace(/\/$/, '');
    if (!base) {
      FREE_CACHE = { online: false, models: null, at: Date.now() };
      return Promise.resolve({ online: false, models: null });
    }
    var ctrl = new AbortController(), to = setTimeout(function () { ctrl.abort(); }, 3000);
    return fetch(freeEndpoint(c, '/v1/models'), { headers: freeHeaders(c), signal: ctrl.signal })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (j) {
        clearTimeout(to);
        var ms = (j.data || []).map(function (m) { return m.id || m.name; }).filter(Boolean);
        FREE_CACHE = { online: true, models: ms, at: Date.now() };
        return { online: true, models: ms, cached: false };
      })
      .catch(function () {
        clearTimeout(to);
        FREE_CACHE = { online: false, models: FREE_CACHE.models, at: Date.now() };
        return { online: false, models: FREE_CACHE.models, cached: false };
      });
  }

  var LocalLLM = {
    config: function () {
      var c = {}; try { c = JSON.parse(localStorage.getItem(K_LLM) || '{}'); } catch (e) {}
      var d = defaultLLMConfig();
      return { provider: c.provider || d.provider, base: c.base || d.base, model: c.model || d.model,
               proxyUrl: c.proxyUrl || '', key: c.key || '', hasKey: !!(c.key || c.proxyUrl),
               freeUrl: c.freeUrl || d.freeUrl, freeToken: c.freeToken || d.freeToken,
               freeModel: c.freeModel || d.freeModel, freeVisionModel: c.freeVisionModel || d.freeVisionModel,
               ofmBase: c.ofmBase || d.ofmBase, ofmModelsUrl: c.ofmModelsUrl || d.ofmModelsUrl,
               ofmKey: c.ofmKey || d.ofmKey, ofmModel: c.ofmModel || d.ofmModel,
               ofmVisionModel: c.ofmVisionModel || d.ofmVisionModel };
    },
    setConfig: function (c) {
      if (!LocalAuth.isAdmin()) throw new Error('只有管理员能改全站大模型设置');
      var old = LocalLLM.config();
      localStorage.setItem(K_LLM, JSON.stringify({
        provider: c.provider || old.provider, base: c.base || old.base,
        model: c.model || old.model,
        proxyUrl: c.proxyUrl !== undefined ? c.proxyUrl : old.proxyUrl,
        key: c.key !== undefined ? c.key : old.key,
        freeUrl: c.freeUrl !== undefined ? c.freeUrl : old.freeUrl,
        freeToken: c.freeToken !== undefined ? c.freeToken : old.freeToken,
        freeModel: c.freeModel !== undefined ? c.freeModel : old.freeModel,
        freeVisionModel: c.freeVisionModel !== undefined ? c.freeVisionModel : old.freeVisionModel,
        ofmBase: c.ofmBase !== undefined ? c.ofmBase : old.ofmBase,
        ofmModelsUrl: c.ofmModelsUrl !== undefined ? c.ofmModelsUrl : old.ofmModelsUrl,
        ofmKey: c.ofmKey !== undefined ? c.ofmKey : old.ofmKey,
        ofmModel: c.ofmModel !== undefined ? c.ofmModel : old.ofmModel,
        ofmVisionModel: c.ofmVisionModel !== undefined ? c.ofmVisionModel : old.ofmVisionModel
      }));
    },
    /* 当前通道的在线探测 + 模型清单；页面用它点亮「已就绪」状态与模型下拉 */
    status: function (p) {
      var c = LocalLLM.config();
      var which = p || c.provider;      // 允许设置页在切换下拉时探测「尚未保存」的通道
      return which === 'free' ? detectFree() : detectOfm();
    },
    models: function () {
      var c = LocalLLM.config();
      if (c.provider === 'cloud' && CFG.enabled) return CloudLLM.models();
      if (c.provider === 'free') {
        return detectFree().then(function (s) {
          var ids = (s.online && s.models && s.models.length)
            ? s.models : ((CFG.freeProxy && CFG.freeProxy.models) || ['combo:auto-free']);
          return ids.map(function (id) {
            return { id: id, name: (id === 'combo:auto-free' ? 'combo:auto-free（自动路由·推荐）' : id) + ' · 免费' };
          });
        });
      }
      if (c.provider === 'ofm') {
        return detectOfm().then(function (s) {
          if (s.online && s.models) {
            return s.models.map(function (id) {
              return { id: id, name: (id === 'combo:auto-free' ? 'combo:auto-free（自动路由·推荐）' : id) + ' · 免费' };
            });
          }
          /* 离线或探测失败：给一个可用的默认项，不阻断页面 */
          return [{ id: c.ofmModel || 'combo:auto-free', name: (c.ofmModel || 'combo:auto-free') + ' · 免费（网关离线时不可调）' }];
        });
      }
      return Promise.resolve([{ id: c.model || 'deepseek-chat', name: (c.model || 'deepseek-chat') + '（管理员统一配置）' },
                              { id: 'deepseek-reasoner', name: 'deepseek-reasoner（推理更强，较慢）' }]);
    },
    chat: function (o) {
      var c = LocalLLM.config();
      var p = (o && o.provider) || c.provider;     // 允许调用方强制通道（兜底用）
      if (p === 'cloud' && CFG.enabled) return CloudLLM.chat(o);
      if (p === 'free') return freeChat(c, o);
      if (p === 'ofm') return ofmChat(c, o);
      return deepseekChat(c, o);
    },
    isReady: function () {
      var c = LocalLLM.config();
      if (c.provider === 'cloud' && CFG.enabled) return Promise.resolve(true);
      if (c.provider === 'free') return detectFree().then(function (s) { return !!s.online; });
      if (c.provider === 'deepseek') return Promise.resolve(c.hasKey);
      if (c.provider === 'ofm') return detectOfm().then(function (s) { return !!s.online; });
      return Promise.resolve(false);
    }
  };

  var LocalBackend = {
    mode: 'local',
    init: function () { return engine().then(function (e) { return { mode: 'local', ready: true, storage: e }; }); },
    auth: LocalAuth, db: LocalDB, file: LocalFile, llm: LocalLLM
  };

  /* ======================================================================
   * 云实现（已完整写好，未启用；enabled:false 时连 SDK 都不加载，0 消耗）
   * 严格按官方 SDK 契约：
   *   WorkBuddyCloud.createWorkBuddyCloud({endpoint, publishableKey, oauthRelayBaseUrl})
   *   cloud.auth.* / cloud.database.from().* / cloud.storage.* / cloud.llm.*
   *   - 前端不传 owner_id（DB 用 DEFAULT auth.uid() + RLS）
   *   - 不手写 fetch('/.cloud/**')，不引第二个 client
   *   - LLM 必须 stream:true，messages[0] 必须是 system
   * ==================================================================== */
  var _cloud = null, _cloudPromise = null, _sessionUser = null;

  function loadSdk() {
    if (_cloudPromise) return _cloudPromise;
    /* 多镜像兜底：本机默认 jsdelivr 不通，fastly / npmmirror / unpkg 实测可达，依次试 */
    var list = CFG.sdkCdns || [CFG.sdkCdn];
    _cloudPromise = (function tryOne(i) {
      if (window.WorkBuddyCloud) return Promise.resolve(window.WorkBuddyCloud);
      if (i >= list.length) return Promise.reject(new Error('云 SDK 全部镜像加载失败，检查 data/cloud-config.js 的 sdkCdns'));
      return new Promise(function (resolve) {
        var done = false;
        function finish(v) { if (!done) { done = true; resolve(v); } }
        var s = document.createElement('script'); s.src = list[i];
        s.onload = function () { finish(!!window.WorkBuddyCloud); };
        s.onerror = function () { finish(false); };
        document.head.appendChild(s);
        setTimeout(function () { finish(!!window.WorkBuddyCloud); }, 8000);
      }).then(function (ok) { return ok ? window.WorkBuddyCloud : tryOne(i + 1); });
    })(0).then(function (W) {
      if (!CFG.endpoint || !CFG.publishableKey) throw new Error('云配置未填：endpoint / publishableKey 必须来自 publicConfig');
      _cloud = W.createWorkBuddyCloud({
        endpoint: CFG.endpoint,
        publishableKey: CFG.publishableKey,
        oauthRelayBaseUrl: CFG.oauthRelayBaseUrl || ''
      });
      return _cloud;
    });
    return _cloudPromise;
  }
  function unwrap(res) { if (res && res.error) throw new Error(res.error.message || '云端请求失败'); return res ? res.data : null; }
  function cfgTable() { return 'admin_config'; }
  function rowsTable() { return 'zs_rows'; }

  /* 云表 zs_rows 是通用 KV：业务对象原样放 data(JSONB)，id 沿用业务层生成的字符串。
     这样无论以后加什么功能，都不用改表结构。 */
  function fromRow(r) { return Object.assign({}, r.data || {}, { id: r.id, ns: r.ns, createdAt: r.created_at }); }
  function toRow(ns, row) {
    var d = Object.assign({}, row);
    delete d.id; delete d.ns; delete d.owner; delete d.updatedAt; delete d.createdAt;
    return { id: row.id || uid(), ns: ns, data: d };
  }

  var CloudAuth = {
    sendOtp: function (account) {
      return loadSdk().then(function (c) { return c.auth.sendOtp({ email: account }); })
        .then(function (r) {
          var d = unwrap(r) || {};
          return { needOtp: true, verificationId: d.verificationId || d.verification_id || '',
                   isExistingUser: !!d.isExistingUser };
        });
    },
    signUp: function (o) {
      if (!o.otpToken || !o.verificationId) {
        var err = new Error('邮箱验证码还没填'); err.code = 'ZS_NEED_OTP'; throw err;
      }
      return loadSdk().then(function (c) {
        return c.auth.verifyOtp({
          email: o.account, verificationId: o.verificationId,
          isExistingUser: !!o.isExistingUser, token: o.otpToken,
          password: o.isExistingUser ? undefined : o.secret   // 新用户才设密码
        });
      }).then(function (r) {
        var d = unwrap(r) || {}, su = (d.session && d.session.user) || d.user || {};
        var u = { id: su.id || uid(), account: o.account, name: o.name || o.account,
                  role: 'student', localDir: 'accounts/' + o.account,
                  createdAt: new Date().toISOString() };
        /* 首个注册者自动成为管理员：查 profiles 是否已有数据 */
        return _cloud.database.from('profiles').select('id', { count: 'exact', head: true })
          .then(function (cnt) {
            if (!cnt.data && (!cnt.count || cnt.count === 0)) u.role = 'admin';
            return _cloud.database.from('profiles').upsert({
              id: u.id, account: u.account, name: u.name, role: u.role,
              local_dir: u.localDir, created_at: u.createdAt
            }).then(function (w) { unwrap(w); _sessionUser = u; return u; });
          });
      });
    },
    signIn: function (o) {
      return loadSdk().then(function (c) { return c.auth.signInWithPassword({ email: o.account, password: o.secret }); })
        .then(function (r) {
          var d = unwrap(r) || {}, su = (d.session && d.session.user) || d.user || {};
          if (!su.id) throw new Error('登录失败：没有拿到会话');
          return _cloud.database.from('profiles').select('*').eq('id', su.id).maybeSingle()
            .then(function (p) {
              var row = p && p.data;
              _sessionUser = row
                ? { id: row.id, account: row.account, name: row.name, role: row.role,
                    localDir: row.local_dir, createdAt: row.created_at }
                : { id: su.id, account: su.email || o.account, name: su.name || o.account,
                    role: 'student', localDir: 'accounts/' + o.account, createdAt: new Date().toISOString() };
              return _sessionUser;
            });
        });
    },
    signOut: function () { return loadSdk().then(function (c) { return c.auth.signOut(); }).then(function () { _sessionUser = null; }); },
    current: function () {
      if (_sessionUser) return _sessionUser;
      return loadSdk().then(function (c) { return c.auth.getSession(); }).then(function (r) {
        var d = unwrap(r) || {}, su = (d && d.user) || (d.session && d.session.user);
        if (!su || !su.id) return null;
        return _cloud.database.from('profiles').select('*').eq('id', su.id).maybeSingle()
          .then(function (p) {
            var row = p && p.data;
            _sessionUser = row
              ? { id: row.id, account: row.account, name: row.name, role: row.role,
                  localDir: row.local_dir, createdAt: row.created_at }
              : { id: su.id, account: su.email || '', name: su.name || '', role: 'student',
                  localDir: '', createdAt: '' };
            return _sessionUser;
          });
      }).catch(function () { return null; });
    },
    users: function () {
      return loadSdk().then(function () {
        return _cloud.database.from('profiles').select('*').order('created_at', { ascending: true });
      }).then(function (r) {
        var rows = unwrap(r) || [];
        return rows.map(function (x) {
          return { id: x.id, account: x.account, name: x.name, role: x.role,
                   localDir: x.local_dir, createdAt: x.created_at };
        });
      });
    },
    isAdmin: function () {
      return Promise.resolve(CloudAuth.current()).then(function (u) { return !!u && u.role === 'admin'; });
    }
  };

  var CloudDB = {
    all: function (ns) { return CloudDB.query(ns, function () { return true; }); },
    /* 云端没有 owner 隔离（由 RLS 在服务端做），adminAll 与 all 行为一致 */
    adminAll: function (ns) { return CloudDB.all(ns); },
    get: function (ns, id) {
      return loadSdk().then(function () {
        return _cloud.database.from(rowsTable()).select('*').eq('id', id).eq('ns', ns).maybeSingle();
      }).then(function (r) { var d = unwrap(r); return d ? fromRow(d) : null; });
    },
    put: function (ns, row) {
      return loadSdk().then(function () {
        var r = toRow(ns, row);
        return _cloud.database.from(rowsTable()).upsert(r).select().then(function (w) {
          var d = unwrap(w);
          return Object.assign({}, row, { id: r.id, ns: ns });
        });
      });
    },
    /* 教师端专用：写入时显式带 owner_id（目标学生）。
       ⚠️ 云端 RLS 默认 owner_id = auth.uid()，管理员要写他人 owner_id 需在
       《切云 Runbook》的 RLS 里额外放行 teacher_comments 这个 ns；当前 enabled:false
       未启用云模式，本地链路不受影响。若被 RLS 拒绝，教师端会给出明确报错。 */
    putFor: function (ns, row, ownerId) {
      if (!ownerId) throw new Error('缺少目标账号');
      return loadSdk().then(function () {
        var r = toRow(ns, row); r.owner_id = ownerId;
        return _cloud.database.from(rowsTable()).upsert(r).select().then(function () {
          return Object.assign({}, row, { id: r.id, ns: ns });
        });
      });
    },
    query: function (ns, fn) {
      return loadSdk().then(function () {
        return _cloud.database.from(rowsTable()).select('*').eq('ns', ns);
      }).then(function (r) {
        var rows = unwrap(r) || [], out = [];
        rows.forEach(function (x) {
          var o = fromRow(x);
          try { if (fn(o)) out.push(o); } catch (e) { /* 忽略坏行 */ }
        });
        return out;
      });
    },
    remove: function (ns, id) {
      return loadSdk().then(function () {
        return _cloud.database.from(rowsTable()).delete().eq('id', id).eq('ns', ns).select();
      }).then(function (r) { return (unwrap(r) || []).length > 0; });
    },
    /* 云端删除由 RLS 决定；教师能否删他人 owner 的行取决于 RLS 配置 */
    adminRemove: function (ns, id) { return CloudDB.remove(ns, id); },
    exportAll: function () {
      return loadSdk().then(function () {
        return _cloud.database.from(rowsTable()).select('*');
      }).then(function (r) {
        var rows = unwrap(r) || [];
        return Promise.resolve(CloudAuth.users()).catch(function () { return []; }).then(function (users) {
          return JSON.stringify({ app: '中山一号', version: 1, exportedAt: new Date().toISOString(),
                                 users: users, rows: rows.map(fromRow) }, null, 2);
        });
      });
    },
    importAll: function (json) {
      var data = JSON.parse(json);
      if (data.app !== '中山一号') throw new Error('不是中山一号的备份文件');
      var rows = (data.rows || []).map(function (r) { return toRow(r.ns || 'misc', r); });
      if (!rows.length) return { count: 0 };
      return loadSdk().then(function () {
        return _cloud.database.from(rowsTable()).upsert(rows).select();
      }).then(function (r) { return { count: (unwrap(r) || []).length }; });
    }
  };

  function safeName(n) { return String(n).replace(/[^0-9A-Za-z._\-\u4e00-\u9fa5]/g, '_'); }

  var CloudFile = {
    _path: function (name) {
      return loadSdk().then(function (c) {
        return c.auth.getSession();
      }).then(function (r) {
        var d = unwrap(r) || {}, su = (d && d.user) || (d.session && d.session.user) || {};
        if (!su.id) throw new Error('请先登录再操作文件');
        return _cloud.storage.userPath(su.id, 'notes/' + safeName(name));
      });
    },
    put: function (name, blob, m) {
      return CloudFile._path(name).then(function (p) {
        return _cloud.storage.upload(p, blob, { contentType: blob.type || 'application/octet-stream',
                                                upsert: true, metadata: { note: (m && m.note) || '' } });
      }).then(function (r) {
        unwrap(r);
        return { name: name, size: blob.size, type: blob.type, at: new Date().toISOString(),
                 note: (m && m.note) || '' };
      });
    },
    get: function (name) {
      return CloudFile._path(name).then(function (p) { return _cloud.storage.download(p); })
        .then(function (r) {
          /* SDK 不同版本可能直接给 Blob，也可能给 {data,error}，两种都兼容 */
          if (r && r instanceof Blob) return r;
          var d = unwrap(r);
          return d && d.data !== undefined ? d.data : d;
        });
    },
    list: function () {
      return loadSdk().then(function (c) { return c.auth.getSession(); }).then(function (r) {
        var d = unwrap(r) || {}, su = (d && d.user) || (d.session && d.session.user) || {};
        if (!su.id) return [];
        return _cloud.storage.list('users/' + su.id + '/notes', { limit: 200 }).then(function (l) {
          var raw = (l && typeof l === 'object' && 'data' in l && 'error' in l) ? unwrap(l) : l;
          var rows = raw || [];
          return (Array.isArray(rows) ? rows : (rows.items || rows.objects || [])).map(function (x) {
            return { name: String(x.name || x.key || '').split('/').pop(),
                     size: x.size || 0, type: x.contentType || x.content_type || '',
                     at: x.createdAt || x.created_at || '', note: '' };
          });
        });
      });
    },
    remove: function (name) {
      return CloudFile._path(name).then(function (p) { return _cloud.storage.remove([p]); })
        .then(function (r) { unwrap(r); return true; });
    },
    /* 云端没有本机目录概念，返回明确说明；业务层按 ok:false 渲染提示，不报错。 */
    bindLocalDir: function () {
      return { ok: false, label: '云端模式不绑定本机目录（文件存在你的云空间）' };
    },
    localPath: function () {
      return Promise.resolve(CloudAuth.current()).then(function (u) {
        return u ? (u.localDir || 'accounts/' + u.account) : '';
      });
    },
    /* 云端「同步到本机」= 触发浏览器下载到本机默认下载目录，行为可用。 */
    syncToLocal: function (name) {
      return CloudFile.get(name).then(function (blob) {
        if (!blob) return false;
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        return true;
      });
    }
  };

  var _llmCache = null, _llmCacheAt = 0;
  var CloudLLM = {
    config: function () {
      /* 云版配置查表会计 API 调用次数，缓存 60 秒；setConfig 立即失效 */
      if (_llmCache && Date.now() - _llmCacheAt < 60000) return Promise.resolve(_llmCache);
      return loadSdk().then(function () {
        return _cloud.database.from(cfgTable()).select('*').eq('key', 'llm').maybeSingle();
      }).then(function (r) {
        var d = unwrap(r), c = d && d.value ? d.value : {};
        var def = defaultLLMConfig();
        /* 本地阶段管理员填的配置自动迁移上云，避免切云后重新填一遍 Key */
        var local = {}; try { local = JSON.parse(localStorage.getItem(K_LLM) || '{}'); } catch (e) {}
        var merged = {
          provider: c.provider || local.provider || def.provider,
          base: c.base || local.base || def.base,
          model: c.model || local.model || def.model,
          proxyUrl: c.proxyUrl || local.proxyUrl || '',
          key: c.key || local.key || ''
        };
        merged.hasKey = !!(merged.key || merged.proxyUrl);
        _llmCache = merged; _llmCacheAt = Date.now();
        return merged;
      }).catch(function () { return LocalLLM.config(); });
    },
    setConfig: function (c) {
      return Promise.resolve(CloudAuth.isAdmin()).then(function (ok) {
        if (!ok) throw new Error('只有管理员能改全站大模型设置');
        return CloudLLM.config();
      }).then(function (old) {
        var v = { provider: c.provider || old.provider, base: c.base || old.base,
                  model: c.model || old.model,
                  proxyUrl: c.proxyUrl !== undefined ? c.proxyUrl : old.proxyUrl,
                  key: c.key !== undefined ? c.key : old.key };
        _llmCache = null; _llmCacheAt = 0;
        return _cloud.database.from(cfgTable()).upsert({ key: 'llm', value: v }).select()
          .then(function (r) { unwrap(r); return v; });
      });
    },
    models: function () {
      return CloudLLM.config().then(function (cfg) {
        if (cfg.provider !== 'cloud') {
          return [{ id: cfg.model, name: cfg.model + '（管理员统一配置）' },
                  { id: 'deepseek-reasoner', name: 'deepseek-reasoner（推理更强，较慢）' }];
        }
        return loadSdk().then(function () { return _cloud.llm.models.list(); }).then(function (list) {
          var arr = Array.isArray(list) ? list : (list && list.data) || [];
          return arr.filter(function (m) { return m.disabled !== true; })
                    .map(function (m) { return { id: m.id, name: m.name || m.id }; });
        });
      });
    },
    chat: function (o) {
      return CloudLLM.config().then(function (cfg) {
        /* 允许调用方强制通道（本地兜底跳云端时用）；否则按云端配置 */
        var p = (o && o.provider) || cfg.provider;
        /* 默认 DeepSeek 通道：与本地实现完全同一段代码，行为 100% 一致，不耗云 Token 点数 */
        if (p !== 'cloud') return deepseekChat(cfg, o);

        /* 可选：WorkBuddy 免密钥大模型。严格 stream:true + messages[0]=system */
        return loadSdk().then(function () { return _cloud.llm.models.list(); }).then(function (list) {
          var arr = Array.isArray(list) ? list : (list && list.data) || [];
          var m = arr.find(function (x) { return x.disabled !== true; });
          if (!m) throw new Error('云端当前没有可用模型');
          /* for-await 是 SDK 官方推荐的消费方式；包装成 async 函数以对齐 Promise 契约 */
          return (async function () {
            var stream = _cloud.llm.chat.completions.create({
              model: o.model || m.id,
              messages: [{ role: 'system', content: o.system }].concat(o.messages || []),
              stream: true,
              stream_options: { include_usage: true },
              signal: o.signal
            });
            var full = '';
            for await (var chunk of stream) {
              var t = chunk && chunk.choices && chunk.choices[0] &&
                      chunk.choices[0].delta && chunk.choices[0].delta.content;
              if (t) { full += t; if (o.onDelta) o.onDelta(t); }
            }
            return full;
          })();
        });
      });
    }
  };

  var CloudBackend = {
    mode: 'cloud',
    init: function () {
      return loadSdk().then(function () { return { mode: 'cloud', ready: true }; });
    },
    auth: CloudAuth, db: CloudDB, file: CloudFile, llm: CloudLLM
  };

  window.ZSBackend = CFG.enabled ? CloudBackend : LocalBackend;
  window.ZSBackend_LOCAL = LocalBackend;
  window.ZSBackend_CLOUD = CloudBackend;
})();
