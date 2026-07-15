/* =====================================================================
 * api/tts.js — Vercel serverless function
 * 用 msedge-tts 取得微軟「神經語音」(曉臻等) 的 MP3，回傳給前端播放。
 * 免帳號免金鑰。失敗時前端會自動退回瀏覽器內建語音(Yating)。
 *
 * ⚠ 風險與防護（詳見 README）：
 *  - msedge-tts 走的是微軟「非官方」端點，可能違反 ToS、隨時可能失效。
 *  - 這支端點是公開的；此處只做「同網域來源檢查 + 輸入長度上限 + voice 白名單」，
 *    不是完整限流。自架者請務必在 Vercel 專案層開用量上限 / Firewall 限流，
 *    避免被當免費 TTS proxy 灌爆帳單。
 * ===================================================================== */
let _mod;
async function lib() { if (!_mod) _mod = await import('msedge-tts'); return _mod; }

// 允許的聲線白名單（避免被拿去合成任意語言/聲音）
const VOICES = new Set([
  'zh-TW-HsiaoChenNeural', 'zh-TW-HsiaoYuNeural', 'zh-TW-YunJheNeural',
  'zh-CN-XiaoxiaoNeural', 'en-US-AriaNeural', 'en-US-JennyNeural',
  'ja-JP-NanamiNeural',
]);

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch (e) { return ''; } }

// 來源檢查：只允許「與本服務同網域」或環境變數 TTS_ALLOWED_HOSTS 指定的來源；localhost 放行供開發
function isAllowed(req) {
  const self = (req.headers.host || '').toLowerCase();
  const extra = (process.env.TTS_ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allow = new Set([self, ...extra]);
  const ref = req.headers.origin || req.headers.referer || '';
  const h = hostOf(ref);
  if (!h) return false;                                   // 沒有來源（curl/腳本）→ 擋
  if (allow.has(h)) return true;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h)) return true;
  return false;
}

// 簡易 in-memory 限流：best-effort（Vercel 每個實例各自計數、冷啟動會重置），擋單一 IP 明顯灌爆。
// 要跨實例的「硬」限流請接 Upstash / Vercel KV；此處不依賴任何外部服務、零設定。
const RL_WINDOW_MS = 60 * 1000, RL_MAX = 30;
const _hits = new Map();                                  // ip -> { n, reset }
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || 'unknown';
}
function rateLimited(req) {
  const ip = clientIp(req), now = Date.now();
  let e = _hits.get(ip);
  if (!e || now > e.reset) { e = { n: 0, reset: now + RL_WINDOW_MS }; _hits.set(ip, e); }
  e.n++;
  if (_hits.size > 5000) { for (const [k, v] of _hits) if (now > v.reset) _hits.delete(k); } // 防 Map 無限長
  return e.n > RL_MAX;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    if (Buffer.byteLength(raw) > 4096) throw new Error('body too large');
    return JSON.parse(raw || '{}');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    if (!isAllowed(req)) { res.statusCode = 403; res.end('forbidden: bad origin'); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Allow', 'POST, OPTIONS'); res.end('method not allowed'); return; }
    if (rateLimited(req)) { res.statusCode = 429; res.setHeader('Retry-After', '60'); res.end('rate limited'); return; }

    const body = await readJsonBody(req);
    const text = String(body.text || '').slice(0, 600).trim();
    let voice = String(body.voice || 'zh-TW-HsiaoChenNeural');
    if (!VOICES.has(voice)) voice = 'zh-TW-HsiaoChenNeural';
    if (!text) { res.statusCode = 400; res.end('missing text'); return; }

    const { MsEdgeTTS, OUTPUT_FORMAT } = await lib();
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(escapeXml(text)); // escape 防 SSML 注入

    const buf = await new Promise((resolve, reject) => {
      const chunks = [];
      const timer = setTimeout(() => { try { audioStream.destroy && audioStream.destroy(); } catch (e) {} reject(new Error('tts timeout')); }, 20000);
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      audioStream.on('error', (e) => { clearTimeout(timer); reject(e); });
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, no-store'); // 對話文字不進共享快取或 CDN 日誌 key
    res.end(buf);
  } catch (e) {
    console.error('[tts]', e && e.message || e);
    res.statusCode = 502;
    res.end('tts error');
  }
};
