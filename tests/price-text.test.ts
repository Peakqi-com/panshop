import { describe, expect, it } from "vitest";
import { pickSentence, hasChinesePrice, chineseDigitsToArabic } from "@/lib/video/price-text";

const shoe = { title: "紅色透氣慢跑鞋", color: "紅色", material: "網布", category: "運動鞋", price: 1980 };

describe("hasChinesePrice", () => {
  it("reads spoken prices with units", () => {
    expect(hasChinesePrice("這雙一千九百八十元", 1980)).toBe(true);
    expect(hasChinesePrice("筆記本兩百九十塊", 290)).toBe(true);
    expect(hasChinesePrice("馬克杯三百八十元", 290)).toBe(false);
  });
});

describe("chineseDigitsToArabic", () => {
  it("turns digit-by-digit readings into numbers", () => {
    expect(chineseDigitsToArabic("防滑大底，一九八零")).toContain("1980");
    expect(chineseDigitsToArabic("〇九一二")).toBe("0912");
  });
});

describe("pickSentence", () => {
  it("picks the sentence about this item from a multi-item narration", () => {
    const text = "這個白色馬克杯三百八十元。這雙紅色慢跑鞋，一千九百八十元。最後是筆記本。";
    const r = pickSentence(text, shoe);
    expect(r.text).toContain("慢跑鞋");
    expect(r.from).toBeGreaterThan(0);
    expect(r.to).toBeLessThan(1);
  });
  it("falls back to the whole turn when nothing matches", () => {
    expect(pickSentence("今天天氣很好。", shoe)).toEqual({ text: "今天天氣很好。", from: 0, to: 1 });
  });
});
