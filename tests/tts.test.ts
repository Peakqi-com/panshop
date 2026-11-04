import { describe, expect, it } from "vitest";
import { stripDirection, directionsOf } from "@/lib/video/tts";

describe("tone directions", () => {
  it("removes bracketed directions from spoken and caption text", () => {
    expect(stripDirection("[輕快、自然] 這雙紅色慢跑鞋，透氣又輕盈")).toBe("這雙紅色慢跑鞋，透氣又輕盈");
    expect(stripDirection("［溫暖］ 霧面陶瓷")).toBe("霧面陶瓷");
  });
  it("extracts directions for providers that take them separately", () => {
    expect(directionsOf("[溫柔、靠近] 鮮紅鞋面 [放慢]")).toBe("溫柔、靠近、放慢");
  });
});
