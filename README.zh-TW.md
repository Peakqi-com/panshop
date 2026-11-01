# PanShop 掃一圈，就開賣

**手機掃一圈，你的店就開好了。**

PanShop 把手機慢慢掃過商品的一段影片，變成一整間店：去重後的商品清單、乾淨的商品圖、品名與描述、可直接上傳 Meta 的目錄檔、一個可購買頁，以及每件商品一支直式短影片。邊掃邊講，品名與價格就跟著進來。

PanShop 為 [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)（Startup 賽道，主題 *Build for Your World*）參賽作品，由台北的 [奇鋒國際 PEAKQI](https://peakqi.com) 開發。

[English README](./README.md)

---

## 為什麼做這個

團購主、二手賣家、市集攤商、代購每週換一批商品。上架 20 件商品仍然要花一整天拍照、去背、寫文案、建目錄、剪影片。PanShop 把這一天壓縮成鏡頭掃一圈：一到三分鐘的影片，商品就擺在原本的桌上拍。

## 功能

1. **掃**：手機慢慢掃過所有商品，邊掃邊講品名與價格。
2. **切與去重**：SAM 3.1 找出每一件商品並跨影格追蹤，同一件商品出鏡再入鏡仍只算一件。
3. **認**：Muse Spark 讀每件商品的最佳裁圖，加上掃拍時的口述（由 Muse Voice Transcribe 轉出），產生品名、屬性、分類、價格與描述。
4. **拍照**：Muse Image 以每件商品自己的裁圖為參考，生成白底圖與情境圖。
5. **確認**：一張表，改個價格、刪掉不賣的，完成。
6. **開賣**：匯出 Meta Commerce Manager 目錄 CSV、打開可購買頁，每件商品都有一支含封面與文案的 9:16 影片。

## 使用的 Meta 模型

| 模型 | 用途 |
|---|---|
| SAM 3.1（`sam-3.1`） | 以名詞片語分割並跨影格追蹤每件商品，取每件的最佳角度裁圖 |
| Muse Spark 1.3（`muse-spark-1.3`） | 品類列舉、裁圖比對去重、商品屬性、文案 |
| Muse Voice Transcribe（`muse-voice-transcribe-1.0`） | 口述的品名與價格，含時間戳 |
| Muse Image（`muse-image-1.0`） | 白底圖、情境圖、影片封面 |
| Muse Glimmer（開放權重，微調） | 輕量的商品分類與留言意圖分類器。*Built with Muse Glimmer.* |

## 架構

```
影片 ──► ffmpeg（2 fps 影格、音軌）
          │
          ├─► Muse Spark：從總覽影格列出品類
          │       └─► SAM 3.1 逐品類：遮罩、框、穩定追蹤 ID
          │               └─► 去重：追蹤 ID + Spark 裁圖比對 ──► 商品
          └─► Muse Voice Transcribe：品名、價格、時間戳 ───────┘
                                                                 │
                                    確認表 ◄─────────────────────┘
                                       │
              Muse Image（商品圖）── Spark（文案）── Glimmer（分類）
                                       │
              目錄 CSV · 可購買頁 · 每件一支 9:16 影片
```

- 網頁與 API：Next.js，部署於 Vercel
- 影片 worker：Modal（ffmpeg、SAM 3.1、Voice、Spark、Muse Image、影片合成）
- 開放權重推論：Muse Glimmer 於 Fireworks 微調與部署
- 資料：MongoDB Atlas（中繼資料）與 Vercel Blob（影格、裁圖、圖片、影片）

## 評測

以比賽期間實拍的 15 件、3 個品類桌面掃拍影片量測，數字量到後填入。

| 指標 | 結果 |
|---|---|
| 去重後件數準確率 | 待量測 |
| 品名與屬性正確率 | 待量測 |
| 品名正確率：只看畫面 vs 畫面加口述 | 待量測 |
| 3 分鐘影片處理時間 | 待量測 |
| 每次上架的 API 成本 | 待量測（估計 1 美元以內） |

## 狀態與參賽聲明

- 本 repo 全部程式碼皆於比賽期間（2026 年 10 月 26 日至 11 月 4 日）撰寫。
- 產品設計為我們正式營運中的行銷內容 SaaS 的新模組。該產品僅以連結接入，本 repo 不含任何既有程式碼或客戶素材。
- Demo 影片是掃過我們自己家用物品的一段影片，不含第三方商品或品牌。
- Instagram 與 WhatsApp 發布功能列於藍圖，不在本次繳交範圍。目錄匯出採 Meta Commerce Manager CSV 格式。

## 開始使用

安裝步驟、環境變數與範例影片將隨管線完成陸續補上。

```
apps/web/          Next.js：上傳、進度、確認表、產出頁、可購買頁
workers/pipeline/  Modal worker：ffmpeg、SAM 3.1、Voice、Spark、Muse Image、影片合成
workers/classify/  Muse Glimmer 微調與推論
packages/schema/   共用型別：job、track、item、asset
eval/              標註好的測試影片與準確率腳本
```

## 藍圖

- Instagram：以 Content Publishing API 發布 Reels；在有站內結帳的市場自動掛商品標籤；留言轉私訊購買連結
- WhatsApp：目錄同步與對話下單
- 廣告：由生成的目錄建立 Advantage+ 目錄廣告草稿
- 影片導購：讓既有影片與直播回放可購買，留言自動對上商品

## 團隊

奇鋒國際有限公司（PEAKQI Co., Ltd.），台灣台北。

## 授權

MIT，見 [LICENSE](./LICENSE)。
