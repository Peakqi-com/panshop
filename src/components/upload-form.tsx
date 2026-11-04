"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { STYLES, DEFAULT_STYLE, type StyleId } from "@/lib/config";
import { useT, useLang } from "@/components/lang";
import { STYLE_LABEL_EN, CURRENCIES, CURRENCY_LABEL, defaultCurrency, type Currency } from "@/lib/i18n";

type Mode = "video" | "photos" | "replay";
const MODES: { id: Mode; label: [string, string]; hint: [string, string] }[] = [
  { id: "video", label: ["掃影片", "Scan video"], hint: ["手機繞著商品慢慢拍 1 到 3 分鐘，邊拍邊說品名和價格", "Slowly pan your phone across the products for 1 to 3 minutes, saying each name and price as you go"] },
  { id: "photos", label: ["匯入照片", "Import photos"], hint: ["相簿、供應商給的圖、截圖都可以，一張一件或一張多件", "Camera roll, supplier images or screenshots; one or many products per photo"] },
  { id: "replay", label: ["直播回放", "Live replay"], hint: ["上傳直播回放檔，或貼可直接下載的影片網址；主播講到的商品會自動切出", "Upload a live-stream replay or paste a direct video link; every product the host shows is cut out automatically"] },
];

export function UploadForm({ needPasscode, sampleAvailable, maxVideoSec = 240, maxReplaySec = 600, maxUploadMb = 300, maxPhotos = 30 }: { needPasscode: boolean; sampleAvailable: boolean; maxVideoSec?: number; maxReplaySec?: number; maxUploadMb?: number; maxPhotos?: number }) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<Mode>("video");
  const [file, setFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [replayUrl, setReplayUrl] = useState("");
  const [shopName, setShopName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [style, setStyle] = useState<StyleId>(DEFAULT_STYLE);
  const [currencyPick, setCurrency] = useState<Currency | null>(null);
  const currency = currencyPick ?? defaultCurrency(lang);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "upload" | "create" | "sample">("idle");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [meta, setMeta] = useState<{ url: string; durationSec: number } | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxSec = mode === "replay" ? maxReplaySec : maxVideoSec;

  async function createJob(body: Record<string, unknown>, sample = false) {
    setPhase(sample ? "sample" : "create");
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, shopName, passcode, style, lang, currency }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? t("建立失敗", "Could not create the scan"));
    router.push(`/jobs/${j.code}`);
  }

  const pickVideo = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f); setError(null); setWarn(null);
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata"; v.src = url;
    v.onloadedmetadata = () => {
      const d = v.duration;
      setMeta({ url, durationSec: d });
      const problems: string[] = [];
      if (d > maxSec) problems.push(t(`影片 ${Math.round(d)} 秒，超過 ${maxSec} 秒上限`, `The video is ${Math.round(d)}s, over the ${maxSec}s limit`));
      if (f.size > maxUploadMb * 1024 * 1024) problems.push(t(`檔案 ${(f.size / 1024 / 1024).toFixed(0)} MB，超過 ${maxUploadMb} MB 上限`, `The file is ${(f.size / 1024 / 1024).toFixed(0)} MB, over the ${maxUploadMb} MB limit`));
      if (d < 8) problems.push(t("影片太短，每件商品至少要在鏡頭內三秒", "Too short: each product needs at least 3 seconds on camera"));
      setWarn(problems.join(t("；", "; ")) || null);
    };
  };
  const pickPhotos = (list: FileList | null) => {
    if (!list) return;
    const next = [...photos, ...Array.from(list).filter((f) => f.type.startsWith("image/"))].slice(0, maxPhotos);
    setPhotos(next); setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "photos") {
        if (!photos.length) return;
        setPhase("upload"); setProgress(0);
        const urls: { url: string; name: string }[] = [];
        for (const [i, f] of photos.entries()) {
          const blob = await upload(`uploads/photos/${Date.now()}-${i}-${f.name}`, f, { access: "public", handleUploadUrl: "/api/upload", clientPayload: JSON.stringify({ passcode }) });
          urls.push({ url: blob.url, name: f.name });
          setProgress(((i + 1) / photos.length) * 100);
        }
        await createJob({ source: "photos", photos: urls });
        return;
      }
      if (mode === "replay" && !file) {
        if (!replayUrl.trim()) return;
        await createJob({ source: "replay", videoUrl: replayUrl.trim(), fileName: "replay.mp4" });
        return;
      }
      if (!file) return;
      setPhase("upload"); setProgress(0);
      const blob = await upload(`uploads/${Date.now()}-${file.name}`, file, { access: "public", handleUploadUrl: "/api/upload", clientPayload: JSON.stringify({ passcode }), onUploadProgress: (p) => setProgress(p.percentage) });
      await createJob({ source: mode, videoUrl: blob.url, fileName: file.name, bytes: file.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); setProgress(null); setPhase("idle");
    }
  }

  async function useSample() {
    setError(null);
    try { await createJob({ sample: true }, true); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setPhase("idle"); }
  }

  const busy = phase !== "idle";
  const canSubmit = mode === "photos" ? photos.length > 0 : mode === "replay" ? (!!file || !!replayUrl.trim()) && !warn : !!file && !warn;
  const current = MODES.find((m) => m.id === mode)!;

  return (
    <form id="start" onSubmit={submit} className="card rise scroll-mt-24 p-5 sm:p-6">
      <div className="flex gap-1 rounded-xl border-[2.5px] border-[var(--ink)] bg-[var(--bg)] p-1 text-sm">
        {MODES.map((m) => <button key={m.id} type="button" onClick={() => { setMode(m.id); setFile(null); setMeta(null); setWarn(null); setError(null); }} className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1.5 text-xs sm:px-2 sm:text-sm ${mode === m.id ? "bg-[var(--yellow)] font-black ring-2 ring-[var(--ink)]" : "font-bold text-stone-600 hover:bg-white"}`}>{t(...m.label)}</button>)}
      </div>
      <p className="mt-2 text-xs text-stone-500">{t(...current.hint)}</p>

      {mode !== "photos" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pickVideo(e.dataTransfer.files?.[0]); }} onClick={() => inputRef.current?.click()}
          className={`mt-3 grid cursor-pointer place-items-center rounded-xl border-[2.5px] border-dashed px-4 py-8 text-center transition ${drag ? "border-[var(--accent)] bg-orange-50" : "border-[var(--ink)] bg-[var(--bg)] hover:bg-white"}`}
        >
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mov,.mp4" className="hidden" onChange={(e) => pickVideo(e.target.files?.[0])} />
          <Icon kind={mode === "replay" ? "replay" : "video"} />
          {file ? (
            <>
              {meta && <video src={meta.url} muted playsInline className="mt-2 max-h-40 rounded-lg" onClick={(e) => e.stopPropagation()} controls />}
              <div className="mt-2 font-medium">{file.name}</div>
              <div className="text-xs text-stone-500">{(file.size / 1024 / 1024).toFixed(1)} MB{meta ? ` · ${Math.round(meta.durationSec)}${t(" 秒", "s")}` : ""} · {t("點一下可換檔", "click to change")}</div>
            </>
          ) : (
            <>
              <div className="mt-2 font-medium">{mode === "replay" ? t("把回放檔拖進來，或點一下選擇", "Drop the replay file here, or click to choose") : t("把商品影片拖進來，或點一下選擇", "Drop your product video here, or click to choose")}</div>
              <div className="text-xs text-stone-500">{t(`MP4 或 MOV · 最長 ${Math.round(maxSec / 60)} 分鐘 · ${maxUploadMb} MB 以內`, `MP4 or MOV · up to ${Math.round(maxSec / 60)} min · ${maxUploadMb} MB max`)}</div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <div onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pickPhotos(e.dataTransfer.files); }}
            className={`grid cursor-pointer place-items-center rounded-xl border-[2.5px] border-dashed px-4 py-6 text-center transition ${drag ? "border-[var(--accent)] bg-orange-50" : "border-[var(--ink)] bg-[var(--bg)] hover:bg-white"}`}>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pickPhotos(e.target.files); e.target.value = ""; }} />
            <Icon kind="photos" />
            <div className="mt-2 font-medium">{photos.length ? t(`已選 ${photos.length} 張，點一下或拖進來再加`, `${photos.length} selected. Click or drop to add more`) : t("把商品照片拖進來，或點一下選擇（可多選）", "Drop product photos here, or click to choose (multiple allowed)")}</div>
            <div className="text-xs text-stone-500">{t(`JPG、PNG、WebP · 最多 ${maxPhotos} 張`, `JPG, PNG, WebP · up to ${maxPhotos}`)}</div>
          </div>
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {photos.map((f, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-md ring-1 ring-stone-200">
                  <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setPhotos(photos.filter((_, k) => k !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1 text-[10px] text-white">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "replay" && !file && (
        <label className="mt-3 block text-sm">
          <span className="font-medium">{t("或貼回放影片網址", "Or paste a replay video link")}</span>
          <input value={replayUrl} onChange={(e) => setReplayUrl(e.target.value)} className="input mt-1 font-mono text-xs" placeholder={t("https://…/replay.mp4（要能直接下載；IG、FB 的回放請先下載再上傳）", "https://…/replay.mp4 (must be a direct download; download IG/FB replays first)")} />
        </label>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="font-medium">{t("店名（選填）", "Shop name (optional)")}</span><input value={shopName} onChange={(e) => setShopName(e.target.value)} className="input mt-1" placeholder={t("例如 小花選物", "e.g. Daisy Goods")} /></label>
        <label className="block text-sm"><span className="font-medium">{t("商品圖風格", "Photo style")}</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as StyleId)} className="input mt-1">{(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{lang === "en" ? STYLE_LABEL_EN[k] ?? STYLES[k].label : STYLES[k].label}</option>)}</select>
        </label>
        <label className="block text-sm"><span className="font-medium">{t("幣別", "Currency")}</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="input mt-1">{CURRENCIES.map((c) => <option key={c} value={c}>{t(...CURRENCY_LABEL[c])}</option>)}</select>
        </label>
        {needPasscode && <label className="block text-sm"><span className="font-medium">{t("通行碼", "Passcode")}</span><input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} className="input mt-1" /></label>}
      </div>

      {warn && <p className="mt-3 rounded-lg border-2 border-[var(--ink)] bg-[var(--yellow)]/40 px-3 py-2 text-xs text-stone-900">{warn}</p>}
      <button disabled={!canSubmit || busy} className="btn btn-primary mt-4 w-full py-3 text-base">
        {phase === "upload" ? t(`上傳中 ${Math.round(progress ?? 0)}%`, `Uploading ${Math.round(progress ?? 0)}%`) : phase === "create" ? t("建立中…", "Creating…") : mode === "photos" ? t(`開始分析 ${photos.length ? `${photos.length} 張照片` : ""}`, `Analyze ${photos.length ? `${photos.length} photos` : ""}`) : t("開始分析", "Analyze")}
      </button>
      {phase === "upload" && <div className="mt-2 h-2.5 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-white"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress ?? 0}%` }} /></div>}
      {sampleAvailable && mode === "video" && (
        <button type="button" onClick={useSample} disabled={busy} className="btn btn-ghost mt-2 w-full text-sm">{phase === "sample" ? t("建立中…", "Creating…") : t("沒有影片？用範例影片試試（8 件商品、80 秒）", "No video? Try the sample (8 products, 80 seconds)")}</button>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <ul className="mt-5 space-y-1 text-xs text-stone-500">
        {mode === "video" && <><li>{t("・一次 10 件以內、3 個品類以內最準；每件完整入鏡至少 3 秒。", "・Best with up to 10 items in 3 categories; keep each fully in frame for 3+ seconds.")}</li><li>{t("・邊拍邊說「這個 ○○○，△△ 元」，價格會自動帶進確認表。", "・Say “this is the …, … dollars” while filming and the price lands in the review table.")}</li></>}
        {mode === "photos" && <><li>{t("・一張照片可以有多件商品，會各自切出。", "・A photo can hold several products; each is cut out separately.")}</li><li>{t("・同一件商品的不同角度照片會自動併成一件。", "・Different angles of the same product are merged into one item.")}</li></>}
        {mode === "replay" && <><li>{t("・主播拿起來講的商品會被切出，講到的價格自動帶入。", "・Products the host holds up are cut out, with the prices they mention.")}</li><li>{t("・回放越長處理越久，10 分鐘約需 8 到 12 分鐘。", "・Longer replays take longer: 10 minutes needs about 8 to 12 minutes.")}</li></>}
        <li>{t("・處理期間可以先離開，回「我的掃描」查看。", "・You can leave while it runs and come back via “My scans”.")}</li>
      </ul>
    </form>
  );
}

function Icon({ kind }: { kind: "video" | "photos" | "replay" }) {
  const common = { width: 32, height: 32, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "text-stone-500", "aria-hidden": true };
  if (kind === "photos") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></svg>;
  if (kind === "replay") return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /><path d="m10 8.5 4 2-4 2z" /></svg>;
  return <svg {...common}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
}
