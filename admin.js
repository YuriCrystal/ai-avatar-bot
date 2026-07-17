(function () {
  'use strict';

  var loading = document.getElementById('loading');
  var setup = document.getElementById('setup');
  var authView = document.getElementById('auth');
  var app = document.getElementById('app');
  var editor = document.getElementById('editor');
  var status = document.getElementById('status');
  var preview = document.getElementById('preview');
  var versions = document.getElementById('versions');
  var note = document.getElementById('note');
  var importStatus = document.getElementById('import-status');
  var analyticsStatus = document.getElementById('analytics-status');
  var supportList = document.getElementById('support-list');
  var supportMessages = document.getElementById('support-messages');
  var leadsList = document.getElementById('leads-list');
  var avatarConfigStatus = document.getElementById('avatar-config-status');
  var avatarConfigVersions = document.getElementById('avatar-config-versions');
  var avatarPreviewFrame = document.getElementById('avatar-preview-frame');
  var selectedSupportId = '';
  var supportBusy = false;
  var supportTimer = 0;
  var loadedLeads = [];
  var selectedLeadId = '';
  var leadBusy = false;
  var leadSearchTimer = 0;
  var avatarConfigBusy = false;
  var avatarConfigDirty = false;
  var busy = false;
  var loaded = false;
  var dirty = false;
  var siteId = 'default';
  var accessibleSites = [];
  var currentSiteRole = '';
  var globalAdmin = false;
  var currentUserId = '';
  var currentSiteKey = '';
  var LOCAL_PREVIEW = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
  var activePage = 'overview';
  var pageDefinitions = {
    overview:{ title:'營運總覽', subtitle:'掌握虛擬人的對話、客服與轉換狀況。' },
    avatar:{ title:'虛擬人設定', subtitle:'管理角色外觀、聲線、語言與互動文案。' },
    knowledge:{ title:'知識庫', subtitle:'匯入內容、驗證條目並控制發布版本。' },
    support:{ title:'真人客服', subtitle:'接手訪客對話、回覆訊息與追蹤案件狀態。' },
    leads:{ title:'潛在客戶', subtitle:'整理詢價與預約資料，追蹤後續聯絡進度。' },
    analytics:{ title:'使用分析', subtitle:'查看問題趨勢、未命中內容與回答來源。' },
    install:{ title:'安裝精靈', subtitle:'選擇功能、產生嵌入碼並完成上線前檢查。' },
    settings:{ title:'網站與成員', subtitle:'管理網站識別碼、網域、權限與稽核紀錄。' }
  };

  function showOnly(element) {
    [loading, setup, authView, app].forEach(function (item) { item.hidden = item !== element; });
  }

  function showStatus(message, type) {
    status.className = type || '';
    status.textContent = message;
  }

  function setBusy(value) {
    busy = value;
    ['save', 'publish'].forEach(function (id) { document.getElementById(id).disabled = value; });
  }

  function normaliseEntries(data) {
    if (!Array.isArray(data)) throw new Error('最外層必須是陣列。');
    if (data.length > 1000) throw new Error('最多 1000 筆。');
    return data.map(function (item, index) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('第 ' + (index + 1) + ' 筆必須是物件。');
      var q = typeof item.q === 'string' ? item.q.trim() : '';
      var a = typeof item.a === 'string' ? item.a.trim() : '';
      var kw = item.kw == null ? '' : (typeof item.kw === 'string' ? item.kw.trim() : null);
      if (!q || !a) throw new Error('第 ' + (index + 1) + ' 筆缺少 q 或 a。');
      if (kw === null) throw new Error('第 ' + (index + 1) + ' 筆的 kw 必須是字串。');
      if (q.length > 300 || kw.length > 1200 || a.length > 4000) throw new Error('第 ' + (index + 1) + ' 筆內容過長。');
      var result = { q:q, kw:kw, a:a };
      if (item.source && typeof item.source === 'object' && !Array.isArray(item.source)) {
        var sourceType = /^(pdf|url|text|json)$/.test(item.source.type) ? item.source.type : 'text';
        var sourceTitle = String(item.source.title || '').trim().slice(0, 160);
        var sourceUrl = String(item.source.url || '').trim().slice(0, 1200);
        if (sourceTitle) {
          result.source = { type:sourceType, title:sourceTitle };
          if (sourceUrl) result.source.url = sourceUrl;
        }
      }
      return result;
    });
  }

  function parseAndValidate() {
    var data;
    try { data = JSON.parse(editor.value); } catch (error) { throw new Error('JSON 格式錯誤：' + error.message); }
    return normaliseEntries(data);
  }

  function renderPreview(data) {
    preview.replaceChildren();
    data.slice(0, 20).forEach(function (item) {
      var box = document.createElement('div'); box.className = 'entry';
      var q = document.createElement('strong'); q.textContent = item.q;
      var a = document.createElement('span'); a.textContent = item.a;
      box.append(q, a); preview.appendChild(box);
      if (item.source && item.source.title) {
        var source = document.createElement('span'); source.textContent = '來源：' + item.source.title; box.appendChild(source);
      }
    });
    if (!data.length) { var empty = document.createElement('p'); empty.textContent = '知識庫目前沒有內容。'; preview.appendChild(empty); }
  }

  function validateAndPreview() {
    try {
      var data = parseAndValidate();
      renderPreview(data); showStatus('驗證成功：共 ' + data.length + ' 筆。', 'ok'); return data;
    } catch (error) {
      preview.replaceChildren(); showStatus(error.message, 'bad'); return null;
    }
  }

  function setImportStatus(message, type) {
    importStatus.textContent = message;
    importStatus.style.color = type === 'bad' ? 'var(--bad)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
  }

  function mergeImported(entries, label) {
    var existing = parseAndValidate();
    var merged = window.KnowledgeBuilder.mergeEntries(existing, normaliseEntries(entries));
    if (merged.length < existing.length + entries.length) setImportStatus('已略過重複內容；目前共 ' + merged.length + ' 筆。', 'ok');
    else setImportStatus('已從「' + label + '」建立 ' + entries.length + ' 筆；目前共 ' + merged.length + ' 筆。', 'ok');
    editor.value = JSON.stringify(merged, null, 2);
    dirty = true; renderPreview(merged); showStatus('匯入完成，請檢查內容後再儲存或發布。', 'warn');
  }

  function entriesFromText(text, source) {
    var entries = window.KnowledgeBuilder.buildEntries({ text:text, source:source, maxChars:850, minChars:180 });
    if (!entries.length) throw new Error('沒有讀到足夠的文字內容。');
    return entries;
  }

  var pdfModulePromise;
  async function extractPdf(file) {
    if (file.size > 30 * 1024 * 1024) throw new Error('PDF 最大支援 30MB。');
    if (!pdfModulePromise) {
      pdfModulePromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.min.mjs');
    }
    var pdfjs = await pdfModulePromise;
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs';
    var task = pdfjs.getDocument({ data:new Uint8Array(await file.arrayBuffer()), isEvalSupported:false });
    var pdf = await task.promise;
    var pages = [];
    var totalChars = 0;
    try {
      if (pdf.numPages > 300) throw new Error('PDF 最多支援 300 頁。');
      for (var pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        setImportStatus('正在讀取 PDF：第 ' + pageNo + '／' + pdf.numPages + ' 頁…');
        var page = await pdf.getPage(pageNo);
        var content = await page.getTextContent();
        var text = content.items.map(function (item) { return item.str + (item.hasEOL ? '\n' : ' '); }).join('').trim();
        if (text) { pages.push(text); totalChars += text.length + 2; }
        page.cleanup();
        if (totalChars > 500000) throw new Error('PDF 可讀文字超過 50 萬字，請拆成較小文件。');
      }
      return pages.join('\n\n');
    } finally {
      try { await pdf.destroy(); } catch (error) {}
    }
  }

  async function importFile(file) {
    if (!file) return;
    setImportStatus('正在讀取「' + file.name + '」…');
    try {
      var lower = file.name.toLowerCase();
      if (file.type === 'application/json' || lower.endsWith('.json')) {
        var jsonEntries = JSON.parse(await file.text());
        jsonEntries = normaliseEntries(jsonEntries).map(function (item) {
          if (!item.source) item.source = { type:'json', title:file.name };
          return item;
        });
        mergeImported(jsonEntries, file.name);
        return;
      }
      var text = file.type === 'application/pdf' || lower.endsWith('.pdf') ? await extractPdf(file) : await file.text();
      mergeImported(entriesFromText(text, { type:(lower.endsWith('.pdf') ? 'pdf' : 'text'), title:file.name }), file.name);
    } catch (error) { setImportStatus(error.message, 'bad'); showStatus('文件匯入失敗。', 'bad'); }
  }

  function loadScript(src, attributes) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = src; script.defer = true; script.crossOrigin = 'anonymous';
      Object.keys(attributes || {}).forEach(function (key) { script.setAttribute(key, attributes[key]); });
      script.onload = resolve; script.onerror = function () { reject(new Error('登入元件載入失敗。')); };
      document.head.appendChild(script);
    });
  }

  async function initClerk(publishableKey) {
    var encoded = publishableKey.split('_')[2] || '';
    var domain = atob(encoded).slice(0, -1);
    if (!domain) throw new Error('Clerk Publishable Key 格式無效。');
    await loadScript('https://' + domain + '/npm/@clerk/ui@1/dist/ui.browser.js');
    await loadScript('https://' + domain + '/npm/@clerk/clerk-js@6/dist/clerk.browser.js', { 'data-clerk-publishable-key': publishableKey });
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
  }

  async function api(path, options) {
    options = options || {};
    if (LOCAL_PREVIEW) return previewApi(path, options);
    var token = window.Clerk.session && await window.Clerk.session.getToken();
    if (!token) throw new Error('登入已失效，請重新登入。');
    var headers = Object.assign({ Authorization:'Bearer ' + token }, options.headers || {});
    if (options.body) headers['Content-Type'] = 'application/json';
    var response = await fetch(path, Object.assign({}, options, { headers:headers }));
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || ('HTTP ' + response.status));
    return body;
  }

  function previewData() {
    var now = Date.now();
    var site = { id:'demo-store', name:'示範品牌官網', primary_origin:'https://example.com', status:'active', public_key_hint:'review', role:'owner' };
    var config = {
      name:'木｜網站助理', mode:'assistant', locale:'zh-TW', engine:'2d', fit:'half',
      model2d:'/models/mu_bilibili/mu.model3.json', model3d:'', voice:'zh-TW-YunJheNeural',
      welcome:'嗨，我是木，有產品、方案或預約問題都可以問我。', greeting:'你好，我是木，需要我幫你找產品資訊嗎？',
      fallback:'這題我還需要確認，你可以換個方式問，或轉接真人客服。', suggestions:['有哪些方案？','如何預約？','可以轉真人客服嗎？'], brandColor:'#5b54e8', width:340, height:480
    };
    var entries = [
      { q:'有哪些方案？', kw:'方案 價格 服務', a:'目前提供入門、專業與企業三種方案，可依網站流量與客服需求選擇。' },
      { q:'如何預約？', kw:'預約 諮詢 時間', a:'留下姓名、聯絡方式與希望的時間，我們會由專人協助安排。' },
      { q:'真人客服服務時間', kw:'真人 客服 時間', a:'真人客服服務時間為週一至週五 09:00–18:00。' }
    ];
    var cases = [
      { id:'11111111-1111-4111-8111-111111111111', subject:'想確認企業方案能否串接會員系統', status:'open', assigned_to:'', updated_at:new Date(now - 8 * 60000).toISOString(), message_count:4 },
      { id:'22222222-2222-4222-8222-222222222222', subject:'預約下週產品展示', status:'assigned', assigned_to:'user_local_preview', updated_at:new Date(now - 25 * 60000).toISOString(), message_count:7 }
    ];
    var leads = [
      { id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name:'陳怡君', contact:'yijun@example.com', company:'春日設計', request:'希望了解企業方案與導入時間', status:'new', source_page:'https://example.com/pricing', consented_at:new Date(now - 45 * 60000).toISOString(), created_at:new Date(now - 45 * 60000).toISOString(), assigned_to:'', admin_note:'' },
      { id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name:'林先生', contact:'0912-345-678', company:'森光科技', request:'預約下週三下午產品展示', status:'new', source_page:'https://example.com/demo', consented_at:new Date(now - 3 * 3600000).toISOString(), created_at:new Date(now - 3 * 3600000).toISOString(), assigned_to:'', admin_note:'' }
    ];
    return { now:now, site:site, config:config, entries:entries, cases:cases, leads:leads };
  }

  async function previewApi(path, options) {
    var data = previewData();
    var url = new URL(path, location.origin); var method = String(options && options.method || 'GET').toUpperCase();
    if (method !== 'GET') throw new Error('本機預覽模式不會寫入資料；請在正式登入環境操作。');
    if (url.pathname === '/api/admin/sites' && url.searchParams.get('site')) return { site:data.site, role:'owner', globalAdmin:true, members:[{ user_id:'user_local_preview', role:'owner', added_by:'system', created_at:new Date(data.now - 86400000).toISOString() }] };
    if (url.pathname === '/api/admin/sites') return { globalAdmin:true, userId:'user_local_preview', sites:[data.site] };
    if (url.pathname === '/api/admin/audit') return { events:[
      { id:'3', user_id:'user_local_preview', action:'knowledge.publish', target_type:'knowledge_version', target_id:'12', created_at:new Date(data.now - 2 * 3600000).toISOString() },
      { id:'2', user_id:'user_local_preview', action:'avatar.publish', target_type:'avatar_config_version', target_id:'8', created_at:new Date(data.now - 86400000).toISOString() },
      { id:'1', user_id:'user_local_preview', action:'site.rotate_public_key', target_type:'site', target_id:'demo-store', created_at:new Date(data.now - 2 * 86400000).toISOString() }
    ] };
    if (url.pathname === '/api/admin/knowledge') return { siteId:data.site.id, current:{ id:'12', entries:data.entries, created_at:new Date(data.now - 2 * 3600000).toISOString() }, versions:[
      { id:'12', note:'更新企業方案與客服時間', was_published:true, published:true, entry_count:data.entries.length, created_at:new Date(data.now - 2 * 3600000).toISOString() },
      { id:'11', note:'首頁常見問題', was_published:true, published:false, entry_count:2, created_at:new Date(data.now - 3 * 86400000).toISOString() }
    ] };
    if (url.pathname === '/api/admin/avatar-config') return { siteId:data.site.id, defaults:data.config, current:{ id:'8', config:data.config }, published:{ id:'8', config:data.config }, versions:[
      { id:'8', note:'正式品牌角色', was_published:true, published:true, created_at:new Date(data.now - 86400000).toISOString() },
      { id:'7', note:'調整歡迎詞', was_published:false, published:false, created_at:new Date(data.now - 2 * 86400000).toISOString() }
    ] };
    if (url.pathname === '/api/admin/analytics') return { days:Number(url.searchParams.get('days') || 30), summary:{ sessions:1284, questions:3621, fallbackRate:8.7, handoffs:46 }, daily:[
      { day:'2026-07-12', questions:89 }, { day:'2026-07-13', questions:116 }, { day:'2026-07-14', questions:142 }, { day:'2026-07-15', questions:128 }, { day:'2026-07-16', questions:157 }
    ], popular:[{ question:'有哪些方案？', count:186 },{ question:'如何預約？', count:121 },{ question:'可以試用嗎？', count:84 }], unanswered:[{ question:'是否支援 LINE 登入？', count:18 },{ question:'可以開立海外發票嗎？', count:11 }], sources:[{ answer_source:'knowledge', count:2870 },{ answer_source:'webllm', count:438 },{ answer_source:'fallback', count:313 }] };
    if (url.pathname === '/api/admin/leads') {
      var leadStatus = url.searchParams.get('status') || 'all';
      return { leads:data.leads.filter(function (item) { return leadStatus === 'all' || item.status === leadStatus; }) };
    }
    if (url.pathname === '/api/admin/support' && url.searchParams.get('caseId')) {
      var selected = data.cases.find(function (item) { return item.id === url.searchParams.get('caseId'); }) || data.cases[0];
      return { case:selected, messages:[
        { id:'1', sender:'visitor', body:'您好，我想確認企業方案能不能串接既有會員系統？', created_at:new Date(data.now - 18 * 60000).toISOString() },
        { id:'2', sender:'bot', body:'企業方案支援客製整合，我可以先替你轉接真人顧問。', created_at:new Date(data.now - 17 * 60000).toISOString() },
        { id:'3', sender:'visitor', body:'好，謝謝。', created_at:new Date(data.now - 16 * 60000).toISOString() }
      ] };
    }
    if (url.pathname === '/api/admin/support') {
      var supportStatus = url.searchParams.get('status') || 'active';
      return { cases:data.cases.filter(function (item) { return supportStatus === 'active' ? item.status !== 'resolved' : item.status === supportStatus; }) };
    }
    throw new Error('本機預覽沒有這項資料。');
  }

  function formatDate(value) {
    try { return new Intl.DateTimeFormat('zh-TW', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)); }
    catch (error) { return String(value || ''); }
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('zh-TW').format(Number(value || 0));
  }

  function roleLabel(role) {
    return role === 'owner' ? 'Owner' : (role === 'editor' ? 'Editor' : 'Viewer');
  }

  function canEditSite() {
    return !LOCAL_PREVIEW && /^(owner|editor)$/.test(currentSiteRole);
  }

  function canOwnSite() {
    return currentSiteRole === 'owner';
  }

  function currentSite() {
    return accessibleSites.find(function (item) { return item.id === siteId; }) || null;
  }

  function activatePage(page, remember) {
    if (!pageDefinitions[page]) page = 'overview';
    if (page === 'settings' && !canOwnSite()) page = 'overview';
    activePage = page;
    document.querySelectorAll('[data-workspace]').forEach(function (section) { section.classList.toggle('active', section.dataset.workspace === page); });
    document.querySelectorAll('[data-nav-page]').forEach(function (button) {
      var current = button.dataset.navPage === page;
      if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    var definition = pageDefinitions[page];
    document.getElementById('admin-page-title').textContent = definition.title;
    document.getElementById('admin-page-subtitle').textContent = definition.subtitle;
    if (page === 'install') updateInstallCode();
    if (remember !== false) {
      try { localStorage.setItem('avatar-admin-page', page); } catch (error) {}
      if (history.replaceState) history.replaceState(null, '', '#' + page);
    }
    window.scrollTo({ top:0, behavior:'auto' });
  }

  function initialPage() {
    var page = String(location.hash || '').replace(/^#/, '');
    if (!pageDefinitions[page]) {
      try { page = localStorage.getItem('avatar-admin-page') || 'overview'; } catch (error) { page = 'overview'; }
    }
    return pageDefinitions[page] ? page : 'overview';
  }

  function selectedServiceOrigin() {
    var input = document.getElementById('install-script-origin');
    var value = input && input.value.trim() || location.origin;
    try {
      var url = new URL(value);
      var local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
      if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('HTTPS required');
      return url.origin;
    } catch (error) { return location.origin; }
  }

  function generatedEmbedCode(features) {
    var encodedSite = encodeURIComponent(siteId);
    var key = currentSiteKey || 'avk_貼上後台產生的識別碼';
    var attributes = [
      'src="' + selectedServiceOrigin() + '/embed.js"',
      'data-site="' + siteId + '"',
      'data-site-key="' + key + '"',
      'data-config="/api/avatar-config?site=' + encodedSite + '"'
    ];
    if (features.knowledge) attributes.push('data-knowledge="/api/knowledge?site=' + encodedSite + '"');
    if (features.analytics) attributes.push('data-analytics="/api/events?site=' + encodedSite + '"');
    if (features.handoff) attributes.push('data-handoff="/api/handoff?site=' + encodedSite + '"');
    if (features.leads) attributes.push('data-leads="/api/leads?site=' + encodedSite + '"');
    return '<script ' + attributes.map(function (item, index) { return (index ? '  ' : '') + item; }).join('\n') + '></script>';
  }

  function installFeatures() {
    function checked(id) { var element = document.getElementById(id); return !element || element.checked; }
    return { knowledge:checked('install-feature-knowledge'), analytics:checked('install-feature-analytics'), handoff:checked('install-feature-handoff'), leads:checked('install-feature-leads') };
  }

  function updateInstallCode() {
    var dashboardTarget = document.getElementById('dashboard-install-code');
    var wizardTarget = document.getElementById('install-generated-code');
    var originInput = document.getElementById('install-script-origin');
    if (originInput && !originInput.value) originInput.value = location.origin;
    if (dashboardTarget) dashboardTarget.value = generatedEmbedCode({ knowledge:true, analytics:true, handoff:true, leads:true });
    if (wizardTarget) wizardTarget.value = generatedEmbedCode(installFeatures());
    var site = currentSite() || {};
    if (document.getElementById('install-site-name')) document.getElementById('install-site-name').textContent = site.name || '—';
    if (document.getElementById('install-site-id')) document.getElementById('install-site-id').textContent = siteId;
    if (document.getElementById('install-site-origin')) document.getElementById('install-site-origin').textContent = site.primary_origin || '尚未設定';
    if (document.getElementById('install-key-status')) document.getElementById('install-key-status').textContent = currentSiteKey ? '新識別碼已帶入' : (site.public_key_hint ? ('已啟用（尾碼 ' + site.public_key_hint + '）') : '尚未啟用');
  }

  function renderInstallChecks(items) {
    var container = document.getElementById('install-check-list'); container.replaceChildren();
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'install-check ' + (item.ok ? 'ok' : 'bad');
      var mark = document.createElement('span'); mark.className = 'install-check-mark'; mark.textContent = item.ok ? '✓' : '!';
      var content = document.createElement('span'); var title = document.createElement('strong'); title.textContent = item.title;
      var detail = document.createElement('small'); detail.textContent = item.detail; content.append(title, detail); row.append(mark, content); container.appendChild(row);
    });
    var ready = items.every(function (item) { return item.ok; });
    var badge = document.getElementById('install-readiness'); badge.textContent = ready ? '可以安裝' : '需要處理'; badge.className = 'badge' + (ready ? ' live' : '');
    document.getElementById('install-step-check').classList.toggle('ready', ready);
  }

  function markInstallUnchecked() {
    var badge = document.getElementById('install-readiness'); badge.textContent = '尚未檢查'; badge.className = 'badge';
    document.getElementById('install-step-check').classList.remove('ready');
  }

  function copyInstallCode() {
    var target = document.getElementById('install-generated-code'); var button = document.getElementById('install-copy-code');
    var promise = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(target.value) : Promise.reject(new Error('clipboard unavailable'));
    promise.then(function () { button.textContent = '已複製'; setTimeout(function () { button.textContent = '複製嵌入碼'; }, 1400); }).catch(function () { target.select(); });
  }

  async function runInstallChecks() {
    var button = document.getElementById('install-run-checks'); button.disabled = true; button.textContent = '檢查中…';
    var site = currentSite() || {}; var features = installFeatures(); var origin = selectedServiceOrigin();
    var items = [
      { title:'主要網域', ok:!!site.primary_origin, detail:site.primary_origin || '請先到「網站與成員」設定主要 HTTPS 網域。' },
      { title:'公開寫入識別碼', ok:!!(currentSiteKey || site.public_key_hint), detail:(currentSiteKey || site.public_key_hint) ? '分析、客服與名單可使用租戶保護。' : '請先產生公開寫入識別碼。' }
    ];
    var endpoints = [
      { title:'嵌入載入器', path:'/embed.js' },
      { title:'角色設定端點', path:'/api/avatar-config?site=' + encodeURIComponent(siteId) }
    ];
    if (features.knowledge) endpoints.push({ title:'知識庫端點', path:'/api/knowledge?site=' + encodeURIComponent(siteId) });
    endpoints.push({ title:'健康檢查', path:'/api/health' });
    if (LOCAL_PREVIEW) endpoints.forEach(function (endpoint) { items.push({ title:endpoint.title, ok:true, detail:'本機唯讀預覽已模擬通過。' }); });
    else {
      var results = await Promise.allSettled(endpoints.map(function (endpoint) { return fetch(origin + endpoint.path, { cache:'no-store', credentials:'omit' }); }));
      results.forEach(function (result, index) {
        var ok = result.status === 'fulfilled' && result.value.ok;
        items.push({ title:endpoints[index].title, ok:ok, detail:ok ? '端點可正常存取。' : (result.status === 'fulfilled' ? ('回傳 HTTP ' + result.value.status + '，請檢查發布與環境設定。') : '無法連線，請檢查網址或跨網域設定。') });
      });
    }
    renderInstallChecks(items); button.disabled = false; button.textContent = '重新檢查';
  }

  function dashboardState(id, text, state) {
    var element = document.getElementById(id); if (!element) return;
    element.textContent = text; element.className = 'system-state' + (state ? ' ' + state : '');
  }

  async function loadDashboardHealth() {
    if (LOCAL_PREVIEW) { dashboardState('dashboard-health', '唯讀示範', 'ok'); return; }
    dashboardState('dashboard-health', '檢查中', '');
    try {
      var response = await fetch('/api/health', { cache:'no-store' });
      var result = await response.json().catch(function () { return {}; });
      dashboardState('dashboard-health', response.ok && result.status === 'ok' ? '運作正常' : '需要檢查', response.ok && result.status === 'ok' ? 'ok' : 'bad');
    } catch (error) { dashboardState('dashboard-health', '無法連線', 'bad'); }
  }

  async function loadDashboardQueues() {
    updateInstallCode();
    var results = await Promise.allSettled([
      api('/api/admin/leads?site=' + encodeURIComponent(siteId) + '&status=new&search='),
      api('/api/admin/support?site=' + encodeURIComponent(siteId) + '&status=active'),
      loadDashboardHealth()
    ]);
    var leads = results[0].status === 'fulfilled' && Array.isArray(results[0].value.leads) ? results[0].value.leads.length : '—';
    var support = results[1].status === 'fulfilled' && Array.isArray(results[1].value.cases) ? results[1].value.cases.length : '—';
    document.getElementById('dashboard-lead-count').textContent = leads;
    document.getElementById('dashboard-support-count').textContent = support;
  }

  function resetWorkspaceView() {
    ['dashboard-sessions','dashboard-questions','dashboard-fallback','dashboard-handoffs','dashboard-lead-count','dashboard-support-count','metric-sessions','metric-questions','metric-fallback','metric-handoffs']
      .forEach(function (id) { var element = document.getElementById(id); if (element) element.textContent = '—'; });
    dashboardState('dashboard-health', '檢查中', '');
    dashboardState('dashboard-avatar-state', '載入中', '');
    dashboardState('dashboard-knowledge-state', '載入中', '');
    editor.value = ''; note.value = ''; preview.replaceChildren(); versions.replaceChildren();
    avatarConfigVersions.replaceChildren(); avatarPreviewFrame.removeAttribute('src');
    document.querySelectorAll('.avatar-settings input,.avatar-settings textarea').forEach(function (element) { element.value = element.type === 'color' ? '#5b54e8' : ''; });
    document.querySelectorAll('.avatar-settings select').forEach(function (element) { element.selectedIndex = 0; });
    loadedLeads = []; leadsList.replaceChildren();
    ['lead-name','lead-meta','lead-contact','lead-company','lead-request','lead-source','lead-consent','lead-assignee'].forEach(function (id) { document.getElementById(id).textContent = id === 'lead-name' ? '正在載入名單…' : '—'; });
    supportList.replaceChildren(); supportMessages.replaceChildren();
    document.getElementById('support-subject').textContent = '正在載入案件…'; document.getElementById('support-meta').textContent = '';
    ['site-current-id','site-current-name','site-current-origin'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('site-members').replaceChildren(); document.getElementById('audit-list').replaceChildren();
    showSiteKey('', (currentSite() && currentSite().public_key_hint) || '');
  }

  function applyPermissionState() {
    var editable = canEditSite();
    document.getElementById('readonly-banner').hidden = editable || LOCAL_PREVIEW;
    editor.readOnly = !editable;
    ['save','publish','import-url','import-text','source-file','file','support-assign','support-resolve','support-reopen','support-reply','support-send','support-note','lead-status-select','lead-note','lead-update','lead-delete','avatar-save','avatar-publish']
      .forEach(function (id) { var element = document.getElementById(id); if (element) element.disabled = !editable; });
    document.querySelectorAll('.avatar-settings input,.avatar-settings select,.avatar-settings textarea').forEach(function (element) { element.disabled = !editable; });
    document.getElementById('site-management').hidden = !canOwnSite();
    document.getElementById('site-create').hidden = !globalAdmin;
    document.querySelectorAll('[data-owner-only]').forEach(function (element) { element.hidden = !canOwnSite(); });
    if (activePage === 'settings' && !canOwnSite()) activatePage('overview');
  }

  function renderSiteSelector() {
    var select = document.getElementById('site-select'); select.replaceChildren();
    accessibleSites.forEach(function (item) {
      var option = document.createElement('option'); option.value = item.id;
      option.textContent = item.name + ' (' + item.id + ')' + (item.status === 'archived' ? '〔封存〕' : '');
      select.appendChild(option);
    });
    select.value = siteId;
    var role = document.getElementById('site-role'); role.textContent = roleLabel(currentSiteRole); role.className = 'badge' + (currentSiteRole === 'owner' ? ' live' : '');
    updateInstallCode();
  }

  async function loadSites(preferredSiteId) {
    var result = await api('/api/admin/sites');
    accessibleSites = Array.isArray(result.sites) ? result.sites : [];
    globalAdmin = result.globalAdmin === true; currentUserId = result.userId || '';
    if (!accessibleSites.length) {
      document.getElementById('setup-message').textContent = '你的帳號尚未被加入任何網站，請網站 Owner 使用 Clerk User ID 將你加入。';
      var setupUser = document.getElementById('setup-user-button'); setupUser.replaceChildren();
      if (window.Clerk && window.Clerk.isSignedIn) window.Clerk.mountUserButton(setupUser);
      showOnly(setup); return false;
    }
    var stored = '';
    try { stored = localStorage.getItem('avatar-admin-site') || ''; } catch (error) {}
    var wanted = preferredSiteId || stored;
    var selected = accessibleSites.find(function (item) { return item.id === wanted; }) || accessibleSites[0];
    siteId = selected.id; currentSiteRole = selected.role; currentSiteKey = '';
    renderSiteSelector(); applyPermissionState();
    activatePage(initialPage(), false);
    try { localStorage.setItem('avatar-admin-site', siteId); } catch (error) {}
    return true;
  }

  function siteStatus(message, bad) {
    var element = document.getElementById('sites-status'); element.textContent = message; element.style.color = bad ? 'var(--bad)' : 'var(--muted)';
  }

  function showSiteKey(value, hint) {
    currentSiteKey = value || '';
    document.getElementById('site-public-key').value = value || (hint ? ('已啟用（尾碼 ' + hint + '）') : '尚未啟用');
    document.getElementById('site-key-copy').hidden = !value;
    updateInstallCode();
  }

  function auditActionLabel(action) {
    var labels = {
      'site.create':'建立網站', 'site.update':'更新網站', 'site.rotate_public_key':'輪替公開識別碼',
      'member.set_role':'新增／調整成員', 'member.remove':'移除成員',
      'knowledge.publish':'發布知識庫', 'knowledge.draft':'儲存知識草稿', 'knowledge.restore':'還原知識版本',
      'avatar.publish':'發布角色設定', 'avatar.draft':'儲存角色草稿', 'avatar.restore':'還原角色設定',
      'lead.update':'更新潛在客戶', 'lead.delete':'刪除潛在客戶',
      'support.assign':'接手客服', 'support.reply':'回覆客服', 'support.note':'新增客服備註', 'support.resolve':'結案客服', 'support.reopen':'重開客服'
    };
    return labels[action] || action;
  }

  function renderAudit(items) {
    var container = document.getElementById('audit-list'); container.replaceChildren();
    if (!items.length) { var empty = document.createElement('p'); empty.textContent = '尚無管理操作紀錄。'; container.appendChild(empty); return; }
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'audit-row';
      var time = document.createElement('time'); time.textContent = formatDate(item.created_at);
      var detail = document.createElement('div');
      var action = document.createElement('strong'); action.textContent = auditActionLabel(item.action);
      var meta = document.createElement('span'); meta.textContent = item.user_id + ' · ' + item.target_type + (item.target_id ? ' #' + item.target_id.slice(0, 16) : '');
      detail.append(action, meta); row.append(time, detail); container.appendChild(row);
    });
  }

  async function loadAudit() {
    if (!canOwnSite()) return;
    try { var result = await api('/api/admin/audit?site=' + encodeURIComponent(siteId) + '&limit=50'); renderAudit(Array.isArray(result.events) ? result.events : []); }
    catch (error) { var container = document.getElementById('audit-list'); container.replaceChildren(); var message = document.createElement('p'); message.textContent = error.message; container.appendChild(message); }
  }

  function renderMembers(items) {
    var container = document.getElementById('site-members'); container.replaceChildren();
    if (!items.length) { var empty = document.createElement('p'); empty.textContent = '尚無成員。'; container.appendChild(empty); return; }
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'member-row';
      var user = document.createElement('code'); user.textContent = item.user_id + (item.user_id === currentUserId ? '（你）' : '');
      var role = document.createElement('select'); role.setAttribute('aria-label', item.user_id + ' 的角色');
      ['viewer','editor','owner'].forEach(function (value) { var option = document.createElement('option'); option.value = value; option.textContent = roleLabel(value); role.appendChild(option); });
      role.value = item.role; role.onchange = function () { setSiteMember(item.user_id, role.value); };
      var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger'; remove.textContent = '移除'; remove.onclick = function () { removeSiteMember(item.user_id); };
      row.append(user, role, remove); container.appendChild(row);
    });
  }

  async function loadSiteDetails() {
    if (!canOwnSite()) return;
    try {
      var result = await api('/api/admin/sites?site=' + encodeURIComponent(siteId));
      document.getElementById('site-current-id').value = result.site.id;
      document.getElementById('site-current-name').value = result.site.name || '';
      document.getElementById('site-current-origin').value = result.site.primary_origin || '';
      showSiteKey('', result.site.public_key_hint || '');
      renderMembers(Array.isArray(result.members) ? result.members : []);
      await loadAudit();
      siteStatus('已載入「' + result.site.name + '」的網站與成員設定。');
    } catch (error) { siteStatus(error.message, true); }
  }

  async function updateCurrentSite() {
    try {
      await api('/api/admin/sites', { method:'POST', body:JSON.stringify({ action:'update', siteId:siteId, name:document.getElementById('site-current-name').value, primaryOrigin:document.getElementById('site-current-origin').value }) });
      await loadSites(siteId); await loadSiteDetails(); siteStatus('網站資料已更新。');
    } catch (error) { siteStatus(error.message, true); }
  }

  async function createNewSite() {
    var button = document.getElementById('site-create-button'); button.disabled = true;
    try {
      var result = await api('/api/admin/sites', { method:'POST', body:JSON.stringify({ action:'create', siteId:document.getElementById('site-new-id').value, name:document.getElementById('site-new-name').value, primaryOrigin:document.getElementById('site-new-origin').value }) });
      ['site-new-id','site-new-name','site-new-origin'].forEach(function (id) { document.getElementById(id).value = ''; });
      await loadSites(result.site.id); await loadWorkspace(); siteStatus('新網站已建立並切換完成。');
      if (result.site.siteKey) showSiteKey(result.site.siteKey, '');
    } catch (error) { siteStatus(error.message, true); }
    finally { button.disabled = false; }
  }

  async function setSiteMember(userId, role) {
    try {
      await api('/api/admin/sites', { method:'POST', body:JSON.stringify({ action:'set_member', siteId:siteId, userId:userId, role:role }) });
      await loadSites(siteId); await loadWorkspace(); siteStatus('成員角色已更新。');
    } catch (error) { siteStatus(error.message, true); await loadSiteDetails(); }
  }

  async function addSiteMember() {
    var userId = document.getElementById('member-user-id').value.trim();
    if (!userId) { siteStatus('請輸入 Clerk User ID。', true); return; }
    await setSiteMember(userId, document.getElementById('member-role').value);
    document.getElementById('member-user-id').value = '';
  }

  async function removeSiteMember(userId) {
    if (!confirm('確定要把 ' + userId + ' 從這個網站移除嗎？')) return;
    try {
      await api('/api/admin/sites', { method:'POST', body:JSON.stringify({ action:'remove_member', siteId:siteId, userId:userId }) });
      if (await loadSites(siteId)) await loadWorkspace(); siteStatus('成員已移除。');
    } catch (error) { siteStatus(error.message, true); }
  }

  async function rotateSiteKey() {
    if (!confirm('輪替後，所有使用舊識別碼的嵌入頁面會停止寫入分析、客服與名單。確定繼續嗎？')) return;
    var button = document.getElementById('site-key-rotate'); button.disabled = true;
    try {
      var result = await api('/api/admin/sites', { method:'POST', body:JSON.stringify({ action:'rotate_key', siteId:siteId }) });
      showSiteKey(result.key.siteKey, ''); await loadAudit(); siteStatus('新識別碼已產生；請立即更新嵌入碼。');
    } catch (error) { siteStatus(error.message, true); }
    finally { button.disabled = false; }
  }

  function copySiteKey() {
    if (!currentSiteKey) return;
    navigator.clipboard.writeText(currentSiteKey).then(function () { siteStatus('識別碼已複製。'); }).catch(function () { siteStatus('瀏覽器拒絕複製，請手動選取。', true); });
  }

  function emptyAnalytics(container, message) {
    container.replaceChildren();
    var empty = document.createElement('p'); empty.textContent = message; container.appendChild(empty);
  }

  function renderRanked(container, items, emptyMessage) {
    container.replaceChildren();
    if (!items.length) { emptyAnalytics(container, emptyMessage); return; }
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'analytics-row';
      var label = document.createElement('span'); label.textContent = item.question;
      var count = document.createElement('strong'); count.textContent = formatNumber(item.count) + ' 次';
      row.append(label, count); container.appendChild(row);
    });
  }

  function renderSources(items) {
    var labels = { knowledge:'知識庫', page_context:'目前頁面', webllm:'瀏覽器 AI', ollama:'本機 Ollama', companion:'陪伴規則', fallback:'未命中' };
    var container = document.getElementById('analytics-sources'); container.replaceChildren();
    if (!items.length) { emptyAnalytics(container, '還沒有回答資料。'); return; }
    items.forEach(function (item) {
      var row = document.createElement('div'); row.className = 'analytics-row';
      var label = document.createElement('span'); label.textContent = labels[item.source] || item.source || '其他';
      var count = document.createElement('strong'); count.textContent = formatNumber(item.count) + ' 次';
      row.append(label, count); container.appendChild(row);
    });
  }

  function renderAnalytics(data) {
    var summary = data.summary || {};
    document.getElementById('metric-sessions').textContent = formatNumber(summary.sessions);
    document.getElementById('metric-questions').textContent = formatNumber(summary.questions);
    document.getElementById('metric-fallback').textContent = Number(summary.fallbackRate || 0).toFixed(1).replace('.0', '') + '%';
    document.getElementById('metric-handoffs').textContent = formatNumber(summary.handoffs);
    document.getElementById('dashboard-sessions').textContent = formatNumber(summary.sessions);
    document.getElementById('dashboard-questions').textContent = formatNumber(summary.questions);
    document.getElementById('dashboard-fallback').textContent = Number(summary.fallbackRate || 0).toFixed(1).replace('.0', '') + '%';
    document.getElementById('dashboard-handoffs').textContent = formatNumber(summary.handoffs);
    document.getElementById('dashboard-period-label').textContent = '最近 ' + data.days + ' 天';
    var trend = document.getElementById('analytics-trend'); trend.replaceChildren();
    var daily = Array.isArray(data.daily) ? data.daily : [];
    if (!daily.length) emptyAnalytics(trend, '這段期間還沒有問題。');
    else {
      var max = Math.max.apply(null, daily.map(function (item) { return Number(item.questions || 0); })) || 1;
      daily.forEach(function (item) {
        var row = document.createElement('div'); row.className = 'trend-row';
        var day = document.createElement('span'); day.textContent = String(item.day || '').slice(5);
        var track = document.createElement('div'); track.className = 'trend-track';
        var bar = document.createElement('div'); bar.className = 'trend-bar'; bar.style.width = (Number(item.questions || 0) / max * 100) + '%'; track.appendChild(bar);
        var count = document.createElement('strong'); count.textContent = formatNumber(item.questions);
        row.append(day, track, count); trend.appendChild(row);
      });
    }
    renderRanked(document.getElementById('analytics-popular'), Array.isArray(data.popular) ? data.popular : [], '還沒有熱門問題。');
    renderRanked(document.getElementById('analytics-unanswered'), Array.isArray(data.unanswered) ? data.unanswered : [], '目前沒有待補問題。');
    renderSources(Array.isArray(data.sources) ? data.sources : []);
    analyticsStatus.textContent = '已載入最近 ' + data.days + ' 天資料；共 ' + formatNumber(summary.questions) + ' 個問題。';
  }

  async function loadAnalytics() {
    var refresh = document.getElementById('analytics-refresh'); refresh.disabled = true;
    analyticsStatus.textContent = '正在載入匿名使用數據…';
    try {
      var days = document.getElementById('analytics-days').value;
      renderAnalytics(await api('/api/admin/analytics?site=' + encodeURIComponent(siteId) + '&days=' + encodeURIComponent(days)));
    } catch (error) { analyticsStatus.textContent = error.message; }
    finally { refresh.disabled = false; }
  }

  function leadStatusLabel(value) {
    return value === 'contacted' ? '已聯絡' : (value === 'qualified' ? '有效機會' : (value === 'closed' ? '已結束' : '新名單'));
  }

  function renderLeadList(items) {
    leadsList.replaceChildren();
    if (!items.length) { var empty = document.createElement('p'); empty.style.padding = '14px'; empty.textContent = '這個條件下沒有潛在客戶資料。'; leadsList.appendChild(empty); return; }
    items.forEach(function (item) {
      var button = document.createElement('button'); button.type = 'button'; button.dataset.leadId = item.id; button.className = 'lead-item' + (item.id === selectedLeadId ? ' active' : '');
      var name = document.createElement('strong'); name.textContent = item.name || '未命名';
      var badge = document.createElement('span'); badge.className = 'lead-status ' + item.status; badge.textContent = leadStatusLabel(item.status);
      var summary = document.createElement('span'); summary.className = 'lead-summary'; summary.textContent = (item.company ? item.company + ' · ' : '') + item.contact + '\n' + item.request.slice(0, 90);
      button.append(name, badge, summary); button.onclick = function () { selectLead(item.id); }; leadsList.appendChild(button);
    });
  }

  function setLeadLink(container, value) {
    container.replaceChildren();
    if (!value) { container.textContent = '—'; return; }
    var link = document.createElement('a'); link.textContent = value;
    link.href = value.indexOf('@') >= 0 ? ('mailto:' + value) : ('tel:' + value.replace(/[^+\d]/g, ''));
    container.appendChild(link);
  }

  function selectLead(leadId) {
    var item = loadedLeads.find(function (lead) { return lead.id === leadId; });
    if (!item) return;
    selectedLeadId = item.id;
    document.getElementById('lead-name').textContent = item.name;
    document.getElementById('lead-meta').textContent = '#' + item.id.slice(0, 8) + ' · 建立於 ' + formatDate(item.created_at) + ' · ' + leadStatusLabel(item.status);
    setLeadLink(document.getElementById('lead-contact'), item.contact);
    document.getElementById('lead-company').textContent = item.company || '—';
    document.getElementById('lead-request').textContent = item.request;
    var source = document.getElementById('lead-source'); source.replaceChildren();
    if (item.source_page) { var link = document.createElement('a'); link.href = item.source_page; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = item.source_title || item.source_page; source.appendChild(link); }
    else source.textContent = item.source_title || '—';
    document.getElementById('lead-consent').textContent = formatDate(item.consented_at);
    document.getElementById('lead-assignee').textContent = item.assigned_to || '尚未指派';
    document.getElementById('lead-status-select').value = item.status;
    document.getElementById('lead-note').value = item.admin_note || '';
    ['lead-status-select','lead-note','lead-update','lead-delete'].forEach(function (id) { document.getElementById(id).disabled = !canEditSite(); });
    Array.from(leadsList.querySelectorAll('.lead-item')).forEach(function (button) { button.classList.toggle('active', button.dataset.leadId === item.id); });
  }

  async function loadLeads() {
    var refresh = document.getElementById('leads-refresh'); refresh.disabled = true;
    document.getElementById('leads-status').textContent = '正在載入名單…';
    try {
      var statusValue = document.getElementById('leads-filter').value;
      var search = document.getElementById('leads-search').value.trim();
      var result = await api('/api/admin/leads?site=' + encodeURIComponent(siteId) + '&status=' + encodeURIComponent(statusValue) + '&search=' + encodeURIComponent(search));
      loadedLeads = Array.isArray(result.leads) ? result.leads : [];
      renderLeadList(loadedLeads);
      document.getElementById('leads-status').textContent = loadedLeads.length ? ('目前顯示 ' + loadedLeads.length + ' 筆名單。') : '目前沒有符合條件的名單。';
      var target = loadedLeads.some(function (item) { return item.id === selectedLeadId; }) ? selectedLeadId : (loadedLeads[0] && loadedLeads[0].id);
      if (target) selectLead(target);
      else {
        selectedLeadId = ''; document.getElementById('lead-name').textContent = '請選擇一筆名單';
        ['lead-status-select','lead-note','lead-update','lead-delete'].forEach(function (id) { document.getElementById(id).disabled = true; });
      }
    } catch (error) { document.getElementById('leads-status').textContent = error.message; }
    finally { refresh.disabled = false; }
  }

  async function updateSelectedLead() {
    if (!selectedLeadId || leadBusy) return;
    leadBusy = true; document.getElementById('lead-update').disabled = true;
    document.getElementById('leads-status').textContent = '正在儲存名單進度…';
    try {
      await api('/api/admin/leads', { method:'POST', body:JSON.stringify({
        action:'update', siteId:siteId, leadId:selectedLeadId,
        status:document.getElementById('lead-status-select').value, note:document.getElementById('lead-note').value
      }) });
      await loadLeads(); await loadDashboardQueues(); document.getElementById('leads-status').textContent = '名單進度已更新。';
    } catch (error) { document.getElementById('leads-status').textContent = error.message; }
    finally { leadBusy = false; if (selectedLeadId) document.getElementById('lead-update').disabled = false; }
  }

  async function deleteSelectedLead() {
    if (!selectedLeadId || leadBusy || !confirm('確定要永久刪除這筆潛在客戶資料嗎？刪除後無法復原。')) return;
    leadBusy = true; document.getElementById('lead-delete').disabled = true;
    try {
      await api('/api/admin/leads', { method:'POST', body:JSON.stringify({ action:'delete', siteId:siteId, leadId:selectedLeadId }) });
      selectedLeadId = ''; await loadLeads(); await loadDashboardQueues(); document.getElementById('leads-status').textContent = '潛在客戶資料已永久刪除。';
    } catch (error) { document.getElementById('leads-status').textContent = error.message; }
    finally { leadBusy = false; }
  }

  function csvCell(value) {
    value = String(value == null ? '' : value).replace(/\r?\n/g, ' ');
    if (/^[=+\-@]/.test(value)) value = "'" + value;
    return '"' + value.replace(/"/g, '""') + '"';
  }

  function exportLeads() {
    if (!loadedLeads.length) { document.getElementById('leads-status').textContent = '目前沒有可匯出的名單。'; return; }
    var headers = ['編號','姓名','聯絡方式','公司／單位','需求','狀態','來源頁面','同意時間','建立時間','負責人','內部備註'];
    var rows = loadedLeads.map(function (item) { return [item.id,item.name,item.contact,item.company,item.request,leadStatusLabel(item.status),item.source_page,item.consented_at,item.created_at,item.assigned_to,item.admin_note]; });
    var csv = '\ufeff' + [headers].concat(rows).map(function (row) { return row.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    var url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
    var link = document.createElement('a'); link.href = url; link.download = 'leads-' + new Date().toISOString().slice(0, 10) + '.csv'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    document.getElementById('leads-status').textContent = '已匯出目前篩選結果。';
  }

  function supportStatusLabel(value) {
    return value === 'assigned' ? '處理中' : (value === 'resolved' ? '已結案' : '未接手');
  }

  function renderSupportList(items) {
    supportList.replaceChildren();
    if (!items.length) { var empty = document.createElement('p'); empty.style.padding = '14px'; empty.textContent = '這個篩選條件下沒有案件。'; supportList.appendChild(empty); return; }
    items.forEach(function (item) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'case-item' + (item.id === selectedSupportId ? ' active' : '');
      var title = document.createElement('strong'); title.textContent = item.subject || '需要真人客服協助';
      var badge = document.createElement('span'); badge.className = 'case-status ' + item.status; badge.textContent = supportStatusLabel(item.status);
      var meta = document.createElement('span'); meta.textContent = '#' + item.id.slice(0, 8) + ' · ' + formatDate(item.updated_at) + ' · ' + formatNumber(item.message_count) + ' 則';
      button.append(title, badge, meta); button.onclick = function () { selectSupport(item.id); }; supportList.appendChild(button);
    });
  }

  function renderSupportCase(state) {
    var item = state.case;
    selectedSupportId = item.id;
    document.getElementById('support-subject').textContent = item.subject || '需要真人客服協助';
    document.getElementById('support-meta').textContent = '#' + item.id.slice(0, 8) + ' · ' + supportStatusLabel(item.status) + (item.assigned_to ? ' · 處理者 ' + item.assigned_to : '');
    document.getElementById('support-assign').hidden = item.status !== 'open';
    document.getElementById('support-resolve').hidden = item.status === 'resolved';
    document.getElementById('support-reopen').hidden = item.status !== 'resolved';
    document.getElementById('support-reply').disabled = item.status === 'resolved' || !canEditSite();
    document.getElementById('support-send').disabled = item.status === 'resolved' || !canEditSite();
    document.getElementById('support-note').disabled = !canEditSite();
    document.getElementById('support-assign').disabled = !canEditSite();
    document.getElementById('support-resolve').disabled = !canEditSite();
    document.getElementById('support-reopen').disabled = !canEditSite();
    supportMessages.replaceChildren();
    (state.messages || []).forEach(function (message) {
      var box = document.createElement('div'); box.className = 'support-message ' + message.sender;
      var body = document.createElement('div'); body.textContent = message.body;
      var meta = document.createElement('small');
      var sender = message.sender === 'visitor' ? '訪客' : (message.sender === 'bot' ? '虛擬人' : (message.sender === 'agent' ? '客服' : (message.sender === 'note' ? '內部備註' : '系統')));
      meta.textContent = sender + ' · ' + formatDate(message.created_at);
      box.append(body, meta); supportMessages.appendChild(box);
    });
    if (!state.messages || !state.messages.length) { var empty = document.createElement('p'); empty.textContent = '這個案件還沒有訊息。'; supportMessages.appendChild(empty); }
    supportMessages.scrollTop = supportMessages.scrollHeight;
  }

  async function selectSupport(caseId) {
    if (!caseId) return;
    selectedSupportId = caseId;
    try {
      var state = await api('/api/admin/support?site=' + encodeURIComponent(siteId) + '&caseId=' + encodeURIComponent(caseId));
      renderSupportCase(state);
      Array.from(supportList.querySelectorAll('.case-item')).forEach(function (button) { button.classList.toggle('active', button.textContent.indexOf('#' + caseId.slice(0, 8)) >= 0); });
    } catch (error) { document.getElementById('support-status').textContent = error.message; }
  }

  async function loadSupport() {
    var refresh = document.getElementById('support-refresh'); refresh.disabled = true;
    try {
      var filter = document.getElementById('support-filter').value;
      var result = await api('/api/admin/support?site=' + encodeURIComponent(siteId) + '&status=' + encodeURIComponent(filter));
      var items = Array.isArray(result.cases) ? result.cases : [];
      renderSupportList(items);
      document.getElementById('support-status').textContent = items.length ? ('目前顯示 ' + items.length + ' 個案件。') : '目前沒有符合條件的案件。';
      var target = items.some(function (item) { return item.id === selectedSupportId; }) ? selectedSupportId : (items[0] && items[0].id);
      if (target) await selectSupport(target);
    } catch (error) { document.getElementById('support-status').textContent = error.message; }
    finally { refresh.disabled = false; }
  }

  async function supportAction(action) {
    if (!selectedSupportId || supportBusy) return;
    var reply = document.getElementById('support-reply');
    if ((action === 'reply' || action === 'note') && !reply.value.trim()) { document.getElementById('support-status').textContent = '請先輸入訊息。'; return; }
    supportBusy = true;
    try {
      var state = await api('/api/admin/support', { method:'POST', body:JSON.stringify({ siteId:siteId, caseId:selectedSupportId, action:action, body:reply.value }) });
      if (action === 'reply' || action === 'note') reply.value = '';
      renderSupportCase(state); await loadSupport(); await loadDashboardQueues();
      document.getElementById('support-status').textContent = action === 'reply' ? '回覆已傳送。' : (action === 'note' ? '內部備註已新增。' : '案件狀態已更新。');
    } catch (error) { document.getElementById('support-status').textContent = error.message; }
    finally { supportBusy = false; }
  }

  function scheduleSupportRefresh() {
    clearTimeout(supportTimer);
    supportTimer = setTimeout(async function () {
      if (!document.hidden && window.Clerk && window.Clerk.isSignedIn) await loadSupport();
      scheduleSupportRefresh();
    }, 10000);
  }

  function avatarStatus(message, type) {
    avatarConfigStatus.className = type || '';
    avatarConfigStatus.textContent = message;
  }

  function setAvatarConfigBusy(value) {
    avatarConfigBusy = value;
    ['avatar-preview', 'avatar-save', 'avatar-publish'].forEach(function (id) { document.getElementById(id).disabled = value; });
  }

  function assetUrl(value, label) {
    value = String(value || '').trim();
    if (!value) return '';
    if (/^https:\/\//i.test(value) || (/^(\/|\.\/|\.\.\/)[^\s]*$/.test(value) && !/^\/\//.test(value))) return value;
    throw new Error(label + '只接受 HTTPS 或站內相對路徑。');
  }

  function collectAvatarConfig() {
    var suggestions = document.getElementById('avatar-suggestions').value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
    if (suggestions.length > 8) throw new Error('提示問題最多 8 題。');
    var config = {
      name:document.getElementById('avatar-name').value.trim(), locale:document.getElementById('avatar-locale').value,
      mode:document.getElementById('avatar-mode').value, engine:document.getElementById('avatar-engine').value,
      model2d:assetUrl(document.getElementById('avatar-model2d').value, '2D 模型網址'),
      model3d:assetUrl(document.getElementById('avatar-model3d').value, '3D 模型網址'),
      fit:document.getElementById('avatar-fit').value, voice:document.getElementById('avatar-voice').value.trim(),
      welcome:document.getElementById('avatar-welcome').value.trim(), greeting:document.getElementById('avatar-greeting').value.trim(),
      fallback:document.getElementById('avatar-fallback').value.trim(), suggestions:suggestions,
      brandColor:document.getElementById('avatar-brand').value.toLowerCase(),
      width:Number(document.getElementById('avatar-width').value), height:Number(document.getElementById('avatar-height').value)
    };
    if (!config.name || !config.welcome || !config.greeting || !config.fallback) throw new Error('角色名稱、歡迎詞、點擊問候與未命中回覆都是必填。');
    if (config.engine === '2d' && !config.model2d) throw new Error('使用 2D 引擎時必須填寫 2D 模型網址。');
    if (config.engine === '3d' && !config.model3d) throw new Error('使用 3D 引擎時必須填寫 3D 模型網址。');
    if (!Number.isInteger(config.width) || config.width < 280 || config.width > 480) throw new Error('視窗寬度必須介於 280 到 480。');
    if (!Number.isInteger(config.height) || config.height < 380 || config.height > 720) throw new Error('視窗高度必須介於 380 到 720。');
    return config;
  }

  function setAvatarFields(config) {
    var values = {
      'avatar-name':config.name, 'avatar-locale':config.locale, 'avatar-mode':config.mode, 'avatar-engine':config.engine,
      'avatar-model2d':config.model2d, 'avatar-model3d':config.model3d, 'avatar-fit':config.fit, 'avatar-voice':config.voice,
      'avatar-welcome':config.welcome, 'avatar-greeting':config.greeting, 'avatar-fallback':config.fallback,
      'avatar-suggestions':(config.suggestions || []).join('\n'), 'avatar-brand':config.brandColor,
      'avatar-width':config.width, 'avatar-height':config.height
    };
    Object.keys(values).forEach(function (id) { document.getElementById(id).value = values[id] == null ? '' : values[id]; });
    document.getElementById('avatar-config-note').value = '';
  }

  function previewAvatarConfig() {
    try {
      var config = collectAvatarConfig();
      var query = new URLSearchParams({
        model:config.model2d, vrm:config.model3d, engine:config.engine, fit:config.fit, voice:config.voice,
        lang:config.locale, mode:config.mode, brand:config.brandColor, name:config.name,
        welcome:config.welcome, greeting:config.greeting, fallback:config.fallback,
        suggestions:JSON.stringify(config.suggestions), preview:'1'
      });
      Array.from(query.keys()).forEach(function (key) { if (!query.get(key)) query.delete(key); });
      avatarPreviewFrame.width = config.width;
      avatarPreviewFrame.height = config.height;
      avatarPreviewFrame.src = './widget.html?' + query.toString();
      avatarStatus('設定驗證成功；預覽已更新。', 'ok');
      return config;
    } catch (error) { avatarStatus(error.message, 'bad'); return null; }
  }

  function renderAvatarVersions(items) {
    avatarConfigVersions.replaceChildren();
    if (!items.length) { var empty = document.createElement('p'); empty.textContent = '尚無角色設定版本。'; avatarConfigVersions.appendChild(empty); return; }
    items.forEach(function (item) {
      var box = document.createElement('div'); box.className = 'config-version';
      var head = document.createElement('div'); head.className = 'config-version-head';
      var title = document.createElement('strong'); title.textContent = '設定 #' + item.id;
      var badge = document.createElement('span'); badge.className = 'badge' + (item.published ? ' live' : ''); badge.textContent = item.published ? '發布中' : (item.was_published ? '歷史發布' : '草稿');
      head.append(title, badge);
      var meta = document.createElement('span'); meta.textContent = formatDate(item.created_at);
      var memo = document.createElement('span'); memo.textContent = item.note || '沒有備註';
      box.append(head, meta, memo);
      if (!item.published && canEditSite()) { var restore = document.createElement('button'); restore.type = 'button'; restore.textContent = '還原並發布'; restore.onclick = function () { restoreAvatarConfig(item.id); }; box.appendChild(restore); }
      avatarConfigVersions.appendChild(box);
    });
  }

  function applyAvatarConfigState(state) {
    var current = state.current && state.current.config ? state.current : null;
    var config = current ? current.config : state.defaults;
    setAvatarFields(config);
    renderAvatarVersions(Array.isArray(state.versions) ? state.versions : []);
    var live = document.getElementById('avatar-config-live');
    live.className = 'badge' + (state.published ? ' live' : '');
    live.textContent = state.published ? ('發布中 #' + state.published.id) : '尚未發布';
    dashboardState('dashboard-avatar-state', state.published ? ('已發布 #' + state.published.id) : '尚未發布', state.published ? 'ok' : '');
    avatarConfigDirty = false;
    previewAvatarConfig();
    avatarConfigDirty = false;
    if (!current) avatarStatus('已載入安全預設值；完成設定後可先存草稿。', '');
    else if (state.published && current.id === state.published.id) avatarStatus('已載入發布中的設定 #' + current.id + '。', 'ok');
    else avatarStatus('已載入最新草稿設定 #' + current.id + '；網站仍使用已發布版本。', '');
  }

  async function loadAvatarConfig() {
    try { applyAvatarConfigState(await api('/api/admin/avatar-config?site=' + encodeURIComponent(siteId))); }
    catch (error) { avatarStatus(error.message, 'bad'); }
  }

  async function saveAvatarConfig(publish) {
    if (avatarConfigBusy) return;
    var config = previewAvatarConfig(); if (!config) return;
    setAvatarConfigBusy(true); avatarStatus(publish ? '正在發布角色設定…' : '正在儲存設定草稿…');
    try {
      var result = await api('/api/admin/avatar-config', { method:'POST', body:JSON.stringify({ action:'save', siteId:siteId, config:config, note:document.getElementById('avatar-config-note').value, publish:publish }) });
      applyAvatarConfigState(result.state);
      avatarStatus(publish ? ('已發布角色設定 #' + result.version.id + '。') : ('已儲存設定草稿 #' + result.version.id + '。'), 'ok');
    } catch (error) { avatarStatus(error.message, 'bad'); }
    finally { setAvatarConfigBusy(false); }
  }

  async function restoreAvatarConfig(versionId) {
    if (avatarConfigBusy || !confirm('確定要把設定 #' + versionId + ' 複製成新的發布版本嗎？')) return;
    setAvatarConfigBusy(true); avatarStatus('正在還原角色設定…');
    try {
      var result = await api('/api/admin/avatar-config', { method:'POST', body:JSON.stringify({ action:'restore', siteId:siteId, versionId:versionId }) });
      applyAvatarConfigState(result.state); avatarStatus('已還原並發布為設定 #' + result.version.id + '。', 'ok');
    } catch (error) { avatarStatus(error.message, 'bad'); }
    finally { setAvatarConfigBusy(false); }
  }

  function renderVersions(items) {
    versions.replaceChildren();
    if (!items.length) { var empty = document.createElement('p'); empty.textContent = '尚無版本。第一次發布後會出現在這裡。'; versions.appendChild(empty); return; }
    items.forEach(function (item) {
      var box = document.createElement('div'); box.className = 'version';
      var head = document.createElement('div'); head.className = 'version-head';
      var title = document.createElement('strong'); title.textContent = '版本 #' + item.id;
      var badge = document.createElement('span'); badge.className = 'badge' + (item.published ? ' live' : ''); badge.textContent = item.published ? '發布中' : (item.was_published ? '歷史發布' : '草稿');
      head.append(title, badge);
      var meta = document.createElement('span'); meta.textContent = formatDate(item.created_at) + ' · ' + item.entry_count + ' 筆';
      var memo = document.createElement('span'); memo.textContent = item.note || '沒有備註';
      box.append(head, meta, memo);
      if (!item.published && canEditSite()) {
        var restore = document.createElement('button'); restore.type = 'button'; restore.textContent = '復原並發布';
        restore.onclick = function () { restoreVersion(item.id); }; box.appendChild(restore);
      }
      versions.appendChild(box);
    });
  }

  function applyState(state) {
    var data = state.current && Array.isArray(state.current.entries) ? state.current.entries : (Array.isArray(window.KB) ? window.KB : []);
    editor.value = JSON.stringify(data, null, 2);
    note.value = '';
    dirty = false;
    renderPreview(data);
    renderVersions(Array.isArray(state.versions) ? state.versions : []);
    showStatus(state.current ? ('已載入發布版本 #' + state.current.id + '，共 ' + data.length + ' 筆。') : '還沒有發布版本，已載入內建知識庫作為起點。', state.current ? 'ok' : 'warn');
    dashboardState('dashboard-knowledge-state', state.current ? (data.length + ' 筆已發布') : '尚未發布', state.current ? 'ok' : '');
  }

  async function loadState() {
    try { applyState(await api('/api/admin/knowledge?site=' + encodeURIComponent(siteId))); }
    catch (error) { showStatus(error.message, 'bad'); }
  }

  async function save(publish) {
    if (busy) return;
    var data = validateAndPreview(); if (!data) return;
    setBusy(true); showStatus(publish ? '正在發布新版…' : '正在儲存草稿…');
    try {
      var result = await api('/api/admin/knowledge', { method:'POST', body:JSON.stringify({ action:'save', siteId:siteId, entries:data, note:note.value, publish:publish }) });
      applyState(result.state);
      showStatus(publish ? ('已發布版本 #' + result.version.id + '。') : ('已儲存草稿版本 #' + result.version.id + '。'), 'ok');
    } catch (error) { showStatus(error.message, 'bad'); }
    finally { setBusy(false); }
  }

  async function restoreVersion(versionId) {
    if (busy || !confirm('確定要把版本 #' + versionId + ' 複製成新的發布版本嗎？')) return;
    setBusy(true); showStatus('正在復原版本…');
    try {
      var result = await api('/api/admin/knowledge', { method:'POST', body:JSON.stringify({ action:'restore', siteId:siteId, versionId:versionId }) });
      applyState(result.state); showStatus('已復原並發布為版本 #' + result.version.id + '。', 'ok');
    } catch (error) { showStatus(error.message, 'bad'); }
    finally { setBusy(false); }
  }

  async function loadWorkspace() {
    selectedSupportId = ''; selectedLeadId = '';
    resetWorkspaceView();
    await Promise.all([loadState(), loadAvatarConfig(), loadAnalytics(), loadLeads(), loadSupport(), loadDashboardQueues()]);
    applyPermissionState();
    if (canOwnSite()) await loadSiteDetails();
  }

  async function switchSite(nextSiteId) {
    if (nextSiteId === siteId) return;
    if ((dirty || avatarConfigDirty) && !confirm('目前有尚未儲存的內容，確定要切換網站嗎？')) {
      document.getElementById('site-select').value = siteId; return;
    }
    var next = accessibleSites.find(function (item) { return item.id === nextSiteId; });
    if (!next) return;
    siteId = next.id; currentSiteRole = next.role; currentSiteKey = ''; dirty = false; avatarConfigDirty = false;
    try { localStorage.setItem('avatar-admin-site', siteId); } catch (error) {}
    renderSiteSelector(); applyPermissionState();
    activatePage(activePage, false);
    await loadWorkspace();
  }

  async function showAuthenticatedApp() {
    if (!window.Clerk.isSignedIn) {
      loaded = false; clearTimeout(supportTimer);
      showOnly(authView);
      var signIn = document.getElementById('sign-in'); signIn.replaceChildren(); window.Clerk.mountSignIn(signIn);
      return;
    }
    showOnly(app);
    var userButton = document.getElementById('user-button'); userButton.replaceChildren(); window.Clerk.mountUserButton(userButton);
    if (!loaded) {
      loaded = true;
      try { if (await loadSites()) { await loadWorkspace(); scheduleSupportRefresh(); } }
      catch (error) { loaded = false; document.getElementById('setup-message').textContent = error.message; showOnly(setup); }
    }
  }

  async function bootLocalPreview() {
    showOnly(app); loaded = true;
    document.getElementById('preview-banner').hidden = false;
    var userButton = document.getElementById('user-button'); userButton.textContent = '本機預覽'; userButton.className = 'badge live';
    if (await loadSites('demo-store')) await loadWorkspace();
    ['site-update','site-create-button','member-add-button','site-key-rotate','lead-update','lead-delete','support-assign','support-resolve','support-reopen','support-send','support-note']
      .forEach(function (id) { var element = document.getElementById(id); if (element) { element.disabled = true; element.title = '本機預覽模式不會寫入資料'; } });
    document.querySelectorAll('.member-row select,.member-row button').forEach(function (element) { element.disabled = true; });
  }

  async function boot() {
    try {
      if (LOCAL_PREVIEW) { await bootLocalPreview(); return; }
      var response = await fetch('/api/admin/config', { cache:'no-store' });
      var config = await response.json();
      if (!config.configured) {
        document.getElementById('setup-message').textContent = config.message || '登入或資料庫尚未設定。'; showOnly(setup); return;
      }
      await initClerk(config.publishableKey);
      window.Clerk.addListener(function () { showAuthenticatedApp(); });
      await showAuthenticatedApp();
    } catch (error) {
      document.getElementById('setup-message').textContent = error.message; showOnly(setup);
    }
  }

  document.getElementById('validate').onclick = validateAndPreview;
  document.getElementById('save').onclick = function () { save(false); };
  document.getElementById('publish').onclick = function () { save(true); };
  document.getElementById('analytics-refresh').onclick = loadAnalytics;
  document.getElementById('analytics-days').onchange = loadAnalytics;
  document.getElementById('support-refresh').onclick = loadSupport;
  document.getElementById('support-filter').onchange = function () { selectedSupportId = ''; loadSupport(); };
  document.getElementById('support-assign').onclick = function () { supportAction('assign'); };
  document.getElementById('support-resolve').onclick = function () { supportAction('resolve'); };
  document.getElementById('support-reopen').onclick = function () { supportAction('reopen'); };
  document.getElementById('support-send').onclick = function () { supportAction('reply'); };
  document.getElementById('support-note').onclick = function () { supportAction('note'); };
  document.getElementById('leads-refresh').onclick = loadLeads;
  document.getElementById('leads-filter').onchange = function () { selectedLeadId = ''; loadLeads(); };
  document.getElementById('leads-search').oninput = function () { clearTimeout(leadSearchTimer); leadSearchTimer = setTimeout(function () { selectedLeadId = ''; loadLeads(); }, 320); };
  document.getElementById('lead-update').onclick = updateSelectedLead;
  document.getElementById('lead-delete').onclick = deleteSelectedLead;
  document.getElementById('leads-export').onclick = exportLeads;
  document.getElementById('avatar-preview').onclick = previewAvatarConfig;
  document.getElementById('avatar-save').onclick = function () { saveAvatarConfig(false); };
  document.getElementById('avatar-publish').onclick = function () { saveAvatarConfig(true); };
  document.getElementById('site-select').onchange = function (event) { switchSite(event.target.value); };
  document.getElementById('sites-refresh').onclick = loadSiteDetails;
  document.getElementById('site-update').onclick = updateCurrentSite;
  document.getElementById('site-create-button').onclick = createNewSite;
  document.getElementById('member-add-button').onclick = addSiteMember;
  document.getElementById('site-key-rotate').onclick = rotateSiteKey;
  document.getElementById('site-key-copy').onclick = copySiteKey;
  document.getElementById('audit-refresh').onclick = loadAudit;
  document.querySelectorAll('[data-nav-page]').forEach(function (button) { button.onclick = function () { activatePage(button.dataset.navPage); }; });
  document.querySelectorAll('[data-go-page]').forEach(function (button) { button.onclick = function () { activatePage(button.dataset.goPage); }; });
  document.getElementById('dashboard-health-refresh').onclick = loadDashboardHealth;
  ['install-feature-knowledge','install-feature-analytics','install-feature-handoff','install-feature-leads'].forEach(function (id) {
    document.getElementById(id).onchange = function () { updateInstallCode(); markInstallUnchecked(); };
  });
  document.getElementById('install-script-origin').oninput = function () { updateInstallCode(); markInstallUnchecked(); };
  document.getElementById('install-copy-code').onclick = copyInstallCode;
  document.getElementById('install-run-checks').onclick = runInstallChecks;
  document.getElementById('install-reset-options').onclick = function () {
    ['install-feature-knowledge','install-feature-analytics','install-feature-handoff','install-feature-leads'].forEach(function (id) { document.getElementById(id).checked = true; });
    document.getElementById('install-script-origin').value = location.origin; updateInstallCode(); markInstallUnchecked();
  };
  document.getElementById('dashboard-copy-install').onclick = function () {
    var code = document.getElementById('dashboard-install-code').value;
    navigator.clipboard.writeText(code).then(function () {
      var button = document.getElementById('dashboard-copy-install'); button.textContent = '已複製';
      setTimeout(function () { button.textContent = '複製嵌入碼'; }, 1400);
    }).catch(function () { document.getElementById('dashboard-install-code').select(); });
  };
  window.addEventListener('hashchange', function () { activatePage(String(location.hash || '').replace(/^#/, ''), false); });
  document.querySelector('.avatar-settings').addEventListener('input', function () { avatarConfigDirty = true; });
  editor.addEventListener('input', function () { dirty = true; });
  window.addEventListener('beforeunload', function (event) { if (dirty || avatarConfigDirty) { event.preventDefault(); event.returnValue = ''; } });
  document.getElementById('file').onchange = function (event) {
    var file = event.target.files && event.target.files[0]; if (!file) return;
    file.text().then(function (text) { editor.value = text; dirty = true; validateAndPreview(); }).catch(function (error) { showStatus('讀取失敗：' + error.message, 'bad'); });
  };
  document.getElementById('download').onclick = function () {
    var data = validateAndPreview(); if (!data) return;
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type:'application/json' }));
    var link = document.createElement('a'); link.href = url; link.download = 'knowledge.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  };
  document.getElementById('copy').onclick = function () {
    var data = validateAndPreview(); if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(function () { showStatus('已複製有效的 JSON。', 'ok'); }).catch(function () { showStatus('瀏覽器拒絕複製，請手動選取內容。', 'bad'); });
  };
  document.getElementById('import-text').onclick = function () {
    try {
      var text = document.getElementById('source-text').value;
      var title = document.getElementById('source-title').value.trim() || '貼上的文字';
      mergeImported(entriesFromText(text, { type:'text', title:title }), title);
    } catch (error) { setImportStatus(error.message, 'bad'); }
  };
  document.getElementById('source-file').onchange = function (event) {
    importFile(event.target.files && event.target.files[0]).finally(function () { event.target.value = ''; });
  };
  document.getElementById('import-url').onclick = async function () {
    var input = document.getElementById('source-url');
    if (!input.value.trim()) { setImportStatus('請先輸入 HTTPS 網址。', 'bad'); return; }
    var button = document.getElementById('import-url'); button.disabled = true; setImportStatus('正在安全讀取網址…');
    try {
      var source = await api('/api/admin/source', { method:'POST', body:JSON.stringify({ siteId:siteId, url:input.value.trim() }) });
      mergeImported(entriesFromText(source.text, { type:'url', title:source.title, url:source.url }), source.title);
    } catch (error) { setImportStatus(error.message, 'bad'); showStatus('網址匯入失敗。', 'bad'); }
    finally { button.disabled = false; }
  };

  boot();
})();
