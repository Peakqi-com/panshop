# Meta Model API 實測筆記（2026-11-01）

量測環境：台北、Node 22、`src/lib/meta.ts`。數字是單次觀察，不是基準測試。

## 延遲與費用

| 呼叫 | 輸入 | 延遲 | 費用 |
|---|---|---|---|
| Muse Spark 1.3 chat，JSON schema，effort low | 一句文字 | 3 秒 | $0.0015 |
| Muse Spark 1.3，8 張影格列品類 | 8 張 1080p JPEG | 8 到 9 秒 | 約 $0.02 |
| Muse Spark 1.3，逐件辨識（3 到 4 張裁圖＋口述） | 每件 | 4 到 8 秒 | 約 $0.01 |
| Muse Image generations 1024² | 文字 | 9 秒 | $0.01 |
| Muse Image edits，4 張參考圖 | 文字＋圖 | 10 到 20 秒 | $0.01 |
| Muse Voice Transcribe，80 秒 WAV，ENDPOINTING | 24 kHz 單聲道 | 11 秒 | $0.004 |
| Files API 上傳 7 MB MP4 | | 8 到 9 秒 | 免費 |
| SAM 3.1 影片，324 格（81 秒 × 4 fps）、一個名詞片語 | file_id | 13 到 18 秒 | $0.065 |

一段 80 秒、8 件、3 品類的影片跑完全部 8 個 stage，API 費用約 $0.6（商品圖 20 張占 $0.2）。

## 行為觀察

- **SAM 影片**：物件 ID 在物件出鏡再入鏡時多數保持不變（黃色玻璃杯離開 50 秒後回來仍是同一 ID）。但一個 ID 偶爾會在物件離開後被另一個相似物件接走（皮革日誌本接續了杯子的 ID），所以 track 仍要在時間斷點處切開。一個名詞片語會抓到形狀相近的其他東西（`mug` 抓到日誌本），需要第二道品類驗證。
- **SAM 遮罩**：`one_bit` 編碼的遮罩 raster 尺寸等於 `bounds` 框的尺寸，用 `decodeMaskToRaster` 直接得到 row-major 0/1 陣列。用 sharp 合成時注意 resize／blur 會把單通道升成三通道，要 `extractChannel(0)` 再 `joinChannel`，否則 stride 錯位出現橫紋。
- **Spark JSON 輸出**：偶爾回空字串（推理用完 token），重試一次、放大 `max_completion_tokens` 並把 effort 降到 low 即可。證據明確時偶爾仍把價格填 null，程式端要有確定性的補救。
- **Spark 文案**：偶爾夾雜其他文字系統的字（例如西里爾字母），輸出要清洗。
- **Voice Transcribe**：輸出為簡體中文，用 OpenCC `cn → twp` 轉繁。turn 級時間戳與實際口述時間對得上（誤差一秒內）；同一句講兩件商品時會合成一個 turn，價格要靠下游拆。`languageBias` 用英文語言名，例如 `["Chinese", "English"]`。
- **Muse Image edits**：以商品自己的 3 到 4 張裁圖當參考，棚拍白底圖與情境圖對原品相當忠實（顏色、條紋、把手形狀都保留）。提示詞把忠實度拆成外型、材質、印刷文字三層分別講效果較穩。
- **Muse Spark Open（Baseten）**：OpenAI 相容，`reasoning_content` 另外回傳；`max_tokens` 太小時正文會是空的，要給 1500 以上。
- **Vercel Blob**：公開 Blob 會被 CDN 快取，覆蓋同一路徑後模型可能拿到舊圖；每次重跑要用新路徑。
