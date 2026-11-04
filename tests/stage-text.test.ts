import { describe, it, expect } from "vitest";
import { makeT, fmtPrice } from "@/lib/i18n";
import { stageNote, stageError } from "@/lib/stage-text";

const en = makeT("en"), zh = makeT("zh");
describe("stage text", () => {
  it("translates known notes", () => {
    expect(stageNote("3 件，2 件用到口述，合併 1 件重複", en)).toBe("3 items, 2 used speech, 1 duplicates merged");
    expect(stageNote("3 支短影片", zh)).toBe("3 支短影片");
  });
  it("maps user errors and hides internal ones", () => {
    expect(stageError("影片 300 秒，上限 240 秒", en, false)).toMatch(/over the 240s limit/);
    expect(stageError("ffmpeg 失敗：boom", en, false)).toMatch(/Something went wrong/);
    expect(stageError("ffmpeg 失敗：boom", en, true)).toBe("ffmpeg 失敗：boom");
  });
});
describe("fmtPrice", () => {
  it("formats TWD and USD", () => {
    expect(fmtPrice(1980, "TWD")).toBe("NT$1,980");
    expect(fmtPrice(19.8, "USD")).toBe("$19.80");
    expect(fmtPrice(25, "USD")).toBe("$25");
  });
});
