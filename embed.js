/* =====================================================================
 * embed.js — AI 虛擬人嵌入載入器
 * 用法：在任何網站貼一行（跨網站請用部署後的完整網址）：
 *   <script src="https://YOUR-DEPLOY.example/embed.js"></script>
 *   同網域可用： <script src="embed.js" data-widget="widget.html"></script>
 *
 * 建立右下角 iframe（裝虛擬人）+ 收合泡泡，用 postMessage 與 iframe 溝通，
 * 並開好 microphone 權限。對外提供 window.AvatarWidget API。
 * ===================================================================== */
(function () {
  'use strict';

  // 注入收合泡泡的 hover / 注意力 pulse 動畫
  var awStyle = document.createElement('style');
  awStyle.textContent =
    '#avatar-widget-root .aw-bubble{transition:transform .15s, box-shadow .15s;}'
    + '#avatar-widget-root .aw-bubble:hover{transform:scale(1.07);}'
    + '#avatar-widget-root .aw-bubble:active{transform:scale(.95);}'
    + '#avatar-widget-root .aw-bubble:focus-visible{outline:3px solid rgba(91,84,232,.45);outline-offset:3px;}'
    + '#avatar-widget-root .aw-bubble::after{content:"";position:absolute;inset:0;border-radius:50%;animation:awpulse 2.2s ease-out infinite;pointer-events:none;}'
    + '@keyframes awpulse{0%{box-shadow:0 0 0 0 rgba(91,84,232,.5);}70%{box-shadow:0 0 0 13px rgba(91,84,232,0);}100%{box-shadow:0 0 0 0 rgba(91,84,232,0);}}'
    + '@media(prefers-reduced-motion:reduce){#avatar-widget-root .aw-bubble,#avatar-widget-root .aw-bubble::after{animation:none!important;transition:none!important;}}';
  (document.head || document.documentElement).appendChild(awStyle);

  // 1) 找出自己的位置，推算 widget.html 的網址（可用 data-widget 覆蓋）
  var me = document.currentScript || (function () {
    var ss = document.getElementsByTagName('script');
    for (var i = ss.length - 1; i >= 0; i--) { if (/embed\.js(\?|$)/.test(ss[i].src || '')) return ss[i]; }
    return null;
  })();
  var base = me ? me.src.replace(/[^/]*$/, '') : '';
  var widgetUrl = (me && me.getAttribute('data-widget')) || (base + 'widget.html');
  var openAttr = me && me.getAttribute('data-open');
  var narrowScreen = !!(window.matchMedia && window.matchMedia('(max-width:640px)').matches);
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  // 桌機預設展開；手機預設收合，仍可用 data-open="true|false" 明確覆蓋。
  var startOpen = openAttr === 'true' || (openAttr !== 'false' && !narrowScreen);
  var widgetOrigin = (function () { try { return new URL(widgetUrl, location.href).origin; } catch (e) { return '*'; } })();

  // 把可設定項帶進 widget：皮=model / 肉的語音後端=api / 內容=knowledge / 聲線=voice
  var cfg = new URLSearchParams();
  var explicitCfg = Object.create(null);
  ['model', 'vrm', 'api', 'knowledge', 'analytics', 'handoff', 'voice', 'ollama', 'llmmodel', 'fit', 'zoom', 'look', 'mode', 'engine', 'lang', 'brand', 'name', 'welcome', 'greeting', 'fallback', 'suggestions', 'site', 'sitekey'].forEach(function (k) {
    var v = me && me.getAttribute('data-' + k);
    if (v) { cfg.set(k, v); explicitCfg[k] = true; }
  });
  // 可另外提供輕量 2D 模型；手機窄螢幕或開啟省流量模式時自動使用。
  var mobileModel = me && me.getAttribute('data-model-mobile');
  if (mobileModel && (narrowScreen || saveData)) {
    cfg.set('model', mobileModel);
    explicitCfg.model = true;
  }
  // 自訂模型不存在或載入失敗時，切換到合法的公開範例角色。
  var fallbackModel = me && me.getAttribute('data-fallback-model');
  if (fallbackModel) {
    cfg.set('fallbackmodel', fallbackModel);
    explicitCfg.fallbackmodel = true;
  }
  // 公開文件使用 data-site-key；保留舊 data-sitekey 僅供向下相容。
  var documentedSiteKey = me && me.getAttribute('data-site-key');
  if (documentedSiteKey) { cfg.set('sitekey', documentedSiteKey); explicitCfg.sitekey = true; }
  var configAttr = me && me.getAttribute('data-config');
  function endpointSite(value) {
    try {
      var site = new URL(value, new URL(widgetUrl, location.href)).searchParams.get('site') || '';
      return /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(site) ? site.toLowerCase() : '';
    } catch (e) { return ''; }
  }
  if (!cfg.get('site')) {
    [configAttr, cfg.get('knowledge'), cfg.get('analytics'), cfg.get('handoff'), me && me.getAttribute('data-leads')].some(function (value) {
      var site = value && endpointSite(value);
      if (!site) return false;
      cfg.set('site', site);
      return true;
    });
  }

  function iframeSrc() {
    var cfgQs = cfg.toString();
    return widgetUrl + (cfgQs ? (widgetUrl.indexOf('?') < 0 ? '?' : '&') + cfgQs : '');
  }

  var EXPANDED = { w: 340, h: 480 };
  var widthAttr = me && me.getAttribute('data-width');
  var heightAttr = me && me.getAttribute('data-height');
  var explicitWidth = widthAttr ? Number(widthAttr) : NaN;
  var explicitHeight = heightAttr ? Number(heightAttr) : NaN;
  if (Number.isFinite(explicitWidth)) EXPANDED.w = Math.max(280, Math.min(Math.round(explicitWidth), 480));
  if (Number.isFinite(explicitHeight)) EXPANDED.h = Math.max(380, Math.min(Math.round(explicitHeight), 720));
  var NS_OUT = 'avatar-widget-host'; // 父 → 子
  var NS_IN  = 'avatar-widget';      // 子 → 父

  // 2) 建外層容器
  var root = document.createElement('div');
  root.id = 'avatar-widget-root';
  root.style.cssText = [
    'position:fixed', 'right:max(12px,env(safe-area-inset-right))', 'bottom:max(12px,env(safe-area-inset-bottom))',
    'z-index:2147483000', 'max-width:calc(100vw - 32px)', 'max-height:calc(100dvh - 24px)'
  ].join(';');

  // 3) iframe（虛擬人本體）
  var iframe = document.createElement('iframe');
  iframe.title = 'AI 虛擬人助理';                 // 無障礙：給 iframe 一個名字
  iframe.setAttribute('allow', 'microphone; autoplay'); // 語音輸入 + 音訊播放
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = 'width:100%;height:100%;border:0;background:transparent;color-scheme:normal;';
  var iframeLoaded = false;
  var widgetReady = false;
  var pendingMessages = [];
  var toolRegistry = Object.create(null);
  var toolExecutions = Object.create(null);
  var eventListeners = Object.create(null);

  function safeContext(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    var out = {};
    Object.keys(value).slice(0, 30).forEach(function (key) {
      var safeKey = String(key).slice(0, 60);
      var v = value[key];
      if (v == null || typeof v === 'boolean' || typeof v === 'number') out[safeKey] = v;
      else if (typeof v === 'string') out[safeKey] = v.slice(0, 800);
      else if (Array.isArray(v)) out[safeKey] = v.slice(0, 20).map(function (x) { return String(x).slice(0, 160); });
    });
    return out;
  }

  var pageContext = safeContext({
    title: document.title || '',
    url: location.origin + location.pathname,
    description: (document.querySelector('meta[name="description"]') || {}).content || ''
  });

  function safeToolSchema(schema) {
    if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') return { type:'object', properties:{}, required:[] };
    var properties = {};
    Object.keys(schema.properties).slice(0, 20).forEach(function (name) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(name)) return;
      var raw = schema.properties[name] || {};
      var property = {
        type:/^(string|number|integer|boolean)$/.test(raw.type) ? raw.type : 'string',
        title:String(raw.title || name).slice(0, 80), description:String(raw.description || '').slice(0, 160),
        contextKey:String(raw.contextKey || '').slice(0, 60), format:/^(email|url|phone|contact)$/.test(raw.format) ? raw.format : '',
        prefixes:Array.isArray(raw.prefixes) ? raw.prefixes.slice(0, 8).map(function (item) { return String(item).slice(0, 30); }) : [],
        maxLength:Math.max(1, Math.min(Number(raw.maxLength) || 300, 1000))
      };
      if (Array.isArray(raw.enum)) property.enum = raw.enum.slice(0, 20).map(function (item) { return String(item).slice(0, 80); });
      if (Number.isFinite(Number(raw.minimum))) property.minimum = Number(raw.minimum);
      if (Number.isFinite(Number(raw.maximum))) property.maximum = Number(raw.maximum);
      properties[name] = property;
    });
    return { type:'object', properties:properties, required:Array.isArray(schema.required) ? schema.required.filter(function (name) { return properties[name]; }).slice(0, 20) : [] };
  }

  function validateToolArgs(schema, value) {
    schema = safeToolSchema(schema); value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var args = {}, errors = [];
    Object.keys(schema.properties).forEach(function (name) {
      if (value[name] == null || value[name] === '') return;
      var property = schema.properties[name], item = value[name];
      if (property.type === 'integer' && !Number.isInteger(Number(item))) { errors.push(name + ' 必須是整數'); return; }
      if (property.type === 'number' && !Number.isFinite(Number(item))) { errors.push(name + ' 必須是數字'); return; }
      if (property.type === 'boolean' && typeof item !== 'boolean') { errors.push(name + ' 必須是布林值'); return; }
      if (property.type === 'number' || property.type === 'integer') {
        item = Number(item);
        if (property.minimum != null && item < property.minimum) errors.push(name + ' 小於允許範圍');
        if (property.maximum != null && item > property.maximum) errors.push(name + ' 超過允許範圍');
      } else if (property.type === 'string') {
        item = String(item).slice(0, property.maxLength);
        if (property.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) errors.push(name + ' 電子郵件格式無效');
        if (property.format === 'url' && !/^https?:\/\//i.test(item)) errors.push(name + ' 網址格式無效');
        if (property.format === 'phone' && !/(?:\d[^\d]*){8,18}/.test(item)) errors.push(name + ' 電話格式無效');
        if (property.format === 'contact' && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item) || /^(?:\+?\d[\s().-]*){8,18}$/.test(item))) errors.push(name + ' 必須是電子郵件或電話');
      }
      if (property.enum && property.enum.indexOf(String(item)) < 0) errors.push(name + ' 不在允許選項內');
      args[name] = item;
    });
    schema.required.forEach(function (name) { if (args[name] == null || args[name] === '') errors.push(name + ' 為必填'); });
    return { ok:errors.length === 0, args:args, errors:errors };
  }

  function toolMetadata() {
    return Object.keys(toolRegistry).map(function (name) {
      var tool = toolRegistry[name];
      return {
        name:name, label:tool.label, description:tool.description, keywords:tool.keywords,
        examples:tool.examples, excludeKeywords:tool.excludeKeywords, priority:tool.priority,
        routeThreshold:tool.routeThreshold, requiresConfirmation:tool.requiresConfirmation, inputSchema:tool.inputSchema
      };
    });
  }

  function syncContextAndTools() {
    sendToWidget({ ns: NS_OUT, type: 'context', context: pageContext });
    sendToWidget({ ns: NS_OUT, type: 'tools', tools: toolMetadata() });
  }

  function emit(name, detail) {
    var list = eventListeners[name] || [];
    list.slice().forEach(function (handler) { try { handler(detail || {}); } catch (e) { console.error('[avatar] event handler error:', e); } });
    var all = eventListeners['*'] || [];
    all.slice().forEach(function (handler) { try { handler({ name: name, detail: detail || {} }); } catch (e) { console.error('[avatar] event handler error:', e); } });
  }

  function applyExpandedSize() {
    if (iframe.style.display === 'none') return;
    root.style.width = 'min(' + EXPANDED.w + 'px, calc(100vw - 32px))';
    root.style.height = 'min(' + EXPANDED.h + 'px, calc(100dvh - 24px))';
  }

  function setRemoteValue(key, value) {
    if (explicitCfg[key] || value == null || value === '') return;
    cfg.set(key, String(value));
  }

  function applyRemoteConfig(remote) {
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return;
    setRemoteValue('model', remote.model2d);
    setRemoteValue('vrm', remote.model3d);
    setRemoteValue('engine', remote.engine);
    setRemoteValue('fit', remote.fit);
    setRemoteValue('voice', remote.voice);
    setRemoteValue('lang', remote.locale);
    setRemoteValue('mode', remote.mode);
    setRemoteValue('brand', remote.brandColor);
    setRemoteValue('name', remote.name);
    setRemoteValue('welcome', remote.welcome);
    setRemoteValue('greeting', remote.greeting);
    setRemoteValue('fallback', remote.fallback);
    if (!explicitCfg.suggestions && Array.isArray(remote.suggestions)) cfg.set('suggestions', JSON.stringify(remote.suggestions.slice(0, 8)));
    if (!Number.isFinite(explicitWidth) && Number.isFinite(Number(remote.width))) EXPANDED.w = Math.max(280, Math.min(Math.round(Number(remote.width)), 480));
    if (!Number.isFinite(explicitHeight) && Number.isFinite(Number(remote.height))) EXPANDED.h = Math.max(380, Math.min(Math.round(Number(remote.height)), 720));
    if (remote.name) iframe.title = String(remote.name).slice(0, 80);
    if (/^#[0-9a-f]{6}$/i.test(remote.brandColor || '')) bubble.style.background = remote.brandColor;
    applyExpandedSize();
  }

  function loadRemoteConfig() {
    if (!configAttr) return Promise.resolve();
    try {
      var target = new URL(configAttr, new URL(widgetUrl, location.href));
      if (widgetOrigin !== '*' && target.origin !== widgetOrigin) throw new Error('角色設定網址必須和 widget 同來源');
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 4000);
      return fetch(target.href, { credentials:'omit', cache:'no-store', signal:controller.signal })
        .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
        .then(applyRemoteConfig)
        .catch(function (error) { console.warn('[avatar] 公開角色設定載入失敗，改用嵌入預設值：', error && error.message || error); })
        .finally(function () { clearTimeout(timeout); });
    } catch (error) {
      console.warn('[avatar] 角色設定網址無效：', error && error.message || error);
      return Promise.resolve();
    }
  }

  function ensureIframe() {
    if (iframeLoaded) return;
    iframeLoaded = true;
    loadRemoteConfig().then(function () {
      iframe.src = iframeSrc(); // 第一次展開才真正下載 widget、角色與渲染引擎
    });
  }

  function sendToWidget(message) {
    if (!widgetReady || !iframe.contentWindow) { pendingMessages.push(message); return; }
    iframe.contentWindow.postMessage(message, widgetOrigin);
  }

  function flushMessages() {
    while (pendingMessages.length && iframe.contentWindow) {
      iframe.contentWindow.postMessage(pendingMessages.shift(), widgetOrigin);
    }
  }

  // 4) 收合後的小泡泡（iframe 收起時顯示，點它再展開）
  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = 'aw-bubble';
  bubble.setAttribute('aria-label', '開啟 AI 虛擬人助理');
  bubble.textContent = '💬';
  bubble.style.cssText = [
    'position:absolute', 'right:2px', 'bottom:2px', 'width:64px', 'height:64px',
    'border:0', 'border-radius:50%', 'cursor:pointer', 'font-size:28px',
    'background:linear-gradient(135deg,#7d78f0,#5b54e8)', 'color:#fff',
    'box-shadow:0 8px 22px rgba(0,0,0,.3)',
    'display:none', 'align-items:center', 'justify-content:center'
  ].join(';');

  root.appendChild(iframe);
  root.appendChild(bubble);
  (document.body || document.documentElement).appendChild(root);

  // 5) 展開 / 收合
  function setOpen(open) {
    if (open) {
      ensureIframe();
      iframe.style.display = 'block';
      bubble.style.display = 'none';
      applyExpandedSize();
    } else {
      root.style.width = '60px';
      root.style.height = '60px';
      iframe.style.display = 'none';
      bubble.style.display = 'flex';
    }
    bubble.setAttribute('aria-expanded', String(open));
    if (iframeLoaded) sendToWidget({ ns: NS_OUT, type: 'visibility', visible: open });
  }
  bubble.onclick = function () { setOpen(true); };
  setOpen(startOpen);

  // 6) 接收 iframe 的訊息（驗證來源 origin）
  window.addEventListener('message', function (e) {
    if (widgetOrigin !== '*' && e.origin !== widgetOrigin) return; // 只收來自自己 widget 的訊息
    if (e.source !== iframe.contentWindow) return;
    var d = e.data || {};
    if (d.ns !== NS_IN) return;
    if (d.type === 'close') setOpen(false);                 // 使用者按 ✕ → 收成泡泡
    if (d.type === 'ready') {
      widgetReady = true;
      flushMessages();
      sendToWidget({ ns: NS_OUT, type: 'visibility', visible: iframe.style.display !== 'none' });
      syncContextAndTools();
    }
    if (d.type === 'event') emit(d.name, d.properties || {});
    if (d.type === 'tool-call') {
      var tool = toolRegistry[d.name];
      if (!tool) {
        sendToWidget({ ns: NS_OUT, type: 'tool-result', callId: d.callId, name: d.name, ok: false, error: '找不到這個網站操作' });
      } else if (toolExecutions[d.name]) {
        sendToWidget({ ns: NS_OUT, type: 'tool-result', callId: d.callId, name: d.name, ok: false, error: '這個操作正在執行，請稍後再試。' });
      } else {
        var input = d.input && typeof d.input === 'object' ? d.input : {};
        var validation = validateToolArgs(tool.inputSchema, input.args);
        if (!validation.ok) {
          sendToWidget({ ns: NS_OUT, type: 'tool-result', callId: d.callId, name: d.name, ok: false, error: validation.errors.join('；') });
          return;
        }
        input.args = validation.args;
        toolExecutions[d.name] = true;
        var startedAt = Date.now();
        var executionController = new AbortController();
        input.signal = executionController.signal;
        var timeout;
        var timeoutPromise = new Promise(function (_, reject) { timeout = setTimeout(function () { executionController.abort(); reject(new Error('操作逾時，請稍後再試。')); }, tool.timeoutMs); });
        Promise.race([Promise.resolve().then(function () { return tool.execute(input); }), timeoutPromise]).then(function (result) {
          var message = typeof result === 'string' ? result : (result && result.message) || '已完成「' + tool.label + '」。';
          sendToWidget({ ns: NS_OUT, type: 'tool-result', callId: d.callId, name: d.name, ok: true, message: String(message).slice(0, 1200), durationMs:Date.now() - startedAt });
        }).catch(function (error) {
          sendToWidget({ ns: NS_OUT, type: 'tool-result', callId: d.callId, name: d.name, ok: false, error: String(error && error.message || error).slice(0, 500), durationMs:Date.now() - startedAt });
        }).finally(function () { clearTimeout(timeout); delete toolExecutions[d.name]; });
      }
    }
    if (d.type === 'error') console.warn('[avatar] widget error:', d.message);
  });

  // 7) 對外 API：別的程式可以叫她說話 / 開關 / 代問一個問題（走大腦回答）
  function postMsg(type, text) {
    setOpen(true);
    sendToWidget({ ns: NS_OUT, type: type, text: String(text || '').slice(0, 600) });
  }
  window.AvatarWidget = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    say: function (text) { postMsg('say', text); },   // 直接唸出這段文字
    ask: function (text) { postMsg('ask', text); },   // 幫使用者問一個問題（跑檢索/大腦、像使用者自己問）
    setContext: function (context) {
      pageContext = safeContext(context);
      sendToWidget({ ns: NS_OUT, type: 'context', context: pageContext });
      return this;
    },
    setLocale: function (locale) {
      sendToWidget({ ns: NS_OUT, type: 'locale', locale: String(locale || '').slice(0, 16) });
      return this;
    },
    setExpression: function (name) {
      sendToWidget({ ns: NS_OUT, type: 'expression', name: String(name || '').slice(0, 24) });
      return this;
    },
    registerTool: function (definition) {
      definition = definition || {};
      var name = String(definition.name || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64);
      if (!name) throw new Error('AvatarWidget.registerTool 需要有效的 name');
      if (typeof definition.execute !== 'function') throw new Error('AvatarWidget.registerTool 需要 execute 函式');
      toolRegistry[name] = {
        label: String(definition.label || name).slice(0, 80),
        description: String(definition.description || '').slice(0, 240),
        keywords: Array.isArray(definition.keywords) ? definition.keywords.slice(0, 20).map(function (k) { return String(k).toLowerCase().slice(0, 60); }) : [],
        examples: Array.isArray(definition.examples) ? definition.examples.slice(0, 20).map(function (item) { return String(item).slice(0, 160); }) : [],
        excludeKeywords: Array.isArray(definition.excludeKeywords) ? definition.excludeKeywords.slice(0, 20).map(function (item) { return String(item).toLowerCase().slice(0, 60); }) : [],
        priority: Math.max(-10, Math.min(Number(definition.priority) || 0, 10)),
        routeThreshold: Math.max(0.15, Math.min(Number(definition.routeThreshold) || 0.34, 0.95)),
        inputSchema: safeToolSchema(definition.inputSchema),
        requiresConfirmation: definition.requiresConfirmation !== false,
        timeoutMs: Math.max(1000, Math.min(Number(definition.timeoutMs) || 12000, 30000)),
        execute: definition.execute
      };
      sendToWidget({ ns: NS_OUT, type: 'tools', tools: toolMetadata() });
      return this;
    },
    unregisterTool: function (name) {
      delete toolRegistry[String(name || '')];
      sendToWidget({ ns: NS_OUT, type: 'tools', tools: toolMetadata() });
      return this;
    },
    setHandoff: function (options) {
      options = options || {};
      var target = String(options.url || '').slice(0, 1200);
      var callback = options.onRequest;
      if (!target && typeof callback !== 'function') throw new Error('AvatarWidget.setHandoff 需要 url 或 onRequest');
      return window.AvatarWidget.registerTool({
        name: 'human_handoff',
        label: String(options.label || '轉接真人客服').slice(0, 80),
        description: '將目前對話交給真人客服處理',
        keywords: Array.isArray(options.keywords) ? options.keywords : ['真人客服', '轉真人', '找客服', '人工客服', '專人服務'],
        requiresConfirmation: options.requiresConfirmation !== false,
        execute: function (input) {
          if (typeof callback === 'function') return callback(input);
          var url = new URL(target, location.href);
          if (!/^https?:$/.test(url.protocol) && !/^(mailto|tel):$/.test(url.protocol)) throw new Error('不支援的客服網址格式');
          if (!options.target || options.target === '_self') location.assign(url.href);
          else window.open(url.href, options.target, 'noopener,noreferrer');
          return options.successMessage || '已為你開啟真人客服。';
        }
      });
    },
    on: function (name, handler) {
      if (typeof handler !== 'function') return this;
      name = String(name || '*');
      (eventListeners[name] || (eventListeners[name] = [])).push(handler);
      return this;
    },
    off: function (name, handler) {
      name = String(name || '*');
      if (!eventListeners[name]) return this;
      eventListeners[name] = eventListeners[name].filter(function (item) { return item !== handler; });
      return this;
    }
  };

  // data-leads 啟用內建詢價／預約工具。資料只會送到宿主網站同來源的端點。
  var leadsAttr = me && me.getAttribute('data-leads');
  if (leadsAttr) {
    try {
      var leadsUrl = new URL(leadsAttr, location.href);
      if (leadsUrl.origin !== location.origin || !/^https?:$/.test(leadsUrl.protocol)) throw new Error('data-leads 必須是宿主網站同來源網址');
      window.AvatarWidget.registerTool({
        name:'lead_capture', label:'留下聯絡資料', description:'送出詢價、合作或預約需求，讓專人後續聯絡',
        keywords:['詢價','報價','預約','聯絡我','請聯絡','業務聯絡','想合作','合作洽談','留下資料'],
        examples:['我想詢價請聯絡我','想預約服務','請業務跟我聯絡','我有合作需求'],
        excludeKeywords:['真人客服','人工客服','轉真人'], priority:3, routeThreshold:0.34, requiresConfirmation:true,
        inputSchema:{ type:'object', properties:{
          name:{ type:'string', title:'姓名或稱呼', prefixes:['我叫','姓名','稱呼'], maxLength:100 },
          contact:{ type:'string', title:'電子郵件或電話', format:'contact', prefixes:['聯絡方式','電子郵件','email','電話'], maxLength:160 },
          company:{ type:'string', title:'公司或單位（選填）', prefixes:['公司','單位'], maxLength:160 },
          request:{ type:'string', title:'詢價或預約需求', prefixes:['需求','想詢問','想預約','合作內容'], maxLength:1200 },
          consent:{ type:'boolean', title:'同意依隱私權政策使用以上資料聯繫', prefixes:['同意'] }
        }, required:['name','contact','request','consent'] },
        execute:async function (input) {
          var args = input.args || {};
          if (args.consent !== true) throw new Error('必須先同意依隱私權政策使用聯絡資料。');
          var headers = { 'Content-Type':'application/json' };
          if (cfg.get('sitekey')) headers['X-Avatar-Site-Key'] = cfg.get('sitekey');
          var response = await fetch(leadsUrl.href, { method:'POST', headers:headers, body:JSON.stringify({
            siteId:leadsUrl.searchParams.get('site') || 'default', name:args.name, contact:args.contact,
            company:args.company || '', request:args.request, consent:true, website:'',
            sourcePage:pageContext.url || '', sourceTitle:pageContext.title || ''
          }), signal:input.signal });
          var result = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(result.error || ('HTTP ' + response.status));
          emit('lead_submitted', { leadId:String(result.leadId || '').slice(0, 60) });
          return result.message || '資料已送出，專人會依你提供的方式聯絡。';
        }
      });
    } catch (error) { console.warn('[avatar] 名單收集端點無效：', error && error.message || error); }
  }
})();
