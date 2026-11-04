# PanShop

**掃一圈，就開賣。**

PanShop 是台灣與亞洲直播、團購賣家的開播前後台。開播前，手機對著商品慢慢掃一圈，就有帶下單代碼（A1、A2…）的商品清單、商品圖、品名與描述、可直接上傳 Meta 的目錄檔、可購買頁，以及每件一支直式短影片。直播中和直播後，觀眾留言「A3+1」，PanShop 把整串留言整理成訂單表。邊拍邊講，品名和價格就順便帶進來。

對還沒有商品目錄的社群賣家來說，PanShop 是接上 Meta 目錄、商店與目錄廣告的入口。

PanShop 是奇鋒國際（[PEAKQI](https://peakqi.com)，台北）參加 [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)（Startup 賽道，主題 *Build for Your World*）的作品。

[English](./README.md)

---

## 為什麼做這個

台灣與東南亞的直播、團購是靠留言成交的：主播拿起一件商品，觀眾打「A3+1」。賣家現在用的留言下單工具，都假設商品清單已經建好，有代碼、照片和價格。但建一份 20 件的清單，拍照、去背、寫文案、建目錄仍要花大半天，而且商品每週都在換，每週都要重來。

電商平台和二手 App 的拍照上架工具，一張照片處理一件，也沒有下單代碼。PanShop 用一支影片建好整份帶代碼的清單，補在留言下單的前面，跟這些工具互補而不是競爭：

| 時段 | PanShop 做什麼 |
|---|---|
| 開播前 | 掃一圈 1 到 3 分鐘，就有帶代碼的清單、商品圖、目錄、可購買頁和每件一支短片 |
| 直播中與直播後 | 整串留言變成訂單表：「A3+1」用規則解析，提問交給 Muse Spark Open |
| 每週 | 再掃一次更新清單（跟上週比對庫存差異在藍圖中） |

## 做什麼

**線上試用：** https://panshop-meta-hackathon.vercel.app

1. **掃、匯入或回放**：手機慢慢掃過所有商品、邊拍邊說品名和價格；或丟一疊商品照片；或上傳直播回放。三個入口共用同一條管線。
2. **切與去重**：SAM 3.1 找出每一件商品、跨影格追蹤，同一件實體只留一筆，出鏡再入鏡也不會重複算。照片走 SAM 的圖片模式，一張照片一次呼叫。
3. **認**：Muse Spark 看每件商品最清楚的幾張裁圖，加上 Muse Voice Transcribe 轉寫的口述，產生品名、屬性、分類、價格與描述。
4. **確認**：一張表。改價格、合併或拆分、刪掉不賣的。時間軸顯示每件商品在鏡頭內的秒數，離開又回來的商品仍然只算一件。
5. **拍**：Muse Spark 依每件商品自己的裁圖寫視覺簡報，Muse Image 生成三個棚拍角度（正面、四十五度、側面）與一張情境圖，再由 Muse Spark 逐張比對原品；不合格的帶著問題重生一次。
6. **開賣**：每件商品都有下單代碼（A1、A2…）。匯出 Meta Commerce Manager 目錄 CSV；手機版可購買頁的下單按鈕直接帶顧客到賣家的 Instagram、LINE 或簡訊；每件商品一支 9:16 形象短片。
7. **導短片**：Muse Spark 先把每支短片寫成 4 到 5 場的分鏡，包含用哪張圖、鏡頭運動、字幕，以及含語氣指令的旁白。合成時把棚拍圖去背放到風格背景上，加字幕、大標、價格與音樂，再混入旁白。賣家可以逐場改字、換圖、單場重寫文字或重生畫面、調順序、從後台曲庫選音樂，然後重新合成。
8. **直播接單**：把直播或貼文的留言整串貼進來，一行一則。「A3+1」「A3 x2」「+1 B1」「王小美：A1+1 B2 x2」這類下單用規則解析，不呼叫模型，直接整理成含買家、商品、數量、小計的訂單表，可下載 CSV。「A3 多少」「還有藍色的嗎」這類提問交給 Muse Spark Open，對上商品並草擬回覆。

## 使用的 Meta 模型

| 模型 | 負責 |
|---|---|
| SAM 3.1（`sam-3.1`） | 以名詞片語分割影片、跨影格追蹤每件商品；每件挑最佳角度裁圖並用遮罩去背 |
| Muse Spark 1.3（`muse-spark-1.3`） | 品類列舉、裁圖比對去重、商品屬性、文案、視覺簡報、商品圖品管、短片分鏡 |
| Muse Voice Transcribe（`muse-voice-transcribe-1.0`） | 口述的品名與價格，附 turn 級時間戳 |
| Muse Image（`muse-image-1.0`） | 三角度棚拍圖、情境圖、9:16 分鏡場景圖，全部以商品自己的裁圖為參考 |
| Muse Spark Open（開放權重，Baseten 託管） | 直播與貼文留言裡的提問：判斷意圖、對上商品代碼、草擬回覆。「A3+1」這類下單留言先用規則解析。*Built with Muse Spark Open.* |

整條流程用的全是 Meta 模型。Model API 沒有語音合成模型，所以短片不用合成語音：Muse Voice Transcribe 標出賣家講到每件商品的那一句，合成時從原始音軌切出來，放在主角那一場。賣家沒講到的商品，或口述語言和短片語言不同時，短片只有字幕和音樂。

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
  ├─ 5 transcribe  Muse Voice Transcribe → 每句抽品名與價格
  ├─ 6 identify    Muse Spark 逐件：裁圖加上它入鏡時段的口述
  │
  ▼  確認表與時間軸（人只確認一次）
  │
  ├─ 7 shoot       Muse Spark 視覺簡報 → Muse Image 三角度加情境 → Muse Spark 品管，不合格重生一次
  └─ 8 render      文案、Meta 目錄 CSV、可購買頁；每件先由 Muse Spark 寫分鏡，缺的場景由 Muse Image 補，
                   再用 canvas 逐格加 ffmpeg 合成，混入旁白與音樂
```

每個 stage 各占一次雲端函式呼叫，狀態寫回 job，任何一個 stage 都能單獨重跑。SAM 吃的是 4 fps 代理檔，3 分鐘影片每個品類不到 750 格。

## 架構

- **網站與管線**：Next.js 16（App Router）部署在 Vercel，Route Handler 跑各 stage，ffmpeg 來自 `ffmpeg-static`。
- **資料**：MongoDB Atlas（jobs、tracks、items、assets、comments），官方 driver 加 zod schema 與薄 repository 層。媒體（代理影片、影格、裁圖、去背、商品圖、短影片）放 Vercel Blob。
- **模型**：SAM 3.1、Muse Spark、Muse Voice Transcribe、Muse Image 走 Meta Model API；Muse Spark Open 走 Baseten 的 OpenAI 相容端點。
- **金鑰**：模型金鑰在 `/admin` 填一次，AES-256-GCM 加密存在 MongoDB；環境變數只是備援。
- **權限**：沒有帳號系統。建立掃描的瀏覽器會拿到一個隨機編輯 token（httpOnly cookie），資料庫只存它的 SHA-256 雜湊。所有會改資料或花模型額度的路由都檢查這個 token 或管理員登入，所以分享出去的掃描網址對其他人是唯讀（`src/lib/owner.ts`）。
- **後台**：`/admin` 有每日成本總覽、工作列表（逐 stage 重跑與刪除）、存在資料庫的系統設定、加密金鑰、音樂曲庫、留言紀錄，以及逐一呼叫每個模型的健康檢查。

## 評測

repo 裡有兩段測試影片，較長那段的標準答案在 `eval/labels/synthetic.json`。

**合成影片 81 秒，3 個品類 8 件。** 鏡頭會掃回去，讓 4 件商品離開又回到畫面；音軌口述品名與價格。

| 指標 | 結果 |
|---|---|
| 去重後件數 | 8 件對 8 件，沒有幽靈件（4 件再入鏡的都併回去了） |
| 品名與屬性正確率 | 8 之 8 |
| 從口述帶入價格 | 8 之 8 |
| 上傳到確認表的時間 | 正式站約 4 分 15 秒（SAM 3.1 每個品類跑一次，各 13 到 18 秒） |

**20 秒影片，3 個品類 3 件。** 2026-11-01 在正式站用目前的商品圖與短片流程完整跑一次：

| 步驟 | 結果 |
|---|---|
| 上傳到確認表 | 2 分 26 秒，3 件品名與價格全對 |
| 確認到完成 | 5 分 5 秒：12 張商品圖、3 支 17 到 18 秒短片 |
| 模型總成本 | 0.46 美元 |

8 件影片早期跑出 10 件（兩段再入鏡沒併回、一本筆記本也被 `mug` 抓到）。修法就是管線裡寫的：在空檔切開 track、每段 track 驗證品類、同時出現在畫面的一定是不同件、命名後再合併一次。實測延遲與模型行為見 `docs/api-notes.md`。

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

CI 每次 push 都會跑：`pnpm typecheck`、`pnpm lint`、`pnpm test`（價格解析、留言下單解析、語氣指令、分鏡 schema、去背、狀態文字中英對照的單元測試）與 `pnpm build`。

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
src/lib/video/           分鏡、場景圖、去背、合成、配音、音樂
src/lib/owner.ts         每個掃描的編輯權檢查
src/lib/ffmpeg.ts        ffmpeg 工具（代理檔、影格、音軌；去背用 sharp）
src/models/              zod schema：job、track、item、asset、comment、music、settings
src/repositories/        所有資料庫存取
eval/                    煙霧測試、標註的測試影片與準確率腳本
tests/                   單元測試（vitest）
```

## 現況與參賽聲明

- 本 repo 所有程式碼皆於黑客松期間（2026 年 10 月 26 日至 11 月 5 日）撰寫。
- 本產品設計為我們既有、營運中的行銷內容 SaaS 的新模組。該產品只以連結接入，不包含在本 repo；本 repo 沒有任何既有程式碼或客戶素材。
- Demo 影片拍的是我們自己家裡的物品，沒有第三方商品或品牌。
- Instagram 與 WhatsApp 發布在藍圖中，不屬於本次送件範圍。目錄匯出採 Meta Commerce Manager 的 CSV 格式。
- 不使用合成語音：旁白是賣家原聲，用 Muse Voice Transcribe 定位。所有理解與生成內容的模型都是 Meta 模型。

## 藍圖

1. **直播回放 → 商品真實片段與訂單**：依每件商品的 SAM 追蹤區段，從回放剪出該商品被介紹的真實 9:16 片段（真實畫面、成本幾乎為零）；訂單與每件的庫存（選填）存檔。
2. **每週再掃 → 庫存差異**：用去重同一套裁圖比對，把這週的商品對上上週，列出新進、還在、已售出，目錄把已售出標成缺貨而不是刪除。
3. **Meta 串接**：目錄改用 Catalog API 同步、發布 Reels、建立 Advantage+ 目錄廣告草稿；通過 App Review 後以 Graph API 直接讀直播留言。
4. **語音**：實測 Muse Voice Transcribe 聽台語報價（例如「這个一百五」），台灣直播很常見。

## 團隊

奇鋒國際有限公司（PEAKQI Co., Ltd.），台北。

## 授權

MIT，見 [LICENSE](./LICENSE)。
