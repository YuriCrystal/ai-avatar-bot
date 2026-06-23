# AI 虛擬人 Widget（Live2D 語音助理）

> 一個「一行 `<script>` 嵌入任何網站」的右下角 Live2D 語音 AI 虛擬人元件。
> 你可以對她說話，她會聽懂、回答、開口說話並即時對嘴。
>
> 設計成「**引擎（肉）＋ 可換的皮（角色模型）＋ 內容（知識庫）**」：核心通用，角色與內容用 `data-*` 自己換。
> **預設純前端、免後端、不依賴任何外部網域**（語音用瀏覽器內建；想要更自然的神經語音再選配一支 function）。

🔗 線上 Demo：<https://ai-avatar-bot-two.vercel.app>（請用 **Chrome 桌機**開啟）

---

## ✨ 功能

- **Live2D 動畫角色**＋即時**對嘴**（依實際音量驅動嘴型）
- **語音輸入（STT）**：瀏覽器內建語音辨識；也可**直接打字**（Enter／➤ 送出，IME 組字不誤送），回答一樣走語音＋對嘴
- **語音輸出（TTS）**：神經語音（自然女聲），失敗自動退回瀏覽器內建語音
- **大腦**：知識庫檢索（即時、零金鑰）＋可選的瀏覽器內 LLM（WebLLM，零金鑰）
- **一行嵌入**：`embed.js` 動態建立 iframe widget，不干擾宿主網站

## 🧱 架構

| 檔案 | 說明 |
|---|---|
| `index.html` | 示範 landing 頁（嵌入 widget） |
| `widget.html` | iframe 內的虛擬人本體（Live2D／STT／TTS／對嘴／LLM／檢索） |
| `embed.js` | 一行嵌入載入器（建 iframe ＋ `postMessage` 父子溝通 ＋ 對外 `window.AvatarWidget` API） |
| `knowledge.js` | 知識庫（FAQ 範例內容，可自行替換） |
| `demo-host.html` | 模擬「客戶網站」的示範頁 |
| `api/tts.js` | Vercel serverless function：取得神經語音 MP3 |
| `m1-standalone.html` | 早期里程碑的單檔版（純參考，可刪） |

預設**純前端（HTML/JS）**就能跑；神經語音才需要那支 serverless function（選配）。無資料庫。

## 📥 安裝（三種方式，由簡到進階）

### 方式 1 — 自帶安裝（推薦：純前端、免後端、不依賴任何外部網域）
把 `widget.html`、`embed.js`、`knowledge.js` 三個檔放進**你自己的網站**，貼一行：
```html
<script src="/path/embed.js"
        data-model="你的-live2d.model3.json"
        data-knowledge="你的-faq.json"></script>
```
全部在訪客瀏覽器裡跑，語音用瀏覽器內建（zh-TW）。**零後端、零金鑰、零雲端成本。**

### 方式 2 — 託管一行（最快試玩）
直接引用別人已部署好的 `embed.js`（⚠ 運算與流量算在那個部署擁有者頭上）：
```html
<script src="https://你的部署.vercel.app/embed.js"></script>
```

### 方式 3 — 完整版含「神經語音」（較自然的真人感嗓音）
神經語音需要 `api/tts.js`（serverless function）。把整包部署到 Vercel：
```bash
npm install
vercel --prod          # 本機開發：vercel dev
```
沒設 `data-api` 時 widget 會自動試同站的 `api/tts`，抓不到就退回瀏覽器語音。

## 🎭 換成你自己的 3D 角色（VRM）

這個元件**不夾帶任何 3D 角色**（避開授權與檔案大小問題）——3D 皮是「你自己的」。三種導入方式：

**① 拖放試玩（最快，零改 code）**
直接把你的 `.vrm` 檔**拖到角色身上**，立刻換成你的 3D 角色，還會自動長出 2D/3D 切換鈕。適合快速試。

**② 網址／embed 永久換**
- 嵌到你網站：`<script src="embed.js" data-vrm="你的.vrm"></script>`（再加 `data-model` 給 2D 就會有 2D/3D 切換鈕）
- 本機試：`widget.html?dev=1&engine=3d&vrm=你的.vrm`

