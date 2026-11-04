import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { knockOutBackground } from "@/lib/video/knockout";

/** 400×400 白底：中間一個紅色方框（像杯子把手），框內是和底色一樣的白洞，下方有灰色影子 */
async function fixture(dir: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="#ffffff"/>
    <ellipse cx="200" cy="330" rx="120" ry="18" fill="#d6d6d6"/>
    <rect x="100" y="100" width="200" height="200" fill="#c81e1e"/>
    <rect x="160" y="160" width="80" height="80" fill="#ffffff"/>
    <rect x="120" y="120" width="20" height="20" fill="#fdfdfd"/>
  </svg>`;
  const src = path.join(dir, "studio.png");
  await sharp(Buffer.from(svg)).png().toFile(src);
  return src;
}

describe("knockOutBackground", () => {
  it("clears the background and enclosed holes, keeps the product and a soft shadow", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ko-"));
    const out = path.join(dir, "out.png");
    expect(await knockOutBackground(await fixture(dir), out)).toBe(true);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alpha(5, 5)).toBe(0);            // 背景
    expect(alpha(200, 200)).toBe(0);        // 被商品圍住的白洞
    expect(alpha(110, 110)).toBe(255);      // 商品
    const shadow = alpha(200, 330);
    expect(shadow).toBeGreaterThan(0);      // 影子保留成半透明
    expect(shadow).toBeLessThan(255);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses photos whose background is not a clean light colour", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ko-"));
    const src = path.join(dir, "dark.png");
    await sharp({ create: { width: 200, height: 200, channels: 3, background: "#3a2a1a" } }).png().toFile(src);
    expect(await knockOutBackground(src, path.join(dir, "o.png"))).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
