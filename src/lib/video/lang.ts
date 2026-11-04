/**
 * 產出內容的語言：job.language 為 en 開頭時，品名、文案、分鏡、短片畫面字都用英文；其他（zh-TW、舊資料）照原本繁中。
 * 這裡只放純函式，前後端與測試都能用。
 */
import { isEnglishJob } from "@/lib/i18n";

export const isEn = (job: { language?: string }) => isEnglishJob(job.language);

/** 結尾行動呼籲 */
export const ctaText = (code: string, en: boolean) => (en ? `Comment ${code} for the link` : `留言 ${code} 取得連結`);
/** 沒有價格時畫面與文案用的字 */
export const noPriceText = (en: boolean) => (en ? "DM for price" : "價格請私訊");
/** 價格顯示：英文用 NT$1,980 這類寫法 */
export function priceLabel(price: number, currency: string, en: boolean) {
  if (!en) return `${currency} ${price.toLocaleString()}`;
  const sym: Record<string, string> = { TWD: "NT$", USD: "$", HKD: "HK$", JPY: "¥", EUR: "€", GBP: "£", SGD: "S$", MYR: "RM " };
  return `${sym[currency] ?? `${currency} `}${price.toLocaleString("en-US")}`;
}

/** 接在各 prompt 的 system 後面：英文掃描要求全部文字欄位寫英文，蓋掉繁中專屬的規則 */
export const EN_RULE =
  "LANGUAGE OVERRIDE: this shop sells in English. Write every human-readable text field (names, titles, descriptions, captions, hooks, narration, subtitles, selling points, CTA) in natural, concise US English, even if the instructions, field descriptions or the seller's speech are in Chinese. Ignore any rule that says to write Traditional Chinese or to spell prices out in Chinese numerals; write prices with digits and the currency symbol (e.g. NT$1,980). Keep any length limits given in Chinese characters roughly equivalent in English (about 1 Chinese character ≈ 0.6 English words; narration about 2.5 English words per second).";

export const withLang = (system: string, en: boolean) => (en ? `${system}\n\n${EN_RULE}` : system);
