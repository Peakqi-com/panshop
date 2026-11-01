/**
 * 形象短片 v2：依分鏡逐場合成。每一場用一張商品圖或場景圖加鏡頭運動（推近、拉遠、橫移、上飄、微轉），
 * 棚拍白底圖改用透明去背主角放在風格化背景上；字幕、鉤子、價格、CTA 全部後製疊字；
 * 配音與音樂另外混音。畫面用 canvas 逐格餵 ffmpeg。
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import { ffmpegPath, run } from "@/lib/ffmpeg";
import { generateMusic } from "./music";
import { PALETTES } from "./ad";

export const W = 1080, H = 1920, FPS = 30;
const FONT = "PanShopTC";
let fontReady = false;
function ensureFont() { if (!fontReady) { GlobalFonts.registerFromPath(path.join(process.cwd(), "src", "assets", "fonts", "NotoSansTC.ttf"), FONT); fontReady = true; } }

export type SceneSpec = {
  durationSec: number; imagePath?: string; kind: "studio" | "photo"; motion: string;
  subtitle: string; overlay: "none" | "headline" | "price" | "cta"; narrationPath?: string; narrationStart?: number; narrationDur?: number;
};
export type AdV2Input = {
  code: string; title: string; price: number | null; currency: string; storeName: string; style: string;
  hook: string; cta: string; cutoutPath?: string; scenes: SceneSpec[]; musicPath?: string; workDir: string;
};

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const easeInOut = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const lines: string[] = []; let cur = "";
  for (const ch of text) { const next = cur + ch; if (ctx.measureText(next).width > maxWidth && cur) { lines.push(cur); cur = ch; } else cur = next; }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}
function rr(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.closePath(); }

/** 鏡頭運動：回傳這一刻的縮放、位移、旋轉 */
function motionAt(motion: string, p: number) {
  const k = easeInOut(p);
  switch (motion) {
    case "pull_out": return { scale: 1.14 - 0.12 * k, dx: 0, dy: 0, rot: 0 };
    case "pan_left": return { scale: 1.12, dx: 70 - 140 * k, dy: 0, rot: 0 };
    case "pan_right": return { scale: 1.12, dx: -70 + 140 * k, dy: 0, rot: 0 };
    case "drift_up": return { scale: 1.1, dx: 0, dy: 50 - 100 * k, rot: 0 };
    case "orbit": return { scale: 1.1 + 0.03 * Math.sin(k * Math.PI), dx: 30 * Math.sin(k * Math.PI * 2), dy: 0, rot: (-2.5 + 5 * k) * (Math.PI / 180) };
    default: return { scale: 1 + 0.13 * k, dx: 0, dy: 0, rot: 0 };  // push_in
  }
}

