/**
 * 棚拍白底圖去背：從圖邊往內泛洪，只吃掉接近底色、低彩度的像素，商品內部的白不會被動到。
 * 影子保留成半透明，放到任何背景都自然。底色不乾淨或幾乎全被吃掉時回 false，由呼叫端改用白卡。
 */
import sharp from "sharp";

const SOFT = 8, HARD = 70, MAX_CHROMA = 28, HOLE = 4, EDGE_FADE = 0.07;

export async function knockOutBackground(src: string, out: string): Promise<boolean> {
  const { data, info } = await sharp(src).resize(1200, 1200, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const at = (x: number, y: number) => (y * w + x) * 3;
  const border: [number, number, number][] = [];
  for (let x = 0; x < w; x += 4) for (const y of [0, h - 1]) { const i = at(x, y); border.push([data[i], data[i + 1], data[i + 2]]); }
  for (let y = 0; y < h; y += 4) for (const x of [0, w - 1]) { const i = at(x, y); border.push([data[i], data[i + 1], data[i + 2]]); }
  const median = (c: 0 | 1 | 2) => border.map((b) => b[c]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [median(0), median(1), median(2)] as const;
  if (Math.min(...bg) < 185) return false;

  const distOf = (p: number) => { const i = p * 3; return Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2])); };
  const passable = (p: number) => { const i = p * 3; const hi = Math.max(data[i], data[i + 1], data[i + 2]), lo = Math.min(data[i], data[i + 1], data[i + 2]); return distOf(p) < HARD && hi - lo < MAX_CHROMA; };
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (p: number) => { if (!seen[p] && passable(p)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!; const x = p % w, y = (p - x) / w;
    if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (y > 0) seed(p - w); if (y < h - 1) seed(p + w);
  }

  // 被商品圍住的底色區（例如杯子把手的洞）：幾乎等於底色才挖掉，商品本身的白色不動
  const minHole = n * 0.0008;
  const checked = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (seen[start] || checked[start] || distOf(start) > HOLE) continue;
    const region: number[] = [start]; checked[start] = 1;
    for (let k = 0; k < region.length; k++) {
      const p = region[k]; const x = p % w, y = (p - x) / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !checked[q] && !seen[q] && distOf(q) <= HOLE) { checked[q] = 1; region.push(q); }
      }
    }
    if (region.length >= minHole && region.length < n * 0.15) for (const p of region) seen[p] = 1;
  }

  const rgba = Buffer.alloc(n * 4);
  let clear = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 3, o = p * 4;
    let a = 255;
    if (seen[p]) {
      const d = distOf(p);
      a = d <= SOFT ? 0 : Math.round(((d - SOFT) / (HARD - SOFT)) * 255);
      if (a < 128) clear++;
    } else {
      // 緊鄰背景的邊緣像素依接近底色的程度放淡，避免白邊
      const x = p % w, y = (p - x) / w;
      const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
      if (edge) a = Math.min(255, Math.round((distOf(p) / 110) * 255));
    }
    // 影子碰到圖邊時淡出，不留直線切口
    if (a > 0) {
      const x = p % w, y = (p - x) / w;
      const edgeDist = Math.min(x / w, (w - 1 - x) / w, y / h, (h - 1 - y) / h);
      if (edgeDist < EDGE_FADE && seen[p]) a = Math.round(a * (edgeDist / EDGE_FADE));
    }
    const k = a / 255;
    for (let c = 0; c < 3; c++) {
      // 反推前景色，讓半透明像素疊回原底色時和原圖一樣
      rgba[o + c] = a === 0 ? 0 : Math.max(0, Math.min(255, Math.round((data[i + c] - (1 - k) * bg[c]) / k)));
    }
    rgba[o + 3] = a;
  }
  const ratio = clear / n;
  if (ratio < 0.2 || ratio > 0.92) return false;
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 3 }).toFile(out);
  return true;
}
