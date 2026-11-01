# PanShop

**掃一圈，就開賣。**

PanShop 把手機對著商品慢慢掃過一圈的影片，變成一間完整的店：去重後的商品清單、乾淨的商品圖、品名與描述、可直接上傳 Meta 的目錄檔、一個可購買頁，以及每件商品一支直式短影片。邊拍邊講，品名和價格就順便帶進來。

PanShop 是奇鋒國際（[PEAKQI](https://peakqi.com)，台北）參加 [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)（Startup 賽道，主題 *Build for Your World*）的作品。

[English](./README.md)

---

## 為什麼做這個

團購主、二手賣家、市集攤商、代購，商品每週都在換。上架 20 件商品，仍然要花一整天拍照、去背、寫文案、建目錄、剪影片。PanShop 把這一天壓縮成一段影片：一到三分鐘，就在商品原本擺著的桌上拍。

## 做什麼

1. **掃**：手機慢慢掃過所有商品，邊拍邊說品名和價格。
2. **切與去重**：SAM 3.1 找出每一件商品、跨影格追蹤，同一件實體只留一筆，出鏡再入鏡也不會重複算。
3. **認**：Muse Spark 看每件商品最清楚的幾張裁圖，加上 Muse Voice Transcribe 轉寫的口述，產生品名、屬性、分類、價格與描述。
4. **拍**：先用 SAM 遮罩合成白底圖，再由 Muse Image 以商品自己的裁圖為參考，生成棚拍圖與情境圖。
5. **確認**：一張表。改個價格、刪掉不賣的，就好。時間軸顯示每件商品在鏡頭內的秒數，離開又回來的商品仍然只算一件。
6. **開賣**：匯出 Meta Commerce Manager 目錄 CSV、打開可購買頁，每件商品都有一支含封面與文案的 9:16 短影片。

## 使用的 Meta 模型

| 模型 | 負責 |
|---|---|
| SAM 3.1（`sam-3.1`） | 以名詞片語分割影片、跨影格追蹤每件商品；每件挑最佳角度裁圖並用遮罩去背 |
| Muse Spark 1.3（`muse-spark-1.3`） | 品類列舉、裁圖比對去重、商品屬性、文案 |
| Muse Voice Transcribe（`muse-voice-transcribe-1.0`） | 口述的品名與價格，附 turn 級時間戳 |
| Muse Image（`muse-image-1.0`） | 棚拍圖、情境圖、短影片封面 |
| Muse Spark Open（開放權重，Baseten 託管） | 可購買頁的留言對商品與回覆草稿。*Built with Muse Spark Open.* |

## 管線怎麼跑

```
上傳（Blob 用戶端直傳）
  │
  ├─ 1 extract     ffmpeg：給 SAM 的 4 fps 720p 代理檔、總覽影格、24 kHz 單聲道 WAV
  ├─ 2 discover    Muse Spark 從總覽影格列出商品品類
  ├─ 3 segment     SAM 3.1 每個品類一次請求：框、遮罩、穩定物件 ID
  │                → track → 最佳角度裁圖 → 遮罩合成白底
  ├─ 4 dedup       規則：同時出現在畫面上的兩條 track 一定是不同件；
  │                時間不重疊的 track 才交給 Muse Spark 看裁圖比對
  ├─ 5 transcribe  Muse Voice Transcribe → 繁體中文 → 每句抽品名與價格
  ├─ 6 identify    Muse Spark 逐件：裁圖加上它入鏡時段的口述
  │
  ▼  確認表與時間軸（人只確認一次）
  │
  ├─ 7 shoot       Muse Image 以商品自己的裁圖生成棚拍圖與情境圖
  └─ 8 render      文案、Meta 目錄 CSV、可購買頁、每件一支 9:16 短影片
```

每個 stage 各占一次雲端函式呼叫，狀態寫回 job，任何一個 stage 都能單獨重跑。SAM 吃的是 4 fps 代理檔，3 分鐘影片每個品類不到 750 格。

## 架構

- **網站與管線**：Next.js 16（App Router）部署在 Vercel，Route Handler 跑各 stage，ffmpeg 來自 `ffmpeg-static`。
- **資料**：MongoDB Atlas（jobs、tracks、items、assets、comments），官方 driver 加 zod schema 與薄 repository 層。媒體（代理影片、影格、裁圖、去背、商品圖、短影片）放 Vercel Blob。
- **模型**：SAM 3.1、Muse Spark、Muse Voice Transcribe、Muse Image 走 Meta Model API；Muse Spark Open 走 Baseten 的 OpenAI 相容端點。
- **金鑰**：模型金鑰在 `/admin` 填一次，AES-256-GCM 加密存在 MongoDB；環境變數只是備援。

## 評測

第一組基準：一段 81 秒的合成桌面掃描影片，8 件商品 3 個品類（3 個杯子、3 本筆記本、2 雙鞋），音軌有口述的品名與價格，鏡頭掃到底再掃回來，讓 4 件商品出鏡再入鏡。標準答案在 `eval/labels/synthetic.json`。真實影片拍好後會補上數字。

| 指標 | 結果 |
|---|---|
| 去重後件數 | 8 件對 8 件，沒有幽靈件（4 件再入鏡的都併回去了） |
| 品名與屬性正確率 | 8 之 8 |
| 從口述帶入價格 | 8 之 8 |
| 只看畫面 vs 畫面加口述的品名正確率 | 待測 |
| 上傳到確認表的時間 | 約 4 分鐘（SAM 3.1 每個品類跑一次，各 13 到 18 秒） |
| 每次上架 API 成本 | 到確認表約 $0.45，含商品圖與短影片約 $0.7 |

同一段影片較早的版本跑出 10 件（兩段再入鏡沒併回、一本筆記本也被 `mug` 片語抓到）。修正就是管線裡寫的那幾條：在斷點切開 track、每條 track 做品類檢查、同時在畫面上的一定是不同件、命名後再做一輪合併。延遲與模型行為的量測見 `docs/api-notes.md`。

## 安裝

```bash
pnpm install
cp .env.example .env.local   # 填入下表的值
pnpm indexes                 # 建 MongoDB 索引
pnpm dev
```

| 變數 | 用途 |
|---|---|
| `MONGODB_URI`、`DATABASE_NAME` | MongoDB Atlas 連線 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store |
| `ADMIN_PASSCODE` | `/admin` 通行碼，模型金鑰在那裡填 |
| `SECRETS_MASTER_KEY` | 加密模型金鑰的 32 bytes base64 主鑰（`openssl rand -base64 32`） |
| `WORKER_SECRET` | stage 之間互相呼叫的共用密鑰（`openssl rand -hex 24`） |
| `UPLOAD_PASSCODE` | 上傳頁通行碼（選填） |
| `META_API_KEY`、`BASETEN_API_KEY`、`BASETEN_MODEL` | 沒在 `/admin` 存金鑰時的備援 |
| `FFMPEG_PATH` | 本機 ffmpeg（選填），沒設就用 `ffmpeg-static` |
| `NEXT_PUBLIC_SITE_URL` | 對外網址，stage 用它呼叫下一個 stage |

模型煙霧測試，每個指令只打一次 Meta Model API：

```bash
node --env-file=.env.local --import tsx eval/smoke/run.mts spark
node --env-file=.env.local --import tsx eval/smoke/run.mts sam-video path/to/clip.mp4 mug
node --env-file=.env.local --import tsx eval/smoke/run.mts voice path/to/clip.mp4
node --env-file=.env.local --import tsx eval/smoke/run.mts image
```

## 目錄

```
src/app/                 頁面：上傳、工作頁（進度、時間軸、確認表、產出）、可購買頁、/admin
src/app/api/             上傳 token、jobs、items、stage 執行、產出
src/lib/meta.ts          Meta Model API 封裝（Spark JSON、SAM 3.1 串流、Files、Muse Image、Voice Transcribe）
src/lib/baseten.ts       Muse Spark Open（Baseten）
src/lib/pipeline/        stage 執行器與八個 stage
src/lib/ffmpeg.ts        ffmpeg 工具（代理檔、影格、音軌；去背用 sharp）
src/models/              zod schema：job、track、item、asset、comment
src/repositories/        所有資料庫存取
eval/                    煙霧測試、標註的測試影片與準確率腳本
```

## 現況與參賽聲明

- 本 repo 所有程式碼皆於黑客松期間（2026 年 10 月 26 日至 11 月 4 日）撰寫。
- 本產品設計為我們既有、營運中的行銷內容 SaaS 的新模組。該產品只以連結接入，不包含在本 repo；本 repo 沒有任何既有程式碼或客戶素材。
- Demo 影片拍的是我們自己家裡的物品，沒有第三方商品或品牌。
- Instagram 與 WhatsApp 發布在藍圖中，不屬於本次送件範圍。目錄匯出採 Meta Commerce Manager 的 CSV 格式。

## 藍圖

- Instagram：以 Content Publishing API 發布 Reels；在有站內結帳的市場自動掛商品標籤；留言關鍵字自動私訊購買連結
- WhatsApp：目錄同步與對話下單
- 廣告：由生成的目錄直接建立 Advantage+ 目錄廣告草稿
- 影片導購：讓既有影片與直播回放可購買，留言自動對上商品

## 團隊

奇鋒國際有限公司（PEAKQI Co., Ltd.），台北。

## 授權

MIT，見 [LICENSE](./LICENSE)。
