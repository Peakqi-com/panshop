import { describe, expect, it } from "vitest";
import { Storyboard, MOTIONS } from "@/lib/video/storyboard";

const scene = (n: number, overlay: "none" | "headline" | "price") => ({ sceneNo: n, durationSec: 4, purpose: "hero", shot: "front", imagePrompt: "", motion: MOTIONS[n % MOTIONS.length], narration: "[自然] 測試", subtitle: "測試", overlay });

describe("Storyboard schema", () => {
  it("accepts a 4-scene storyboard", () => {
    const r = Storyboard.safeParse({ hook: "跑步也要輕", cta: "留言 C1 取得連結", scenes: [scene(1, "headline"), scene(2, "none"), scene(3, "none"), scene(4, "price")] });
    expect(r.success).toBe(true);
  });
  it("rejects too few scenes and unknown camera motions", () => {
    expect(Storyboard.safeParse({ hook: "x", cta: "y", scenes: [scene(1, "headline")] }).success).toBe(false);
    expect(Storyboard.safeParse({ hook: "x", cta: "y", scenes: [1, 2, 3, 4].map((n) => ({ ...scene(n, "none"), motion: "zoom_blur" })) }).success).toBe(false);
  });
});
