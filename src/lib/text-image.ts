import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

/** 用 canvas 畫中文字卡，輸出 PNG 給 ffmpeg overlay；避免依賴雲端函式的 drawtext 與系統字型 */
const FONT = "PanShopTC";
let registered = false;
function ensureFont() {
  if (registered) return;
  GlobalFonts.registerFromPath(path.join(process.cwd(), "src", "assets", "fonts", "NotoSansTC.ttf"), FONT);
  registered = true;
}

function wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    const next = cur + ch;
    if (ctx.measureText(next).width > maxWidth && cur) { lines.push(cur); cur = ch; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export type CoverSpec = { width: number; height: number; heroPng: Buffer; hook: string; price: string; bg?: string; fg?: string; accent?: string };

/** 封面：上方標題、中間商品圖、下方價格 */
export async function coverImage(s: CoverSpec): Promise<Buffer> {
  ensureFont();
  const c = createCanvas(s.width, s.height);
  const x = c.getContext("2d");
  x.fillStyle = s.bg ?? "#f5f2ec";
  x.fillRect(0, 0, s.width, s.height);
  const hero = await loadImage(s.heroPng);
  const side = s.width - 160;
  const scale = Math.min(side / hero.width, side / hero.height);
  const hw = hero.width * scale, hh = hero.height * scale;
  x.drawImage(hero, (s.width - hw) / 2, 420 + (side - hh) / 2, hw, hh);
  x.fillStyle = s.fg ?? "#1c1917";
  x.textAlign = "center";
  x.font = `700 72px ${FONT}`;
  wrap(x, s.hook, s.width - 160).forEach((l, i) => x.fillText(l, s.width / 2, 220 + i * 90));
  x.fillStyle = s.accent ?? "#ea580c";
  x.font = `700 68px ${FONT}`;
  x.fillText(s.price, s.width / 2, s.height - 360);
  return c.toBuffer("image/png");
}

/** 結尾字卡 */
export function endCard(width: number, height: number, text: string): Buffer {
  ensureFont();
  const c = createCanvas(width, height);
  const x = c.getContext("2d");
  x.fillStyle = "#1c1917";
  x.fillRect(0, 0, width, height);
  x.fillStyle = "#ffffff";
  x.textAlign = "center";
  x.font = `700 66px ${FONT}`;
  wrap(x, text, width - 160).forEach((l, i) => x.fillText(l, width / 2, height / 2 + i * 84));
  x.fillStyle = "#a8a29e";
  x.font = `400 36px ${FONT}`;
  x.fillText("PanShop", width / 2, height - 160);
  return c.toBuffer("image/png");
}

/** 商品代碼小標籤（透明背景） */
export function badge(text: string): Buffer {
  ensureFont();
  const c = createCanvas(420, 110);
  const x = c.getContext("2d");
  x.font = `700 56px ${FONT}`;
  const w = Math.ceil(x.measureText(text).width) + 48;
  x.fillStyle = "#ea580c";
  x.beginPath(); x.roundRect(0, 0, w, 96, 16); x.fill();
  x.fillStyle = "#ffffff";
  x.textBaseline = "middle";
  x.fillText(text, 24, 50);
  return c.toBuffer("image/png");
}
