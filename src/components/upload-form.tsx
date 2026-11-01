"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { STYLES, DEFAULT_STYLE, type StyleId } from "@/lib/config";

type Mode = "video" | "photos" | "replay";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "video", label: "掃影片", hint: "手機繞著商品慢慢拍 1 到 3 分鐘，邊拍邊說品名和價格" },
  { id: "photos", label: "匯入照片", hint: "相簿、供應商給的圖、截圖都可以，一張一件或一張多件" },
  { id: "replay", label: "直播回放", hint: "上傳直播回放檔，或貼可直接下載的影片網址；主播講到的商品會自動切出" },
];

export function UploadForm({ needPasscode, sampleAvailable, maxVideoSec = 240, maxReplaySec = 600, maxUploadMb = 300, maxPhotos = 30 }: { needPasscode: boolean; sampleAvailable: boolean; maxVideoSec?: number; maxReplaySec?: number; maxUploadMb?: number; maxPhotos?: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("video");
  const [file, setFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [replayUrl, setReplayUrl] = useState("");
  const [shopName, setShopName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [style, setStyle] = useState<StyleId>(DEFAULT_STYLE);
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
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, shopName, passcode, style }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "建立失敗");
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
      if (d > maxSec) problems.push(`影片 ${Math.round(d)} 秒，超過 ${maxSec} 秒上限`);
      if (f.size > maxUploadMb * 1024 * 1024) problems.push(`檔案 ${(f.size / 1024 / 1024).toFixed(0)} MB，超過 ${maxUploadMb} MB 上限`);
      if (d < 8) problems.push("影片太短，每件商品至少要在鏡頭內三秒");
      setWarn(problems.join("；") || null);
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
    <form onSubmit={submit} className="card rise p-6 shadow-sm">
      <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
        {MODES.map((m) => <button key={m.id} type="button" onClick={() => { setMode(m.id); setFile(null); setMeta(null); setWarn(null); setError(null); }} className={`flex-1 rounded-md px-2 py-1.5 ${mode === m.id ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}>{m.label}</button>)}
      </div>
      <p className="mt-2 text-xs text-stone-500">{current.hint}</p>

      {mode !== "photos" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pickVideo(e.dataTransfer.files?.[0]); }} onClick={() => inputRef.current?.click()}
          className={`mt-3 grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${drag ? "border-orange-400 bg-orange-50" : "border-stone-300 hover:border-stone-400"}`}
        >
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mov,.mp4" className="hidden" onChange={(e) => pickVideo(e.target.files?.[0])} />
          <div className="text-3xl">{mode === "replay" ? "📺" : "🎥"}</div>
          {file ? (
            <>
              {meta && <video src={meta.url} muted playsInline className="mt-2 max-h-40 rounded-lg" onClick={(e) => e.stopPropagation()} controls />}
              <div className="mt-2 font-medium">{file.name}</div>
              <div className="text-xs text-stone-500">{(file.size / 1024 / 1024).toFixed(1)} MB{meta ? ` · ${Math.round(meta.durationSec)} 秒` : ""} · 點一下可換檔</div>
            </>
          ) : (
            <>
              <div className="mt-2 font-medium">{mode === "replay" ? "把回放檔拖進來，或點一下選擇" : "把商品影片拖進來，或點一下選擇"}</div>
              <div className="text-xs text-stone-500">MP4 或 MOV · 最長 {Math.round(maxSec / 60)} 分鐘 · {maxUploadMb} MB 以內</div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <div onClick={() => inputRef.current?.click()} className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-stone-300 px-4 py-6 text-center hover:border-stone-400">
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pickPhotos(e.target.files); e.target.value = ""; }} />
            <div className="text-3xl">🖼️</div>
            <div className="mt-2 font-medium">{photos.length ? `已選 ${photos.length} 張，點一下再加` : "選擇商品照片（可多選）"}</div>
            <div className="text-xs text-stone-500">JPG、PNG、WebP · 最多 {maxPhotos} 張</div>
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
          <span className="font-medium">或貼回放影片網址</span>
          <input value={replayUrl} onChange={(e) => setReplayUrl(e.target.value)} className="input mt-1 font-mono text-xs" placeholder="https://…/replay.mp4（要能直接下載；IG、FB 的回放請先下載再上傳）" />
        </label>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="font-medium">店名（選填）</span><input value={shopName} onChange={(e) => setShopName(e.target.value)} className="input mt-1" placeholder="例如 小花選物" /></label>
        <label className="block text-sm"><span className="font-medium">商品圖風格</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as StyleId)} className="input mt-1">{(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{STYLES[k].label}</option>)}</select>
        </label>
        {needPasscode && <label className="block text-sm"><span className="font-medium">通行碼</span><input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} className="input mt-1" /></label>}
      </div>

      {warn && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{warn}</p>}
      <button disabled={!canSubmit || busy} className="btn btn-primary mt-4 w-full py-3 text-base">
        {phase === "upload" ? `上傳中 ${Math.round(progress ?? 0)}%` : phase === "create" ? "建立中…" : mode === "photos" ? `開始分析 ${photos.length ? `${photos.length} 張照片` : ""}` : "開始分析"}
      </button>
      {phase === "upload" && <div className="mt-2 h-1.5 overflow-hidden rounded bg-stone-100"><div className="h-full bg-orange-500 transition-all" style={{ width: `${progress ?? 0}%` }} /></div>}
      {sampleAvailable && mode === "video" && (
        <button type="button" onClick={useSample} disabled={busy} className="btn btn-ghost mt-2 w-full text-sm">{phase === "sample" ? "建立中…" : "沒有影片？用範例影片試試（8 件商品、80 秒）"}</button>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <ul className="mt-5 space-y-1 text-xs text-stone-500">
        {mode === "video" && <><li>・一次 10 件以內、3 個品類以內最準；每件完整入鏡至少 3 秒。</li><li>・邊拍邊說「這個 ○○○，△△ 元」，價格會自動帶進確認表。</li></>}
        {mode === "photos" && <><li>・一張照片可以有多件商品，會各自切出。</li><li>・同一件商品的不同角度照片會自動併成一件。</li></>}
        {mode === "replay" && <><li>・主播拿起來講的商品會被切出，講到的價格自動帶入。</li><li>・回放越長處理越久，10 分鐘約需 8 到 12 分鐘。</li></>}
        <li>・處理期間可以先離開，回「我的掃描」查看。</li>
      </ul>
    </form>
  );
}