**③ 哪裡拿 VRM？**
- **[VRoid Studio](https://vroid.com/studio)**（免費）→ 自己捏一個動漫角色、匯出 `.vrm`
- **[VRoid Hub](https://hub.vroid.com)** / **[Booth](https://booth.pm)** → 別人做好的模型

> ⚠ **授權**：每個 `.vrm` 內嵌作者設定的使用條款（可否商用／修改）——商用前務必確認；自己用 VRoid Studio 捏的最單純。
> 📦 **檔案大小**：VRM 通常 10–30MB，**別塞進 git**；放 CDN／GitHub Release／自己的網站，用 `data-vrm` 指過去。

## 🌐 瀏覽器需求

- **Chrome / Chromium 桌機**（語音辨識 `webkitSpeechRecognition` 僅 Chromium 支援）
- 想啟用 🧠 瀏覽器內 LLM：需 **WebGPU**（Chrome 113+）
- 麥克風（語音輸入用）；TTS 與 LLM 需要 **HTTPS**（或 localhost）

## ⚙️ 設定（`embed.js` 的 `data-*` 屬性）

| 屬性 | 作用 | 預設 |
|---|---|---|
| `data-model` | **皮（2D）**：Live2D `.model3.json` 網址 | 內建 Haru 範例 |
| `data-vrm` | **皮（3D）**：VRM `.vrm` 網址；設了就改走 3D（three-vrm）引擎，可拖放／換成自製 VRoid 角色 | 無（不設＝走 2D Live2D） |
| `data-engine` | 預設引擎 `2d`／`3d`；**同時給 `data-model` ＋ `data-vrm` 時，widget 會長出 2D/3D 即時切換鈕** | 有 2D 皮→`2d`，否則 `3d` |
| `data-knowledge` | **內容**：知識庫 JSON 網址（陣列 `[{q,kw,a}]`） | 內建 `knowledge.js` |
| `data-api` | **肉**：神經語音後端端點；不設＝純瀏覽器語音 | 試同站 `api/tts` |
| `data-voice` | 神經語音聲線（需後端支援） | `zh-TW-HsiaoChenNeural` |
| `data-widget` | `widget.html` 的網址 | 跟 `embed.js` 同目錄 |
| `data-open` | 是否一進站就展開（`false`＝先收成泡泡） | `true` |

對外 JS API：`window.AvatarWidget.open() / close() / say(text)`。

> 神經語音後端 `api/tts.js` 預設只接受「同網域來源」呼叫（防被當免費 TTS proxy）；可用環境變數 `TTS_ALLOWED_HOSTS`（逗號分隔）加白名單。**公開部署務必在 Vercel 開用量上限。**

---

## 📦 第三方資產與授權（**請務必先讀**）

本專案自己的程式碼採 **MIT**（見 `LICENSE`）。但它**相依**以下第三方，各有各的授權，**不在 MIT 範圍內**：

| 來源 | 授權 / 注意 |
|---|---|
| **Live2D Cubism Core**（CDN `cubism.live2d.com`） | **專有授權**（Live2D Proprietary Software License）。非開源，商用/再散佈須自行確認 Live2D 條款。 |
| **Haru 範例模型**（CDN，pixi-live2d-display 測試資產） | Live2D **Free Material License**，**僅供範例**。正式上線請換成你自有合法授權的模型。本 repo 不夾帶模型檔，採 CDN 引用。 |
| **pixi.js / pixi-live2d-display** | MIT |
| **@mlc-ai/web-llm**（WebLLM） | Apache-2.0；下載的模型權重各有授權（Qwen2.5 為其自身條款） |
| **msedge-tts**（`api/tts.js` 用） | 套件本身開源，但它連線的是**微軟 Edge 朗讀的「非官方」語音端點**（見下方風險） |

## ⚠️ 風險與限制揭露

- **TTS 走非官方端點**：`/api/tts` 透過 `msedge-tts` 連到微軟 Edge 朗讀的**非官方**語音服務（免帳號免金鑰）。**這不是官方支援、可能違反微軟服務條款、隨時可能失效或被封鎖。** 正式環境建議改接官方 **Azure Speech** 或其他有授權的 TTS。失效時 widget 會自動退回瀏覽器內建語音。
- **`/api/tts` 是公開端點**：預設只做「同網域來源檢查」＋輸入長度上限，**沒有完整限流**。自架者請務必在 **Vercel 專案層開啟用量上限（Spend Management）/ Firewall 限流**，避免被當免費 TTS proxy 灌爆帳單。
- **語音辨識會送到雲端**：`webkitSpeechRecognition` 在 Chrome 下會把**麥克風音訊上傳到瀏覽器廠商（Google）**處理，**並非本機辨識**。請告知你的使用者。
- **LLM 在本機**：WebLLM 模型下載後在使用者瀏覽器內運行，問答內容不外傳；首次需下載約 1GB 模型。

## 🔐 隱私（資料流向）

| 功能 | 資料去哪 |
|---|---|
| 語音輸入（STT） | 麥克風音訊 → 瀏覽器廠商雲端（Chrome 為 Google） |
| 語音輸出（TTS） | 要朗讀的文字 → 你的 `/api/tts` → 微軟非官方 TTS 端點 |
| 大腦（LLM／檢索） | **本機**，不外傳 |

本專案不自行儲存使用者資料；但部署平台（如 Vercel）預設可能保留 function 的請求日誌。

## 📝 內容說明

`knowledge.js` 內建的是「**這個元件本身的使用教學**」當示範內容（demo 讓虛擬人自己當說明書）。換成你自己的領域只要改 `knowledge.js`，或用 `data-knowledge` 指向你的 JSON。若你要拿來做特定領域（醫療、法律、金融等）的問答，請自行加上該領域必要的免責聲明。

## 🤝 貢獻

歡迎開 issue / PR。（若日後考慮商業授權，接受外部 PR 前可先設置 CLA。）

## 📄 授權

MIT — 見 [`LICENSE`](./LICENSE)。第三方資產不在此授權範圍，見上方表格。
