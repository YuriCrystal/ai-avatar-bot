/* =====================================================================
 * embed.js — AI 虛擬人嵌入載入器
 * 用法：在任何網站貼一行（跨網站請用部署後的完整網址）：
 *   <script src="https://YOUR-DEPLOY.example/embed.js"></script>
 *   同網域可用： <script src="embed.js" data-widget="widget.html"></script>
 *
 * 建立右下角 iframe（裝虛擬人）+ 收合泡泡，用 postMessage 與 iframe 溝通，
 * 並開好 microphone 權限。對外提供 window.AvatarWidget = { open, close, say }。
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
  // 桌機預設展開；手機預設收合，仍可用 data-open="true|false" 明確覆蓋。
  var startOpen = openAttr === 'true' || (openAttr !== 'false' && !narrowScreen);
  var widgetOrigin = (function () { try { return new URL(widgetUrl, location.href).origin; } catch (e) { return '*'; } })();

  // 把可設定項帶進 widget：皮=model / 肉的語音後端=api / 內容=knowledge / 聲線=voice
  var cfg = new URLSearchParams();
  ['model', 'vrm', 'api', 'knowledge', 'voice', 'ollama', 'llmmodel', 'fit', 'mode'].forEach(function (k) {
    var v = me && me.getAttribute('data-' + k);
    if (v) cfg.set(k, v);
  });
  var cfgQs = cfg.toString();
  var iframeSrc = widgetUrl + (cfgQs ? (widgetUrl.indexOf('?') < 0 ? '?' : '&') + cfgQs : '');

  var EXPANDED = { w: 340, h: 480 };
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

  function ensureIframe() {
    if (iframeLoaded) return;
    iframeLoaded = true;
    iframe.src = iframeSrc; // 第一次展開才真正下載 widget、角色與渲染引擎
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
      root.style.width = 'min(' + EXPANDED.w + 'px, calc(100vw - 32px))';
      root.style.height = 'min(' + EXPANDED.h + 'px, calc(100dvh - 24px))';
      iframe.style.display = 'block';
      bubble.style.display = 'none';
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
    ask: function (text) { postMsg('ask', text); }    // 幫使用者問一個問題（跑檢索/大腦、像使用者自己問）
  };
})();
