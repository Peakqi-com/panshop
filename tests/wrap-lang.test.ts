import { describe, it, expect } from "vitest";
import { wrapText } from "@/lib/video/wrap";
import { priceLabel, ctaText, noPriceText, withLang, EN_RULE } from "@/lib/video/lang";

const m = (s: string) => s.length * 10; // 每個字 10px

describe("wrapText", () => {
  it("英文不切斷單字", () => {
    const lines = wrapText(m, "Matte white ceramic mug with handle", 120);
    expect(lines.every((l) => l.length * 10 <= 120)).toBe(true);
    expect(lines.join(" ")).toBe("Matte white ceramic mug with handle");
  });
  it("中文照舊逐字斷", () => {
    expect(wrapText(m, "霧面白色陶瓷馬克杯", 40)).toEqual(["霧面白色", "陶瓷馬克", "杯"]);
  });
  it("超長單字硬切", () => {
    expect(wrapText(m, "Supercalifragilistic", 50, 5)[0]).toBe("Super");
  });
  it("限制行數", () => {
    expect(wrapText(m, "one two three four five six", 40, 2)).toHaveLength(2);
  });
});

describe("lang helpers", () => {
  it("價格寫法", () => {
    expect(priceLabel(1980, "TWD", true)).toBe("NT$1,980");
    expect(priceLabel(1980, "TWD", false)).toBe("NT$1,980");
    expect(priceLabel(19.8, "USD", true)).toBe("$19.80");
    expect(priceLabel(20, "USD", true)).toBe("$20");
  });
  it("CTA 與無價格", () => {
    expect(ctaText("A3", true)).toBe("Comment A3 for the link");
    expect(ctaText("A3", false)).toBe("留言 A3 取得連結");
    expect(noPriceText(false)).toBe("價格請私訊");
  });
  it("中文掃描的 prompt 不變", () => {
    expect(withLang("x", false)).toBe("x");
    expect(withLang("x", true)).toContain(EN_RULE);
  });
});
