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
import { knockOutBackground } from "./knockout";
import { wrapText } from "./wrap";
import { priceLabel, noPriceText } from "./lang";

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
  en?: boolean;   // 英文掃描：價格寫法與無價格字樣用英文
};

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const easeInOut = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  return wrapText((s) => ctx.measureText(s).width, text, maxWidth, maxLines);
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
  const sceneBlur: (Image | null)[] = [];
  const sceneKeyed: boolean[] = [];   // 棚拍圖是否已去背；否則放白卡
  for (const [i, sc] of input.scenes.entries()) {
    if (!sc.imagePath) { sceneImgs.push(null); continue; }
    const out = path.join(dir, `scene_${i}.jpg`);
    await sharp(sc.imagePath).resize(1200, 1200, { fit: "inside" }).jpeg({ quality: 90 }).toFile(out);
    if (sc.kind === "photo") {
      const img = await loadImage(out);
      sceneImgs.push(img);
      const bo = path.join(dir, `scene_${i}_blur.jpg`);
      // 底圖取原圖上下緣延伸，不拿中間，商品顏色才不會被抹成一條色帶
      const meta = await sharp(out).metadata();
      const strip = Math.max(8, Math.round((meta.height ?? 1200) * 0.1));
      const part = (top: number) => sharp(out).extract({ left: 0, top, width: meta.width ?? 1200, height: strip }).resize(540, 480, { fit: "fill" }).png().toBuffer();
      const [upper, lower] = await Promise.all([part(0), part((meta.height ?? 1200) - strip)]);
      await sharp({ create: { width: 540, height: 960, channels: 3, background: "#888" } }).composite([{ input: upper, top: 0, left: 0 }, { input: lower, top: 480, left: 0 }]).jpeg({ quality: 90 }).toBuffer()
        .then((b) => sharp(b).blur(30).modulate({ brightness: 0.92 }).jpeg({ quality: 80 }).toFile(bo));
      sceneBlur[i] = await loadImage(bo);
      continue;
    }
    sceneBlur[i] = null;
    const keyed = path.join(dir, `scene_${i}_key.png`);
    sceneKeyed[i] = await knockOutBackground(sc.imagePath, keyed).catch(() => false);
    sceneImgs.push(await loadImage(sceneKeyed[i] ? keyed : out));
  }
  // 不是直式的照片：上下邊淡出，融進模糊底，不留硬邊
  const FEATHER = 0.12;
  const isTall = (img: Image) => img.height / img.width >= 1.5;
  const feathered = sceneImgs.map((img) => {
    if (!img || isTall(img)) return img;
    const c = createCanvas(img.width, img.height), x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, img.height);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(FEATHER, "rgba(0,0,0,1)"); g.addColorStop(1 - FEATHER, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.globalCompositeOperation = "destination-in"; x.fillStyle = g; x.fillRect(0, 0, img.width, img.height);
    return c as unknown as Image;
  });
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
  const starts: number[] = []; let acc = 0;
  for (const sc of input.scenes) { starts.push(acc); acc += sc.durationSec; }
  const total = acc;

  function header(onPhoto: boolean) {
    ctx.fillStyle = onPhoto ? "rgba(255,255,255,0.9)" : p.muted; ctx.font = `500 34px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
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
  /** 鉤子放畫面上方，商品往下讓位，字不壓商品 */
  function headline(text: string, a: number, onPhoto: boolean) {
    ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `700 92px ${FONT}`;
    const lines = wrap(ctx, text, W - 160, 2);
    const y0 = 270, lh = 112;
    if (onPhoto) { const g = ctx.createLinearGradient(0, 0, 0, y0 + lines.length * lh + 90); g.addColorStop(0, "rgba(0,0,0,0.6)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, y0 + lines.length * lh + 90); }
    ctx.globalAlpha = a;
    ctx.fillStyle = onPhoto ? "#fff" : p.fg; lines.forEach((l, i) => ctx.fillText(l, 80, y0 + i * lh));
    ctx.fillStyle = p.accent; ctx.fillRect(80, y0 + (lines.length - 1) * lh + 36, 120, 10);
    ctx.restore();
  }
  function pricePanel(local: number, onPhoto: boolean) {
    const k = ease(local / 0.8);
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    // 照片底才需要壓暗；素色底直接用風格色，字才清楚
    if (onPhoto) { const g = ctx.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.4, "rgba(0,0,0,0.6)"); g.addColorStop(1, "rgba(0,0,0,0.75)"); ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55); }
    ctx.globalAlpha = k;
    ctx.fillStyle = onPhoto ? "#fff" : p.fg; ctx.font = `500 50px ${FONT}`; wrap(ctx, input.title, W - 200, 2).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.60 + i * 62));
    const shown = input.price != null ? Math.round(input.price * ease(local / 1.0) * 100) / 100 : null;
    ctx.fillStyle = onPhoto ? "#fff" : p.accent; ctx.font = `700 124px ${FONT}`;
    ctx.fillText(shown != null ? priceLabel(shown, input.currency, !!input.en) : noPriceText(!!input.en), W / 2, H * 0.73);
    const k2 = ease((local - 0.6) / 0.5); ctx.globalAlpha = k2;
    ctx.font = `700 50px ${FONT}`; const cw = ctx.measureText(input.cta).width + 90;
    rr(ctx, W / 2 - cw / 2, H * 0.77, cw, 94, 47); ctx.fillStyle = onPhoto ? "#fff" : p.fg; ctx.fill(); ctx.fillStyle = onPhoto ? "#1c1917" : p.bg1; ctx.fillText(input.cta, W / 2, H * 0.77 + 64);
    ctx.fillStyle = onPhoto ? "rgba(255,255,255,0.85)" : p.muted; ctx.font = `500 34px ${FONT}`; ctx.fillText(input.storeName, W / 2, H * 0.87);
    ctx.restore();
  }
  function drawScene(i: number, t: number) {
    const sc = input.scenes[i]; const local = t - starts[i]; const prog = local / sc.durationSec;
    const m = motionAt(sc.motion, prog);
    const img = sceneImgs[i];
    const onPhoto = sc.kind === "photo" && !!img;
    const isHead = sc.overlay === "headline", isClose = sc.overlay === "price" || sc.overlay === "cta";
    if (onPhoto) {
      const blur = sceneBlur[i];
      if (blur) { const bs = Math.max(W / blur.width, H / blur.height) * 1.05; ctx.drawImage(blur, (W - blur.width * bs) / 2, (H - blur.height * bs) / 2, blur.width * bs, blur.height * bs); }
      const tall = isTall(img!);
      const pic = feathered[i]!;
      const fs0 = (tall ? Math.max(W / pic.width, H / pic.height) : W / pic.width) * m.scale;
      // 鉤子場往下讓出標題區；結尾場往上讓出價格區
      const cy = tall ? H / 2 : isHead ? H * 0.54 : isClose ? H * 0.34 : H * 0.45;
      ctx.save(); ctx.translate(W / 2 + m.dx, cy + m.dy); ctx.rotate(m.rot);
      ctx.drawImage(pic, (-pic.width * fs0) / 2, (-pic.height * fs0) / 2, pic.width * fs0, pic.height * fs0); ctx.restore();
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.28)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.drawImage(bgTex, 0, 0);
      const gx = W * (0.3 + 0.4 * prog), gy = H * 0.35;
      const rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, 800); rg.addColorStop(0, dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.45)"); rg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      const subject = (img ?? heroShadow) as unknown as Image | null;
      if (subject) {
        const box = W * (isClose ? 0.62 : isHead ? 0.8 : 0.82);
        const cy = isClose ? H * 0.32 : isHead ? H * 0.54 : H * 0.45;
        const sz = Math.min(box / subject.width, box / subject.height) * m.scale;
        ctx.save(); ctx.translate(W / 2 + m.dx, cy + m.dy + Math.sin(local * 1.4) * 6); ctx.rotate(m.rot);
        if (img && !sceneKeyed[i]) { rr(ctx, (-img.width * sz) / 2 - 24, (-img.height * sz) / 2 - 24, img.width * sz + 48, img.height * sz + 48, 40); ctx.fillStyle = "#fff"; ctx.fill(); }
        ctx.drawImage(subject, (-subject.width * sz) / 2, (-subject.height * sz) / 2, subject.width * sz, subject.height * sz);
        ctx.restore();
      }
    }
    header(onPhoto);
    if (isHead) headline(input.hook, ease((local - 0.3) / 0.6), onPhoto);
    if (sc.overlay === "price" || sc.overlay === "cta") pricePanel(local, onPhoto);
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
