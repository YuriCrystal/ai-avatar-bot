# AI Avatar Widget (Live2D / VRM Voice Assistant)

[繁體中文](README.md) | **English**

> A bottom-right-corner voice AI avatar you can embed into **any website with one `<script>` line**.
> Talk to the avatar — the character listens, answers, speaks out loud, and lip-syncs in real time.
>
> Designed as "**engine (the body) + swappable skin (character model) + content (knowledge base)**": the core is generic; swap the character and content via `data-*` attributes.
> **Pure front-end by default — no backend, no external domains required** (voice uses the browser's built-in engines; an optional serverless function upgrades you to neural voice).

🔗 Live demo: <https://ai-avatar-bot-two.vercel.app> (open in **desktop Chrome**)

![Demo: Live2D voice avatar in the bottom-right corner of a landing page](docs/demo-landing.jpg)

## 🧭 Operations dashboard

![AI avatar operations dashboard with conversation analytics, human support, leads, avatar status, and knowledge-base status](docs/admin-dashboard.png)

Manage avatar settings, versioned knowledge, anonymous analytics, human-support cases, leads and bookings, installation snippets, and member permissions from one workspace. Open `admin.html?preview=1` for read-only sample data; production mode uses Clerk authentication and Neon Postgres persistence.

---

## ✨ Features

- **Live2D animated character** with real-time **lip-sync** (mouth driven by actual audio volume)
- **Sentence-by-sentence speech**: long answers are chunked — the avatar starts speaking the first sentence while prefetching the next; with the 🧠 in-browser LLM it **speaks while still generating**
- **Emotion expressions (3D)**: the character's face follows the answer (happy / surprised / sorry), easing back to neutral after speaking
- **Two personality modes**: default "guide assistant"; `data-mode="companion"` enables a **companion** experience with continuous conversation and local memory (stored only in the visitor's browser; say "忘記我" / "forget me" to wipe)
- **Voice input (STT)**: browser built-in speech recognition; or just **type** (Enter / ➤ to send, IME-composition safe) — answers still come back as voice + lip-sync
- **Voice output (TTS)**: selectable male or female neural voices, with automatic same-language browser fallback
- **Brain**: knowledge-base retrieval (instant, zero API keys) + optional in-browser LLM (WebLLM, zero API keys)
- **One-line embed**: `embed.js` creates an iframe widget without touching the host site

## 🧱 Architecture

| File | What it is |
|---|---|
| `index.html` | Demo landing page (embeds the widget) |
| `widget.html` | The avatar itself inside the iframe (Live2D / VRM / STT / TTS / lip-sync / LLM / retrieval) |
| `embed.js` | One-line embed loader (creates the iframe + parent↔iframe `postMessage` + public `window.AvatarWidget` API) |
| `tool-router.js` | Tool intent scoring, ambiguity handling, argument extraction, and input-schema validation |
| `knowledge.js` | Knowledge base (sample FAQ content — replace with your own) |
| `demo-host.html` | A fake "customer website" to demo embedding |
| `admin.html` / `admin.js` | Responsive operations dashboard, local preview, authentication, and management workflows |
| `api/admin/` | Authenticated dashboard endpoints |
| `lib/` | Multitenancy, persistence, authorization, audit, URL safety, analytics, support, and lead services |
| `db/migrations/` | Neon Postgres schema migrations |
| `knowledge-builder.js` | Source cleanup, chunking, suggested questions, keywords, and provenance metadata |
| `api/tts.js` | Vercel serverless function: fetches neural-voice MP3 |
| `m1-standalone.html` | Early single-file milestone (reference only, safe to delete) |

The default demo widget still runs as **pure front-end HTML/JS**. Neural voice is optional; the authenticated operations dashboard, persistent versions, analytics, support, and lead management use serverless functions plus Clerk and Neon Postgres.

## 📥 Install (three ways, easiest first)

### Option 1 — Self-hosted (recommended: pure front-end, no backend, no external domains)
Copy `widget.html`, `embed.js`, `knowledge.js` into **your own site**, then add one line:
```html
<script src="/path/embed.js"
        data-model="your-live2d.model3.json"
        data-knowledge="your-faq.json"></script>
```
Everything runs in the visitor's browser, using built-in voices. **Zero backend, zero API keys, zero cloud cost.**

### Option 2 — Hosted one-liner (fastest to try)
Point at someone's already-deployed `embed.js` (⚠ compute & traffic are billed to whoever owns that deployment):
```html
<script src="https://your-deployment.vercel.app/embed.js"></script>
```

### Option 3 — Full setup with neural voice (more natural, human-like voice)
Neural voice needs `api/tts.js` (a serverless function). Deploy the whole repo to Vercel:
```bash
npm install
vercel --prod          # local dev: vercel dev
```
Without `data-api`, the widget tries same-origin `api/tts` automatically and falls back to browser voice if unavailable.

## 🎭 Bring your own 3D character (VRM)

<img src="docs/demo-3d-vrm.jpg" alt="3D VRM character (made in VRoid, imported by drag & drop)" width="380" align="right">

This widget **ships with no 3D character** (avoids licensing and file-size problems) — the 3D skin is **yours**. Three ways to import:

**① Drag & drop (fastest, zero code)**
Drag your `.vrm` file **onto the avatar** — it instantly becomes your 3D character, and a 2D/3D toggle button appears automatically. Great for a quick try.

**② URL / embed (permanent)**
- On your site: `<script src="embed.js" data-vrm="your.vrm"></script>` (add `data-model` for 2D and you get the 2D/3D toggle)
- Local testing: `widget.html?dev=1&engine=3d&vrm=your.vrm`

**③ Where do I get a VRM?**
- **[VRoid Studio](https://vroid.com/studio)** (free) → design your own anime character, export as `.vrm`
- **[VRoid Hub](https://hub.vroid.com)** / **[Booth](https://booth.pm)** → models made by others
- **No time to make one? Try an official free sample** (paste the URL into `data-vrm` / `?vrm=`; all verified to work):
  - `Alicia` (Niconi Solid-chan, 7.8MB, [terms](https://3d.nicovideo.jp/alicia/rule.html))
    `https://cdn.jsdelivr.net/gh/vrm-c/UniVRM@master/Tests/Models/Alicia_vrm-0.51/AliciaSolid_vrm-0.51.vrm`
  - `Seed-san` (VirtualCast, [VRM Public License 1.0](https://vrm.dev/en/licenses/1.0/index))
    `https://cdn.jsdelivr.net/gh/vrm-c/vrm-specification@master/samples/Seed-san/vrm/Seed-san.vrm`
  - `Sample` (pixiv three-vrm official example)
    `https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm`

> ⚠ **Licensing**: every `.vrm` embeds usage terms set by its author (commercial use / modification) — check before commercial use; characters you make yourself in VRoid Studio are the simplest case.
> 📦 **File size**: VRMs are typically 10–30MB — **don't commit them to git**; host on a CDN / GitHub Release / your own site and point `data-vrm` at it.

<br clear="all">

## 🌐 Browser requirements

- **Desktop Chrome / Chromium** (speech recognition `webkitSpeechRecognition` is Chromium-only)
- For the 🧠 in-browser LLM: **WebGPU** (Chrome 113+)
- Microphone (for voice input); TTS and LLM require **HTTPS** (or localhost)

### Live voice conversation

After the visitor presses **🎙️ Live** and grants microphone access, the widget cycles through listening, about one second of silence detection, answering, and listening again. The control bar shows the live input level, partial transcript, and current listening/thinking/speaking state. Visitors can interrupt an answer; local voice-activity detection stops speech and unfinished output before listening again.

Voice-activity detection uses `getUserMedia`, echo cancellation, noise suppression, and automatic gain control in page memory only; raw audio is not stored. Closing the widget, backgrounding the page, pressing the microphone button again, or three consecutive no-speech runs releases the microphone. Chromium's Web Speech service still performs transcription in the cloud.

## ⚙️ Configuration (`data-*` attributes on `embed.js`)

| Attribute | What it does | Default |
|---|---|---|
| `data-config` | **Central avatar configuration**: published config endpoint such as `/api/avatar-config?site=default` | disabled |
| `data-site` | **Tenant site ID**: usually inferred from configured endpoint query strings, or set explicitly | `default` |
| `data-site-key` | **Public tenant write identifier**: protects analytics, support, and lead writes from tenant mix-ups | unset; required when `REQUIRE_SITE_KEY=true` |
| `data-model` | **Skin (2D)**: Live2D `.model3.json` URL | Built-in Haru sample |
| `data-model-mobile` | **Lightweight mobile skin (2D)**: replaces `data-model` on narrow screens or data-saver connections | unset |
| `data-fallback-model` | **Fallback skin (2D)**: loaded automatically when the custom model fails | public Haru sample |
| `data-zoom` | **2D half-body zoom**: safe range `1`–`3` | `1.9` |
| `data-look` | **Optional pointer gaze**: `true` follows the pointer; set `false` to keep the avatar's gaze independent | `true` |
| `data-vrm` | **Skin (3D)**: VRM `.vrm` URL; setting it switches to the 3D (three-vrm) engine; supports drag & drop / your own VRoid character | none (unset = 2D Live2D) |
| `data-engine` | Default engine `2d` / `3d`; **give both `data-model` + `data-vrm` and the widget grows a live 2D/3D toggle** | `2d` if a 2D skin exists, else `3d` |
| `data-mode` | **Personality**: `assistant` guide / `companion` (💬 one-tap continuous conversation + local memory) | `assistant` |
| `data-lang` | Conversation language: `zh-TW`, `en-US`, `ja-JP`, or `ko-KR` | `zh-TW` |
| `data-knowledge` | **Content**: knowledge-base JSON URL (array of `[{q,kw,a}]`) | built-in `knowledge.js` |
| `data-analytics` | **Optional anonymous analytics** endpoint, such as `/api/events?site=default` | disabled |
| `data-handoff` | **Optional in-widget human support** endpoint, such as `/api/handoff?site=default` | disabled |
| `data-leads` | **Optional inquiry / booking collection** endpoint on the host site's origin | disabled |
| `data-api` | **Voice backend**: neural TTS endpoint; unset = browser voice only | tries same-origin `api/tts` |
| `data-voice` | Neural voice name (backend must support it) | `zh-TW-HsiaoChenNeural` |
| `data-widget` | URL of `widget.html` | same directory as `embed.js` |
| `data-open` | Start expanded (`false` = collapsed bubble) | open on desktop, collapsed on mobile |
| `data-width` / `data-height` | Per-page widget dimensions; width 280–480, height 380–720 | published config or 340×480 |

Pointer gaze remains available to open-source users by default. Add `data-look="false"` to the embed tag when you prefer not to use it.

Public JS API: `window.AvatarWidget.open() / close() / say(text) / ask(text) / setContext(context) / setLocale(locale) / setExpression(name) / registerTool(definition) / unregisterTool(name) / setHandoff(options) / on(name, handler) / off(name, handler)`.

`setContext()` accepts bounded strings, numbers, booleans, and string arrays. Do not put passwords, tokens, full card numbers, or other secrets in it. Registered tool functions stay in the parent page and are never copied into the iframe. Tool routing scores `keywords`, `examples`, labels, descriptions, priority, and route thresholds; it asks the visitor to resolve close matches or supply required schema fields. Mutating actions should keep `requiresConfirmation:true`.

**Content white-labeling (`window.KB_META`)**: in your `knowledge.js`, set `window.KB_META = { name, welcome, greeting, sgLabel, suggestions:[…], fallback }` to make the welcome line, greeting, suggestion chips, and not-found fallback follow your domain — the same engine can be a support bot, home-repair helper, museum guide, etc. (unset = defaults).

> The neural-voice backend `api/tts.js` only accepts **same-origin** calls by default (so it can't be farmed as a free TTS proxy); allowlist extra origins with the `TTS_ALLOWED_HOSTS` env var (comma-separated). **If you deploy publicly, set a spend cap on Vercel.**

### Avatar configuration center

Administrators can manage the character name, assistant/companion mode, locale, Live2D or VRM URL, default engine, framing, TTS voice, welcome copy, click greeting, fallback answer, suggestion prompts, brand color, and widget dimensions without editing code. **Validate and preview** only updates the dashboard preview; **Save draft** creates a version without changing the public site; **Publish** updates the public configuration endpoint. Model URLs must be HTTPS or same-site relative paths.

### Anonymous usage analytics

Add `data-analytics="/api/events?site=default"` to see 7/30/90-day sessions, question counts, miss rate, human-support requests, top questions, and knowledge gaps. Analytics is opt-in: without the attribute no event is sent, and it is disabled when Do Not Track is enabled or companion mode is active.

Stored fields are a random session ID, question text, answer source, and matched knowledge question—not account IDs, names, IP addresses, or full answers. Common email addresses and long digit sequences are redacted first. Retention defaults to 180 days and can be set to 7–730 days with `ANALYTICS_RETENTION_DAYS`.

### In-widget human support

With `data-handoff="/api/handoff?site=default"`, a confirmed request for a human creates a support case and sends the latest 12 conversation turns to the dashboard. Visitors keep chatting in the same widget; agent replies poll back every five seconds. Agents can claim, reply, add visitor-hidden notes, resolve, and reopen cases.

The visitor access token stays in that tab's `sessionStorage`; only its hash is stored in the database. Cross-site requests are rejected and endpoints have baseline rate limits. Resolved cases default to 365-day retention, configurable from 30–1825 days with `SUPPORT_RETENTION_DAYS`.

### Leads and booking requests

With `data-leads="/api/leads?site=default"`, the avatar can collect a name, email or phone number, request details, and an optional company name. The visitor must explicitly accept the privacy policy and confirm submission; declining cancels without saving.

The dashboard can search and filter new, contacted, qualified, and closed leads; assign owners; manage internal notes; permanently delete records; and export formula-injection-safe CSV. The API accepts same-origin host-page requests, applies baseline limits, and does not store IP addresses. Retention defaults to 365 days and can be set to 30–1825 days with `LEADS_RETENTION_DAYS`.

### Multiple sites and member roles

Each site's avatar, knowledge, analytics, leads, and support data is isolated by `siteId`. `ADMIN_USER_IDS` defines global administrators; each site Owner can add Clerk users with these roles:

- **Viewer** — read-only access.
- **Editor** — publish avatar/knowledge content and handle leads/support, but cannot manage members.
- **Owner** — Editor access plus site and member management.

Every admin API verifies the Clerk token, validates the site ID, and checks membership server-side. Invalid site IDs never fall back to `default`, and every site must retain at least one Owner.

New sites receive an `avk_…` public write identifier for the embed tag. It is visible in public HTML and is not a password; it prevents guessed or misconfigured site IDs from writing into another tenant. Set `REQUIRE_SITE_KEY=true` in production. Rotating the key immediately invalidates the old value and requires updating every embed.

### Audit log and health endpoint

Site Owners can inspect recent publishing, restore, lead, support, membership, and public-key operations. Audit rows contain the Clerk user ID, action, target type/ID, and timestamp only—never knowledge content, conversations, contacts, requests, notes, tokens, or public keys. Retention defaults to 365 days and is configurable from 30–2555 days with `AUDIT_RETENTION_DAYS`.

`GET /api/health` returns only `ok` or `degraded`, so monitors can verify application/database health without exposing environment variables, record counts, or internal error details.

### Build knowledge from documents

- Import PDF, text, Markdown, existing JSON, or pasted content. PDF text extraction happens in the administrator's browser; the original file is not uploaded.
- Import a public HTTPS page through the authenticated backend. Private/reserved networks, non-standard ports, excessive redirects, unsupported content types, and oversized responses are rejected.
- Content is cleaned, chunked, and turned into suggested questions and keywords with source metadata. Imports remain an editable preview until an administrator saves or publishes them.
- PDF limits: 30 MB, 300 pages, and 500,000 characters. Web source limit: 2 MB. Image-only PDFs require OCR first.
- Import only material you own, are licensed to use, or may lawfully reproduce.

### Production dashboard setup

1. Install Clerk and Neon from Vercel Marketplace so Vercel injects authentication settings and `DATABASE_URL`.
2. Fill `ADMIN_USER_IDS` and `ADMIN_ALLOWED_ORIGINS` from `.env.example`. Site Owners add other members after they first sign in.
3. For local work, run `vercel env pull .env.local --yes`, then `vercel dev`.
4. Tables are created on first use; production operators may instead run `db/migrations/` in order from Neon SQL Editor.

Admin APIs verify the Clerk token signature, authorized party/origin, global administrator list, and per-site role. Never put `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or `DATABASE_URL` in front-end code or Git. Only `CLERK_PUBLISHABLE_KEY` is public.

---

## 📦 Third-party assets & licenses (**read this first**)

This project's own code is **MIT** (see `LICENSE`). It **depends on** the following third parties, each under its own license, **not covered by MIT**:

| Source | License / notes |
|---|---|
| **Live2D Cubism Core** (CDN `cubism.live2d.com`) | **Proprietary** (Live2D Proprietary Software License). Not open source; check Live2D's terms for commercial use / redistribution. |
| **Haru sample model** (CDN, pixi-live2d-display test asset) | Live2D **Free Material License**, **demo only**. Replace with your own properly licensed model in production. This repo doesn't bundle model files; they're CDN-referenced. |
| **“Mu (free edition)” Live2D skin** (local demo only) | Obtained/purchased by the project owner from **bilibili Workshop**. It is not covered by this project's MIT license. Copyright, commercial use, modification, and redistribution follow the author's product terms. The model stays under the Git-ignored `models/` directory. |
| **pixi.js / pixi-live2d-display** | MIT |
| **three.js / @pixiv/three-vrm** | MIT |
| **@mlc-ai/web-llm** (WebLLM) | Apache-2.0; downloaded model weights carry their own licenses (Qwen2.5 under its own terms) |
| **PDF.js / pdfjs-dist** | Apache-2.0; loaded from a pinned jsDelivr version for local browser extraction |
| **Cheerio** | MIT |
| **Clerk SDK / Neon serverless driver** | SDKs are MIT; hosted Clerk and Neon services have their own service terms and plan limits |
| **msedge-tts** (used by `api/tts.js`) | The package is open source, but it talks to Microsoft Edge Read Aloud's **unofficial** voice endpoint (see risks below) |

## ⚠️ Risks & limitations

- **TTS uses an unofficial endpoint**: `/api/tts` reaches Microsoft's **unofficial** Edge Read Aloud voice service via `msedge-tts` (no account, no key). **This is unsupported, may violate Microsoft's ToS, and can break or get blocked at any time.** For production, switch to official **Azure Speech** or another licensed TTS. When it fails, the widget automatically falls back to the browser's built-in voice.
- **`/api/tts` is a public endpoint**: by default it only does same-origin checks + input length limits + best-effort in-memory rate limiting — **not hard rate-limiting**. If you self-host, enable **Vercel Spend Management / Firewall rate limits** so it can't be farmed as a free TTS proxy.
- **Public write endpoints still need edge protection**: analytics, support, and lead APIs enforce tenant keys, origin checks, validation, and baseline limits, but public production deployments should also use Vercel Firewall rate limits.
- **Speech recognition goes to the cloud**: in Chrome, `webkitSpeechRecognition` uploads microphone audio to the browser vendor (**Google**) — it is **not** on-device. Tell your users.
- **The LLM is local**: WebLLM runs entirely in the user's browser after a one-time ~1GB model download; conversations never leave the device.

## 🔐 Privacy (where data goes)

| Feature | Data destination |
|---|---|
| Voice input (STT) | Microphone audio → browser vendor's cloud (Google, for Chrome) |
| Voice output (TTS) | Text to speak → your `/api/tts` → Microsoft's unofficial TTS endpoint |
| Brain (LLM / retrieval) | **Local**, never leaves the browser |
| Memory (companion mode) | **Local and isolated by site ID**: visitor's browser `localStorage`; say "forget me" to wipe |
| Optional anonymous analytics | Your Neon database: redacted question metadata and random session ID |
| Optional human support | Your Neon database: case transcript, replies, status, and notes; visitor token remains in the tab and only its hash is stored |
| Optional leads / bookings | Your Neon database: explicitly consented contact and request data |
| Admin audit log | Your Neon database: administrator ID, action, target, and timestamp; no content or secrets |

If analytics, support, and lead endpoints are not configured, those records are not collected. When enabled, data is stored in your own Neon database under the documented retention settings. Hosting platforms such as Vercel may separately retain function request logs according to your account settings.

## 📝 About the sample content

The built-in `knowledge.js` contains **the widget's own user guide** as demo content (the avatar acts as its own manual). To adapt it to your domain, edit `knowledge.js` or point `data-knowledge` at your own JSON. For regulated domains (medical, legal, financial…), add the appropriate disclaimers yourself.

## 🤝 Contributing

Issues / PRs welcome. (If commercial licensing ever becomes a concern, consider a CLA before accepting external PRs.)

## 📄 License

MIT — see [`LICENSE`](./LICENSE). Third-party assets are not covered; see the table above.
