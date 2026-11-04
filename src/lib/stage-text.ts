/**
 * 管線寫進資料庫的 stage 備註與錯誤是中文，畫面上依介面語言轉換。
 * 已知的句型逐一對照；不認得的錯誤對一般使用者只顯示通用說明，管理員才看原文。
 */
import type { T } from "@/lib/i18n";

const NOTES: [RegExp, (m: RegExpMatchArray) => [string, string]][] = [
  [/^(\d+) 張照片$/, (m) => [m[0], `${m[1]} photos`]],
  [/^(\d+) 件（(\d+) 張照片）$/, (m) => [m[0], `${m[1]} items (${m[2]} photos)`]],
  [/^無音軌，略過$/, (m) => [m[0], "No audio track, skipped"]],
  [/^沒有聽到語音$/, (m) => [m[0], "No speech heard"]],
  [/^(\d+) 句，(\d+) 句有價格$/, (m) => [m[0], `${m[1]} sentences, ${m[2]} with prices`]],
  [/^(\d+) 件，(\d+) 件用到口述(?:，合併 (\d+) 件重複)?$/, (m) => [m[0], `${m[1]} items, ${m[2]} used speech${m[3] ? `, ${m[3]} duplicates merged` : ""}`]],
  [/^(\d+) 支短影片$/, (m) => [m[0], `${m[1]} short videos`]],
  [/^短影片 (\d+)\/(\d+)，繼續…$/, (m) => [m[0], `Videos ${m[1]}/${m[2]}, continuing…`]],
  [/^(\d+) 件商品圖$/, (m) => [m[0], `Photos for ${m[1]} items`]],
  [/^商品圖 (\d+)\/(\d+)，繼續…$/, (m) => [m[0], `Photos ${m[1]}/${m[2]}, continuing…`]],
];

/** 使用者自己能處理的失敗原因：換影片、剪短、換格式 */
const USER_ERRORS: [RegExp, (m: RegExpMatchArray) => [string, string]][] = [
  [/^影片 (\d+) 秒，上限 (\d+) 秒/, (m) => [`影片 ${m[1]} 秒，超過 ${m[2]} 秒上限，請剪短後重新上傳。`, `The video is ${m[1]}s, over the ${m[2]}s limit. Please trim it and upload again.`]],
  [/^讀不到影片長度/, () => ["讀不到影片長度，格式可能不支援，請改用 MP4 或 MOV。", "Couldn't read the video length. The format may be unsupported; please use MP4 or MOV."]],
  [/^沒有辨識到任何商品品類/, () => ["畫面裡沒有找到商品。請讓商品清楚入鏡、光線充足，再試一次。", "No products were found. Make sure products are clearly in frame and well lit, then try again."]],
  [/^沒有(照片|影片|總覽影格|品類|商品可辨識|track 可去重|已確認的商品)/, () => ["這段素材裡沒有可以處理的商品，請換一段影片或照片再試一次。", "Nothing in this upload could be processed. Please try a different video or photos."]],
  [/^下載失敗 4\d\d/, () => ["影片網址無法下載，請確認是可直接下載的 https 影片檔。", "The video link couldn't be downloaded. Make sure it's a direct https link to a video file."]],
];

export function stageNote(note: string | undefined, t: T): string {
  if (!note) return "";
  for (const [re, f] of NOTES) { const m = note.match(re); if (m) return t(...f(m)); }
  return note;
}

export function stageError(error: string | undefined, t: T, isAdmin: boolean): string {
  const e = (error ?? "").trim();
  for (const [re, f] of USER_ERRORS) { const m = e.match(re); if (m) return t(...f(m)); }
  if (isAdmin) return e;
  return t("系統處理時出了問題，我們已收到紀錄。你可以換一段影片重新上傳。", "Something went wrong on our side and it has been logged. You can try uploading a different video.");
}
