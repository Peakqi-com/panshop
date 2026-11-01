"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { STYLES, DEFAULT_STYLE, type StyleId } from "@/lib/config";

export function UploadForm({ needPasscode, sampleAvailable, maxVideoSec = 240, maxUploadMb = 300 }: { needPasscode: boolean; sampleAvailable: boolean; maxVideoSec?: number; maxUploadMb?: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
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

  async function createJob(videoUrl: string, fileName: string, bytes?: number, sample = false) {
    setPhase(sample ? "sample" : "create");
    const r = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sample ? { sample: true, shopName, passcode, style } : { videoUrl, fileName, bytes, shopName, passcode, style }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "建立失敗");
    router.push(`/jobs/${j.code}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null); setProgress(0); setPhase("upload");
    try {
      const blob = await upload(`uploads/${Date.now()}-${file.name}`, file, {
        access: "public", handleUploadUrl: "/api/upload", clientPayload: JSON.stringify({ passcode }),
        onUploadProgress: (p) => setProgress(p.percentage),
      });
      await createJob(blob.url, file.name, file.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); setProgress(null); setPhase("idle");
    }
  }

  async function useSample() {
    setError(null);
    try { await createJob("", "sample.mp4", undefined, true); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setPhase("idle"); }
  }

  const busy = phase !== "idle";
  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f); setError(null); setWarn(null);
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata"; v.src = url;
    v.onloadedmetadata = () => {
      const d = v.duration;
      setMeta({ url, durationSec: d });
      const problems: string[] = [];
      if (d > maxVideoSec) problems.push(`影片 ${Math.round(d)} 秒，超過 ${maxVideoSec} 秒上限`);
      if (f.size > maxUploadMb * 1024 * 1024) problems.push(`檔案 ${(f.size / 1024 / 1024).toFixed(0)} MB，超過 ${maxUploadMb} MB 上限`);
      if (d < 8) problems.push("影片太短，每件商品至少要在鏡頭內三秒");
      setWarn(problems.join("；") || null);
    };
  };

  return (
    <form onSubmit={submit} className="card rise p-6 shadow-sm">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${drag ? "border-orange-400 bg-orange-50" : "border-stone-300 hover:border-stone-400"}`}
      >
        <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mov,.mp4" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <div className="text-3xl">🎥</div>
        {file ? (
          <>
            {meta && <video src={meta.url} muted playsInline className="mt-2 max-h-40 rounded-lg" onClick={(e) => e.stopPropagation()} controls />}
            <div className="mt-2 font-medium">{file.name}</div>
            <div className="text-xs text-stone-500">{(file.size / 1024 / 1024).toFixed(1)} MB{meta ? ` · ${Math.round(meta.durationSec)} 秒` : ""} · 點一下可換檔</div>
          </>
        ) : (
          <>
            <div className="mt-2 font-medium">把商品影片拖進來，或點一下選擇</div>
            <div className="text-xs text-stone-500">MP4 或 MOV · 最長 {Math.round(maxVideoSec / 60)} 分鐘 · {maxUploadMb} MB 以內</div>
          </>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">店名（選填）</span>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} className="input mt-1" placeholder="例如 小花選物" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">商品圖風格</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as StyleId)} className="input mt-1">
            {(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{STYLES[k].label}</option>)}
          </select>
        </label>
        {needPasscode && (
          <label className="block text-sm">
            <span className="font-medium">通行碼</span>
            <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} className="input mt-1" />
          </label>
        )}
      </div>

      {warn && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{warn}</p>}
      <button disabled={!file || busy || !!warn} className="btn btn-primary mt-4 w-full py-3 text-base">
        {phase === "upload" ? `上傳中 ${Math.round(progress ?? 0)}%` : phase === "create" ? "建立中…" : "開始分析"}
      </button>
      {phase === "upload" && <div className="mt-2 h-1.5 overflow-hidden rounded bg-stone-100"><div className="h-full bg-orange-500 transition-all" style={{ width: `${progress ?? 0}%` }} /></div>}
      {sampleAvailable && (
        <button type="button" onClick={useSample} disabled={busy} className="btn btn-ghost mt-2 w-full text-sm">
          {phase === "sample" ? "建立中…" : "沒有影片？用範例影片試試（8 件商品、80 秒）"}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <ul className="mt-5 space-y-1 text-xs text-stone-500">
        <li>・一次 10 件以內、3 個品類以內最準；每件完整入鏡至少 3 秒。</li>
        <li>・邊拍邊說「這個 ○○○，△△ 元」，價格會自動帶進確認表。</li>
        <li>・處理約 3 到 5 分鐘，可以先離開，回「我的掃描」查看。</li>
      </ul>
    </form>
  );
}
