/**
 * 介面語言：只有繁中與英文兩種，字串就寫在用到的地方 t("中文", "English")，不另建字典檔。
 * 這個檔案前後端共用，不可 import next/headers。
 */
export type Lang = "zh" | "en";
export const LANG_COOKIE = "lang";
export type T = (zh: string, en: string) => string;
export const makeT = (lang: Lang): T => (zh, en) => (lang === "en" ? en : zh);

/** 有 cookie 用 cookie；沒有就看瀏覽器語言，中文用繁中，其他一律英文 */
export function pickLang(cookie: string | undefined, acceptLanguage: string | null | undefined): Lang {
  if (cookie === "zh" || cookie === "en") return cookie;
  return /^\s*zh/i.test(acceptLanguage ?? "") ? "zh" : "en";
}

/** 產出內容的語言（job.language）：英文介面建的掃描，品名、描述、短片都用英文 */
export const jobLanguage = (lang: Lang) => (lang === "en" ? "en" : "zh-TW");
export const isEnglishJob = (language: string | undefined) => !!language && language.startsWith("en");

export const fmtTimeL = (d: Date | string, lang: Lang) =>
  new Date(d).toLocaleString(lang === "en" ? "en-US" : "zh-TW", { hour12: false, timeZone: "Asia/Taipei", ...(lang === "en" ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : {}) });

export const STAGE_LABEL_EN: Record<string, string> = { extract: "Read video", discover: "Find categories", segment: "Cut out products", dedup: "De-duplicate", transcribe: "Listen", identify: "Name products", shoot: "Product photos", render: "Catalog & videos" };
export const STYLE_LABEL_EN: Record<string, string> = { lifestyle: "Lifestyle", minimal: "Minimal", natural: "Natural", luxury: "Premium", cute: "Cute & friendly", promo: "Promo" };
export const SHOT_LABEL_EN: Record<string, string> = { front: "Front", threeQuarter: "45°", side: "Side", lifestyle: "Lifestyle" };
export const JOB_STATUS: Record<string, [string, string]> = { uploaded: ["排隊中", "Queued"], processing: ["分析中", "Analyzing"], review: ["待確認", "Needs review"], producing: ["產出中", "Producing"], done: ["完成", "Done"], failed: ["失敗", "Failed"] };

/** 可選幣別：台幣與美元 */
export const CURRENCIES = ["TWD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const defaultCurrency = (lang: Lang): Currency => (lang === "en" ? "USD" : "TWD");
export const CURRENCY_LABEL: Record<string, [string, string]> = { TWD: ["新台幣 NT$", "Taiwan dollar (NT$)"], USD: ["美元 US$", "US dollar ($)"] };

/** 全站唯一的價格寫法：介面、可購買頁、短片、文案都用這個，台幣 NT$1,980、美元 $19.80 */
export function fmtPrice(price: number, currency: string): string {
  const whole = Number.isInteger(price);
  if (currency === "USD") return `$${price.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
  if (currency === "TWD") return `NT$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${currency} ${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
