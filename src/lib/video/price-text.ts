/** 口述與旁白裡的價格處理：挑出講某件商品的句子、辨認中文數字價格 */
import type { Item } from "@/models/item";

/** 從一段口述裡挑出講這件商品的句子，回傳句子文字與它在整段中的字元比例區間 */
export function pickSentence(text: string, it: Pick<Item, "title" | "color" | "material" | "category" | "price">): { text: string; from: number; to: number } {
  const parts: { text: string; from: number; to: number }[] = [];
  let pos = 0;
  for (const m of text.split(/(?<=[。！？!?；;])/)) { if (m.trim()) parts.push({ text: m.trim(), from: pos / text.length, to: (pos + m.length) / text.length }); pos += m.length; }
  if (parts.length <= 1) return { text, from: 0, to: 1 };
  const keys = [it.title, it.color, it.material, it.category].filter(Boolean).flatMap((k) => k.split(/[\s，、]/)).filter((k) => k.length >= 2);
  const price = it.price != null ? String(it.price) : null;
  const score = (p: string) => keys.reduce((n, k) => n + (p.includes(k) ? 2 : 0), 0) + (price && p.includes(price) ? 3 : 0) + (price && hasChinesePrice(p, it.price!) ? 3 : 0);
  const best = [...parts].sort((a, b) => score(b.text) - score(a.text))[0];
  return score(best.text) > 0 ? best : { text, from: 0, to: 1 };
}

/** 口述裡的中文數字價格（例如 兩百九十、一千九百八十）是否等於這個價格 */
export function hasChinesePrice(text: string, price: number): boolean {
  const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const unit: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
  const m = text.match(/[零一二兩三四五六七八九十百千萬]+(?=元|塊)/g);
  if (!m) return false;
  for (const s of m) {
    let total = 0, cur = 0;
    for (const ch of s) { if (map[ch] != null) cur = map[ch]; else if (unit[ch]) { total += (cur || 1) * unit[ch]; cur = 0; } }
    if (total + cur === price) return true;
  }
  return false;
}


/** 逐字念的中文數字（一九八零）轉成阿拉伯數字，方便比對舊價格 */
export function chineseDigitsToArabic(text: string): string {
  const d = "零一二三四五六七八九";
  return text.replace(/[零〇一二三四五六七八九]/g, (c) => String(c === "〇" ? 0 : d.indexOf(c)));
}
