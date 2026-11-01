/**
 * 商品形象廣告短片：用去背商品圖與生成的商品圖，全部程式合成，不依賴原始影片畫面。
 * 15 秒、1080×1920、30 fps。四幕：鉤子 → 主角推近 → 三個賣點卡 → 價格與行動呼籲。
 * 畫面用 canvas 逐格畫好餵給 ffmpeg；聲音是賣家原聲口白（有的話）加程序化音樂。
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import { ffmpegPath, run } from "@/lib/ffmpeg";
import { generateMusic } from "./music";

export const W = 1080, H = 1920, FPS = 30, DUR = 15;
const FONT = "PanShopTC";
let fontReady = false;
function ensureFont() {
  if (fontReady) return;
  GlobalFonts.registerFromPath(path.join(process.cwd(), "src", "assets", "fonts", "NotoSansTC.ttf"), FONT);
  fontReady = true;
}

export type AdPalette = { bg1: string; bg2: string; fg: string; accent: string; card: string; muted: string };
export const PALETTES: Record<string, AdPalette> = {
  lifestyle: { bg1: "#f6efe4", bg2: "#e9dcc8", fg: "#1f1a17", accent: "#d9560b", card: "#ffffff", muted: "#7a6f66" },
  minimal: { bg1: "#fafafa", bg2: "#ececec", fg: "#111111", accent: "#111111", card: "#ffffff", muted: "#777777" },
  natural: { bg1: "#eef1e6", bg2: "#d9e0c8", fg: "#1f2a1a", accent: "#4f7a3a", card: "#ffffff", muted: "#6b7a60" },
  luxury: { bg1: "#15121a", bg2: "#2a2233", fg: "#f5efe6", accent: "#c9a24b", card: "#241d2c", muted: "#a79c8e" },
  cute: { bg1: "#fff1f4", bg2: "#ffd9e2", fg: "#3b2a33", accent: "#ff5c8a", card: "#ffffff", muted: "#9c7f8a" },
  promo: { bg1: "#fff7e6", bg2: "#ffe4b3", fg: "#1a1a1a", accent: "#e11d48", card: "#ffffff", muted: "#6b6b6b" },
};

export type AdInput = {
  code: string; title: string; price: number | null; currency: string; storeName: string; style: string;
  hook: string; sellingPoints: string[]; subtitle?: string;
  cutoutPath?: string; heroPath?: string; lifestylePath?: string; shotPaths: string[];
  voicePath?: string; voiceStartSec?: number; voiceDurSec?: number;
  workDir: string;
};

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const lines: string[] = []; let cur = "";
  for (const ch of text) { const next = cur + ch; if (ctx.measureText(next).width > maxWidth && cur) { lines.push(cur); cur = ch; } else cur = next; }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}
function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.closePath();
}
function drawCover(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number, zoom = 1) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function drawContain(ctx: SKRSContext2D, img: Image, cx: number, cy: number, box: number, scale = 1, rot = 0) {
  const s = Math.min(box / img.width, box / img.height) * scale;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

export async function renderAd(input: AdInput): Promise<{ mp4: string; cover: string; durationSec: number }> {
  ensureFont();
  const p = PALETTES[input.style] ?? PALETTES.lifestyle;
  const dir = input.workDir;
  // 素材：去背主角（含陰影預先畫好）、模糊的情境底圖、結尾用的棚拍圖
  const heroSrc = input.cutoutPath ?? input.heroPath ?? input.shotPaths[0];
  const heroImg = heroSrc ? await loadImage(heroSrc) : null;
  const heroWithShadow = heroImg ? (() => {
    const pad = 80, c = createCanvas(heroImg.width + pad * 2, heroImg.height + pad * 2), x = c.getContext("2d");
    x.shadowColor = "rgba(0,0,0,0.28)"; x.shadowBlur = 48; x.shadowOffsetY = 26;
    x.drawImage(heroImg, pad, pad); return c;
  })() : null;
  let bgImg: Image | null = null;
  if (input.lifestylePath) {
    const blurred = path.join(dir, "bg_blur.jpg");
    await sharp(input.lifestylePath).resize(540, 960, { fit: "cover" }).blur(18).modulate({ brightness: 0.92, saturation: 0.9 }).jpeg({ quality: 80 }).toFile(blurred);
    bgImg = await loadImage(blurred);
  }
  const endImg = input.heroPath ? await loadImage(input.heroPath) : heroImg;
  const shots: Image[] = [];
  for (const sp of input.shotPaths.slice(0, 3)) { try { shots.push(await loadImage(sp)); } catch { /* 略過 */ } }

  const canvas = createCanvas(W, H);
  let ctx = canvas.getContext("2d");  // 交叉淡化時暫時指到離屏畫布，所有繪圖函式都透過這個變數取用
  const priceText = input.price != null ? `${input.currency} ${input.price.toLocaleString()}` : "價格請私訊";
  const hookLines = (() => { ctx.font = `700 92px ${FONT}`; return wrap(ctx, input.hook || input.title, W - 200, 3); })();
  const titleLines = (() => { ctx.font = `500 54px ${FONT}`; return wrap(ctx, input.title, W - 200, 2); })();
  const subLines = input.subtitle ? (() => { ctx.font = `500 44px ${FONT}`; return wrap(ctx, input.subtitle, W - 160, 2); })() : [];
  const points = input.sellingPoints.filter(Boolean).slice(0, 3);
  while (points.length < 3 && points.length) points.push(points[points.length - 1]);

  function bgGradient(t: number) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 柔光圓
    const gx = W * (0.3 + 0.1 * Math.sin(t * 0.5)), gy = H * (0.35 + 0.05 * Math.cos(t * 0.4));
    const rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, 900);
    rg.addColorStop(0, "rgba(255,255,255,0.35)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  function header() {
    ctx.fillStyle = p.muted; ctx.font = `500 34px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(input.storeName, 72, 120);
    ctx.textAlign = "right"; ctx.fillText(input.code, W - 72, 120);
  }
  function sceneA(t: number) { // 0–1.2s 鉤子
    bgGradient(t); header();
    const k = ease(t / 0.8);
    ctx.save(); ctx.globalAlpha = k; ctx.translate(W / 2, H / 2); ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k);
    ctx.fillStyle = p.fg; ctx.font = `700 92px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    hookLines.forEach((l, i) => ctx.fillText(l, 0, (i - (hookLines.length - 1) / 2) * 118));
    ctx.restore();
    ctx.fillStyle = p.accent; ctx.fillRect(W / 2 - 60 * k, H / 2 + hookLines.length * 60 + 40, 120 * k, 8);
  }
  function sceneB(t: number) { // 1.2–5.6s 主角推近
    const local = t - 1.2;
    if (bgImg) { drawCover(ctx, bgImg, 0, 0, W, H, 1 + local * 0.01); ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(0, 0, W, H); } else bgGradient(t);
    header();
    if (heroWithShadow) {
      const k = ease(local / 0.9);
      const scale = 1 + local * 0.03, float = Math.sin(local * 1.6) * 10;
      ctx.save(); ctx.globalAlpha = k;
      drawContain(ctx, heroWithShadow as unknown as Image, W / 2, H * 0.45 + (1 - k) * 60 + float, W * 0.88, scale, Math.sin(local * 0.8) * 0.015);
      ctx.restore();
    }
    // 標題與價格
    const k2 = ease((local - 0.5) / 0.6);
    ctx.save(); ctx.globalAlpha = k2;
    ctx.fillStyle = p.fg; ctx.font = `500 54px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    titleLines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.80 + i * 68));
    const pw = ctx.measureText(priceText).width + 60;
    ctx.font = `700 50px ${FONT}`;
    roundRect(ctx, W / 2 - pw / 2, H * 0.80 + titleLines.length * 68 + 10, pw, 78, 39); ctx.fillStyle = p.accent; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(priceText, W / 2, H * 0.80 + titleLines.length * 68 + 66);
    ctx.restore();
    subtitle(t);
  }
  function sceneC(t: number) { // 5.6–11.6s 賣點卡
    const local = t - 5.6;
    bgGradient(t); header();
    if (heroWithShadow) drawContain(ctx, heroWithShadow as unknown as Image, W * 0.30, H * 0.50 + Math.sin(local * 1.4) * 8, W * 0.50, 1, -0.03);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    points.forEach((pt, i) => {
      const k = ease((local - i * 2) / 0.55);
      if (k <= 0) return;
      const x = W * 0.52 + (1 - k) * 260, y = H * 0.30 + i * 230, w = W * 0.42, h = 190;
      ctx.save(); ctx.globalAlpha = k;
      ctx.shadowColor = "rgba(0,0,0,0.12)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
      roundRect(ctx, x, y, w, h, 28); ctx.fillStyle = p.card; ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(x + 48, y + 56, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `700 28px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), x + 48, y + 57);
      ctx.fillStyle = p.fg; ctx.font = `700 40px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      wrap(ctx, pt, w - 120, 2).forEach((l, j) => ctx.fillText(l, x + 92, y + 72 + j * 50));
      ctx.restore();
    });
    subtitle(t);
  }
  function sceneD(t: number) { // 11.6–15s 價格與行動呼籲
    const local = t - 11.6;
    bgGradient(t); header();
    if (endImg) {
      const k = ease(local / 0.6);
      ctx.save(); ctx.globalAlpha = k;
      const box = W * 0.66, x = (W - box) / 2, y = H * 0.14;
      ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
      roundRect(ctx, x, y, box, box, 40); ctx.fillStyle = "#fff"; ctx.fill(); ctx.shadowColor = "transparent";
      ctx.save(); roundRect(ctx, x, y, box, box, 40); ctx.clip(); drawCover(ctx, endImg, x, y, box, box, 1); ctx.restore();
      ctx.restore();
    }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = p.fg; ctx.font = `500 50px ${FONT}`; titleLines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.57 + i * 62));
    const shown = input.price != null ? Math.round(input.price * ease(local / 0.9)) : null;
    ctx.fillStyle = p.accent; ctx.font = `700 132px ${FONT}`;
    ctx.fillText(shown != null ? `${input.currency} ${shown.toLocaleString()}` : "價格請私訊", W / 2, H * 0.70);
    const k3 = ease((local - 0.8) / 0.5);
    ctx.save(); ctx.globalAlpha = k3;
    const cta = `留言 ${input.code} 取得連結`; ctx.font = `700 54px ${FONT}`;
    const cw = ctx.measureText(cta).width + 90;
    roundRect(ctx, W / 2 - cw / 2, H * 0.745, cw, 100, 50); ctx.fillStyle = p.fg; ctx.fill();
    ctx.fillStyle = p.bg1; ctx.fillText(cta, W / 2, H * 0.745 + 68);
    ctx.fillStyle = p.muted; ctx.font = `500 36px ${FONT}`; ctx.fillText(input.storeName, W / 2, H * 0.86);
    ctx.restore();
  }
  function subtitle(t: number) {
    if (!subLines.length || input.voiceStartSec == null || input.voiceDurSec == null) return;
    const a = clamp01((t - input.voiceStartSec) / 0.3) * clamp01((input.voiceStartSec + input.voiceDurSec + 0.6 - t) / 0.3);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = `500 44px ${FONT}`;
    const widest = Math.max(...subLines.map((l) => ctx.measureText(l).width));
    roundRect(ctx, W / 2 - widest / 2 - 36, H * 0.90 - 52, widest + 72, subLines.length * 56 + 30, 18); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fill();
    ctx.fillStyle = "#fff"; subLines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.90 + i * 56));
    ctx.restore();
  }
  const scenes: { from: number; to: number; draw: (t: number) => void }[] = [
    { from: 0, to: 1.2, draw: sceneA }, { from: 1.2, to: 5.6, draw: sceneB }, { from: 5.6, to: 11.6, draw: sceneC }, { from: 11.6, to: DUR, draw: sceneD },
  ];
  const XF = 0.35;
  const off = createCanvas(W, H);
  function frame(t: number) {
    const idx = Math.max(0, scenes.findIndex((s) => t >= s.from && t < s.to));
    const s = scenes[idx];
    s.draw(t);
    const next = scenes[idx + 1];
    if (next && t > s.to - XF) {
      const a = (t - (s.to - XF)) / XF;
      const main = ctx;
      ctx = off.getContext("2d");
      ctx.save(); next.draw(next.from + 0.001); ctx.restore();
      ctx = main;
      ctx.save(); ctx.globalAlpha = ease(a); ctx.drawImage(off, 0, 0); ctx.restore();
    }
  }

  // 影像：逐格餵 ffmpeg
  const videoOnly = path.join(dir, "video.mp4");
  const total = DUR * FPS;
  await new Promise<void>((resolve, reject) => {
    const ff = spawn(ffmpegPath(), ["-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoOnly], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (d) => { err += d.toString(); if (err.length > 8000) err = err.slice(-8000); });
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 影像合成失敗 ${code}: ${err.slice(-600)}`))));
    let i = 0;
    const write = () => {
      while (i < total) {
        const t = i / FPS;
        ctx.save(); frame(t); ctx.restore();
        const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
        i++;
        if (!ff.stdin.write(buf)) { ff.stdin.once("drain", write); return; }
      }
      ff.stdin.end();
    };
    write();
  });
  // 封面：第 2.6 秒
  ctx.save(); frame(2.6); ctx.restore();
  const cover = path.join(dir, "cover.png");
  await fs.writeFile(cover, canvas.toBuffer("image/png"));

  // 聲音：音樂 + 口白（有的話），口白期間音樂壓低
  const music = path.join(dir, "music.wav");
  await fs.writeFile(music, generateMusic(DUR, input.style, input.code.charCodeAt(0) + (input.code.charCodeAt(1) || 0)));
  const mp4 = path.join(dir, "ad.mp4");
  if (input.voicePath && input.voiceDurSec && input.voiceStartSec != null) {
    const vs = input.voiceStartSec, ve = vs + input.voiceDurSec;
    await run([
      "-y", "-i", videoOnly, "-i", music, "-i", input.voicePath,
      "-filter_complex",
      `[1:a]volume='if(between(t,${vs.toFixed(2)},${ve.toFixed(2)}),0.3,1)':eval=frame,aformat=sample_rates=48000:channel_layouts=stereo[m];` +
      `[2:a]loudnorm=I=-16:TP=-1.5:LRA=11,adelay=${Math.round(vs * 1000)}|${Math.round(vs * 1000)},aformat=sample_rates=48000:channel_layouts=stereo[v];` +
      `[m][v]amix=inputs=2:normalize=0:duration=first[a]`,
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", mp4,
    ], { timeoutMs: 120_000 });
  } else {
    await run(["-y", "-i", videoOnly, "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", mp4], { timeoutMs: 120_000 });
  }
  return { mp4, cover, durationSec: DUR };
}
