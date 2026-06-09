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

  // 1) 找出自己的位置，推算 widget.html 的網址（可用 data-widget 覆蓋）
  var me = document.currentScript || (function () {
    var ss = document.getElementsByTagName('script');
    for (var i = ss.length - 1; i >= 0; i--) { if (/embed\.js(\?|$)/.test(ss[i].src || '')) return ss[i]; }
    return null;
  })();
  var base = me ? me.src.replace(/[^/]*$/, '') : '';
  var widgetUrl = (me && me.getAttribute('data-widget')) || (base + 'widget.html');
  var startOpen = (me && me.getAttribute('data-open') !== 'false'); // 預設一進來就展開
  var widgetOrigin = (function () { try { return new URL(widgetUrl, location.href).origin; } catch (e) { return '*'; } })();

  // 把可設定項帶進 widget：皮=model / 肉的語音後端=api / 內容=knowledge / 聲線=voice
  var cfg = new URLSearchParams();
  ['model', 'api', 'knowledge', 'voice'].forEach(function (k) {
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
    'position:fixed', 'right:16px', 'bottom:16px',
    'z-index:2147483000', 'width:' + EXPANDED.w + 'px', 'height:' + EXPANDED.h + 'px'
  ].join(';');

  // 3) iframe（虛擬人本體）
  var iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.title = 'AI 虛擬人助理';                 // 無障礙：給 iframe 一個名字
  iframe.setAttribute('allow', 'microphone; autoplay'); // 語音輸入 + 音訊播放
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = 'width:100%;height:100%;border:0;background:transparent;color-scheme:normal;';

  // 4) 收合後的小泡泡（iframe 收起時顯示，點它再展開）
  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.setAttribute('aria-label', '開啟 AI 虛擬人助理');
  bubble.textContent = '💬';
  bubble.style.cssText = [
    'position:absolute', 'right:0', 'bottom:0', 'width:60px', 'height:60px',
    'border:0', 'border-radius:50%', 'cursor:pointer', 'font-size:26px',
    'background:#2f5d54', 'color:#fff', 'box-shadow:0 6px 18px rgba(0,0,0,.25)',
    'display:none', 'align-items:center', 'justify-content:center'
  ].join(';');

  root.appendChild(iframe);
  root.appendChild(bubble);
  (document.body || document.documentElement).appendChild(root);

  // 5) 展開 / 收合
  function setOpen(open) {
    if (open) {
      root.style.width = EXPANDED.w + 'px';
      root.style.height = EXPANDED.h + 'px';
      iframe.style.display = 'block';
      bubble.style.display = 'none';
    } else {
      root.style.width = '60px';
      root.style.height = '60px';
      iframe.style.display = 'none';
      bubble.style.display = 'flex';
    }
  }
  bubble.onclick = function () { setOpen(true); };
  setOpen(startOpen);

  // 6) 接收 iframe 的訊息（驗證來源 origin）
  window.addEventListener('message', function (e) {
    if (widgetOrigin !== '*' && e.origin !== widgetOrigin) return; // 只收來自自己 widget 的訊息
    var d = e.data || {};
    if (d.ns !== NS_IN) return;
    if (d.type === 'close') setOpen(false);                 // 使用者按 ✕ → 收成泡泡
    if (d.type === 'ready') { /* 之後可在這觸發歡迎語 */ }
    if (d.type === 'error') console.warn('[avatar] widget error:', d.message);
  });

  // 7) 對外 API：別的程式可以叫她說話 / 開關
  window.AvatarWidget = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    say: function (text) {
      setOpen(true);
      iframe.contentWindow && iframe.contentWindow.postMessage(
        { ns: NS_OUT, type: 'say', text: String(text || '').slice(0, 600) }, widgetOrigin);
    }
  };
})();
