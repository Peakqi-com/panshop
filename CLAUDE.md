# CLAUDE.md — PanShop

本檔是專案最高層指引。開發任何功能前先讀 `docs/` 內對應文件；公司標準見技能 `peakqi-tech-stack`。

## 專案一句話

PanShop：小賣家對著桌上商品拍一段影片，系統用 SAM 3.1 切出每件商品並跨格去重、Muse Spark 與 Voice 辨識品名價格、Muse Image 做商品圖，匯出 Meta 目錄 CSV、可購買頁與每件一支直式短影片。Meta Global AI Developer Hackathon（Startup track）參賽作品，截止台北 2026-11-05 10:00。

## 技術棧（不可擅自更換）

- Next.js 16 App Router、TypeScript、React 19；部署 Vercel（team peakqicom），push main 自動上正式
- MongoDB Atlas（`DATABASE_NAME=panshop`），**原生 driver＋zod＋repository 層**，不用 Prisma／Mongoose
- 認證：無（黑客松版）。/admin 用 ADMIN_PASSCODE，上傳頁可選 UPLOAD_PASSCODE，管線自我呼叫用 WORKER_SECRET
- 模型：Meta Model API（sam-3.1、muse-spark-1.3、muse-voice-transcribe-1.0、muse-image-1.0），開放權重 Muse Spark Open 走 Baseten。比賽規則要求只用 Meta 模型，不接其他 LLM。金鑰在 /admin 加密存庫（src/lib/settings.ts），環境變數只是備援
- UI：Tailwind CSS＋shadcn/ui，全站繁體中文、全形標點
- 套件管理：pnpm

## 硬規則（違反即為 bug）

1. **資料存取只經過 `src/repositories/`**，UI 與 Server Action 不直接碰 collection。多租戶系統每個查詢都帶 `tenantId`。
2. **寫入前必過 zod schema**（`src/models/`）；日期存 `Date`，外部 id 存字串，主鍵用 ObjectId。
3. **可設定的值不寫死**（方案、點數、名額、截止日、費率）：放資料庫可編輯。
4. **索引寫在 `scripts/ensure-indexes.ts`**，新增 collection 同時補索引；沒有 migration，結構變更寫 `scripts/backfill-*.ts`。
5. **改版不強迫重登入**：新增欄位一律可選，舊帳號走原路徑，session 不可失效。
6. **表單**：伺服器退回錯誤時帶回原值並以 `key={attempt}` 重新掛載（React 19 會重置表單）。
7. **截圖與文件**一律用正式網域，不用 `*.vercel.app`；含個資先打馬賽克。
8. 環境變數只放 `.env.local`（已 gitignore），備份到 `~/.secrets/panshop.env`。

## 目錄

```
src/app/            路由與頁面（Server Components 優先）
src/lib/db.ts       MongoDB 連線（globalThis 快取）
src/models/         zod schema ＝ 資料結構
src/repositories/   所有查詢；聚合管線放這裡並命名
scripts/            ensure-indexes、backfill
docs/               需求、決策紀錄（對內）；對外文件另放 Documents
```

## 常用指令

```bash
pnpm dev                              # 開發
pnpm typecheck && pnpm lint           # 推前
pnpm tsx scripts/ensure-indexes.ts    # 建索引（idempotent）
```

## 專案特有規則

{{寫這個專案才有的規則：例如租戶隔離邊界、產出審核流、用量記錄}}

## 不要做

- 不升級到未驗證的大版本（Prisma 7、Next 17 等）而不先問
- 不在對外文件寫內部討論用語（核定、定案、Phase）
- 不用 `git add -A` 在共用工作區；批次刪除先搬 `_待刪除/`

## 本專案特有規則

- **對外文件（README、Demo、簡報）不得出現既有產品名稱與網址**，一律寫 our production marketing-content SaaS；不搬舊程式碼、不放客戶素材。
- repo 只放比賽期間新寫的程式與對外內容；討論紀錄、候選題、機率評估放 Documents/2.執行專案/24.競賽專區/Meta Global AI Developer Hackathon/01_內部討論。
- 影片處理全在雲端函式（ffmpeg-static）；本機只跑 `pnpm dev` 與 `eval/` 腳本。本機 8 GB 記憶體，不做大檔運算。
- 管線 8 個 stage 定義在 `src/models/job.ts`，實作在 `src/lib/pipeline/stages/`；每個 stage 可獨立重跑。
- Meta API 封裝只在 `src/lib/meta.ts`；每次呼叫記費用到 `job.metrics.costUsd`。