export async function renderAdV2(input: AdV2Input): Promise<{ mp4: string; cover: string; durationSec: number }> {
  ensureFont();
  const p = PALETTES[input.style] ?? PALETTES.lifestyle;
  const dir = input.workDir;
  const dark = input.style === "luxury";

  // 素材
  const heroImg = input.cutoutPath ? await loadImage(input.cutoutPath) : null;
  const heroShadow = heroImg ? (() => {
    const pad = 90, c = createCanvas(heroImg.width + pad * 2, heroImg.height + pad * 2), x = c.getContext("2d");
    x.shadowColor = dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)"; x.shadowBlur = 56; x.shadowOffsetY = 30; x.drawImage(heroImg, pad, pad); return c;
  })() : null;
  const sceneImgs: (Image | null)[] = [];
  for (const [i, sc] of input.scenes.entries()) {
    if (!sc.imagePath) { sceneImgs.push(null); continue; }
    // 直式畫布：照片類場景先做成 cover 尺寸，白底棚拍類另外處理
    const out = path.join(dir, `scene_${i}.jpg`);
    await sharp(sc.imagePath).resize(sc.kind === "photo" ? 1296 : 1200, sc.kind === "photo" ? 2304 : 1200, { fit: sc.kind === "photo" ? "cover" : "inside", position: "attention", background: "#ffffff" }).jpeg({ quality: 88 }).toFile(out);
    sceneImgs.push(await loadImage(out));
  }
  // 棚拍場的背景材質：預先畫一張柔光漸層加細微顆粒
  const bgTex = (() => {
    const c = createCanvas(W, H), x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const id = x.getImageData(0, 0, W, H); const d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(id, 0, 0);
    return c;
  })();

  const canvas = createCanvas(W, H);
  let ctx = canvas.getContext("2d");
  const priceText = input.price != null ? `${input.currency} ${input.price.toLocaleString()}` : "價格請私訊";
  const starts: number[] = []; let acc = 0;
  for (const sc of input.scenes) { starts.push(acc); acc += sc.durationSec; }
  const total = acc;

  function header() {
    ctx.fillStyle = p.muted; ctx.font = `500 34px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(input.storeName, 72, 118); ctx.textAlign = "right"; ctx.fillText(input.code, W - 72, 118);
  }
  function subtitleBar(text: string, a: number) {
    if (!text || a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.font = `500 46px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const lines = wrap(ctx, text, W - 180, 2);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const y0 = H * 0.80;
    rr(ctx, W / 2 - widest / 2 - 40, y0 - 56, widest + 80, lines.length * 60 + 34, 22); ctx.fillStyle = "rgba(0,0,0,0.58)"; ctx.fill();
    ctx.fillStyle = "#fff"; lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 60));
    ctx.restore();
  }
  function headline(text: string, a: number) {
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `700 96px ${FONT}`;
    const lines = wrap(ctx, text, W - 160, 2);
    const y0 = H * 0.62;
    // 底部漸層讓字清楚
    const g = ctx.createLinearGradient(0, y0 - 260, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)"); ctx.fillStyle = g; ctx.fillRect(0, y0 - 260, W, H - y0 + 260);
    ctx.fillStyle = "#fff"; lines.forEach((l, i) => ctx.fillText(l, 80, y0 + i * 116));
    ctx.fillStyle = p.accent; ctx.fillRect(80, y0 + lines.length * 116 - 70, 120, 10);
    ctx.restore();
  }
  function pricePanel(local: number) {
    const k = ease(local / 0.8);
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)"); ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);
    ctx.globalAlpha = k;
    ctx.fillStyle = "#fff"; ctx.font = `500 50px ${FONT}`; wrap(ctx, input.title, W - 200, 2).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.64 + i * 62));
    const shown = input.price != null ? Math.round(input.price * ease(local / 1.0)) : null;
    ctx.fillStyle = p.accent === "#111111" ? "#fff" : p.accent; ctx.font = `700 124px ${FONT}`;
    ctx.fillText(shown != null ? `${input.currency} ${shown.toLocaleString()}` : "價格請私訊", W / 2, H * 0.76);
    const k2 = ease((local - 0.6) / 0.5); ctx.globalAlpha = k2;
    ctx.font = `700 50px ${FONT}`; const cw = ctx.measureText(input.cta).width + 90;
    rr(ctx, W / 2 - cw / 2, H * 0.80, cw, 94, 47); ctx.fillStyle = "#fff"; ctx.fill(); ctx.fillStyle = "#1c1917"; ctx.fillText(input.cta, W / 2, H * 0.80 + 64);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = `500 34px ${FONT}`; ctx.fillText(input.storeName, W / 2, H * 0.90);
    ctx.restore();
  }
  function drawScene(i: number, t: number) {
    const sc = input.scenes[i]; const local = t - starts[i]; const prog = local / sc.durationSec;
    const m = motionAt(sc.motion, prog);
    const img = sceneImgs[i];
    if (sc.kind === "photo" && img) {
      ctx.save(); ctx.translate(W / 2 + m.dx, H / 2 + m.dy); ctx.rotate(m.rot); ctx.scale(m.scale, m.scale);
      const s = Math.max(W / img.width, H / img.height); ctx.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s); ctx.restore();
      // 輕微暗角
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.28)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.drawImage(bgTex, 0, 0);
      const gx = W * (0.3 + 0.4 * prog), gy = H * 0.35;
      const rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, 800); rg.addColorStop(0, dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.45)"); rg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      const subject = heroShadow ?? img;
      if (subject) {
        const box = W * (sc.overlay === "price" ? 0.62 : 0.86);
        const cy = sc.overlay === "price" ? H * 0.32 : H * 0.47;
        const sImg = subject as unknown as Image;
        const s = Math.min(box / sImg.width, box / sImg.height) * m.scale;
        ctx.save(); ctx.translate(W / 2 + m.dx, cy + m.dy + Math.sin(local * 1.4) * 6); ctx.rotate(m.rot);
        if (!heroShadow && img) { rr(ctx, (-img.width * s) / 2 - 24, (-img.height * s) / 2 - 24, img.width * s + 48, img.height * s + 48, 40); ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24; ctx.fill(); ctx.shadowColor = "transparent"; }
        ctx.drawImage(sImg, (-sImg.width * s) / 2, (-sImg.height * s) / 2, sImg.width * s, sImg.height * s); ctx.restore();
      }
    }
    header();
    if (sc.overlay === "headline") headline(input.hook, ease((local - 0.3) / 0.6));
    if (sc.overlay === "price" || sc.overlay === "cta") pricePanel(local);
    else {
      const a = Math.min(ease((local - 0.15) / 0.3), ease((sc.durationSec - local) / 0.3));
      subtitleBar(sc.subtitle, a);
    }
  }
  const XF = 0.4;
  const off = createCanvas(W, H);
  function frame(t: number) {
    let i = starts.findIndex((s, k) => t >= s && t < s + input.scenes[k].durationSec); if (i < 0) i = input.scenes.length - 1;
    drawScene(i, t);
    const end = starts[i] + input.scenes[i].durationSec;
    if (i + 1 < input.scenes.length && t > end - XF) {
      const a = (t - (end - XF)) / XF;
      const main = ctx; ctx = off.getContext("2d"); ctx.save(); drawScene(i + 1, end + 0.001); ctx.restore(); ctx = main;
      ctx.save(); ctx.globalAlpha = ease(a); ctx.drawImage(off, 0, 0); ctx.restore();
    }
  }

  const videoOnly = path.join(dir, "video.mp4");
  const nFrames = Math.round(total * FPS);
  await new Promise<void>((resolve, reject) => {
    const ff = spawn(ffmpegPath(), ["-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoOnly], { stdio: ["pipe", "ignore", "pipe"] });
    let err = ""; ff.stderr.on("data", (d) => { err += d.toString(); if (err.length > 8000) err = err.slice(-8000); });
    ff.on("error", reject); ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 影像合成失敗 ${code}: ${err.slice(-600)}`))));
    let i = 0;
    const write = () => {
      while (i < nFrames) {
        ctx.save(); frame(i / FPS); ctx.restore();
        const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer); i++;
        if (!ff.stdin.write(buf)) { ff.stdin.once("drain", write); return; }
      }
      ff.stdin.end();
    };
    write();
  });
  const coverT = input.scenes.length > 1 ? starts[1] + Math.min(1.2, input.scenes[1].durationSec / 2) : 1;
  ctx.save(); frame(coverT); ctx.restore();
  const cover = path.join(dir, "cover.png"); await fs.writeFile(cover, canvas.toBuffer("image/png"));

  // 聲音：旁白各場 adelay，音樂在旁白時壓低
  const music = input.musicPath ?? path.join(dir, "music.wav");
  if (!input.musicPath) await fs.writeFile(music, generateMusic(total + 0.5, input.style, input.code.charCodeAt(0) + (input.code.charCodeAt(1) || 0)));
  const voices = input.scenes.filter((s) => s.narrationPath && s.narrationStart != null);
  const mp4 = path.join(dir, "ad.mp4");
  if (voices.length) {
    const inputs = ["-y", "-i", videoOnly, "-i", music, ...voices.flatMap((v) => ["-i", v.narrationPath!])];
    const duck = voices.map((v) => `between(t,${v.narrationStart!.toFixed(2)},${(v.narrationStart! + (v.narrationDur ?? 3)).toFixed(2)})`).join("+");
    const chains = voices.map((v, k) => `[${k + 2}:a]loudnorm=I=-16:TP=-1.5:LRA=11,adelay=${Math.round(v.narrationStart! * 1000)}|${Math.round(v.narrationStart! * 1000)},aformat=sample_rates=48000:channel_layouts=stereo[v${k}]`).join(";");
    const filter = `[1:a]volume='if(gt(${duck},0),0.28,1)':eval=frame,aformat=sample_rates=48000:channel_layouts=stereo[m];${chains};[m]${voices.map((_, k) => `[v${k}]`).join("")}amix=inputs=${voices.length + 1}:normalize=0:duration=first[a]`;
    await run([...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", mp4], { timeoutMs: 180_000 });
  } else {
    await run(["-y", "-i", videoOnly, "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", mp4], { timeoutMs: 120_000 });
  }
  return { mp4, cover, durationSec: total };
}
