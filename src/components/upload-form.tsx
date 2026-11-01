"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function UploadForm({ needPasscode, sampleAvailable }: { needPasscode: boolean; sampleAvailable: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [shopName, setShopName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "upload" | "create" | "sample">("idle");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function createJob(videoUrl: string, fileName: string, bytes?: number, sample = false) {
    setPhase(sample ? "sample" : "create");
    const r = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sample ? { sample: true, shopName, passcode } : { videoUrl, fileName, bytes, shopName, passcode }),
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
  const pick = (f: File | undefined | null) => { if (f) { setFile(f); setError(null); } };

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
            <div className="mt-2 font-medium">{file.name}</div>
            <div className="text-xs text-stone-500">{(file.size / 1024 / 1024).toFixed(1)} MB · 點一下可換檔</div>
          </>
        ) : (
          <>
            <div className="mt-2 font-medium">把商品影片拖進來，或點一下選擇</div>
            <div className="text-xs text-stone-500">MP4 或 MOV · 1 到 3 分鐘 · 300 MB 以內</div>
          </>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">店名（選填）</span>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} className="input mt-1" placeholder="例如 小花選物" />
        </label>
        {needPasscode && (
          <label className="block text-sm">
            <span className="font-medium">通行碼</span>
            <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} className="input mt-1" />
          </label>
        )}
      </div>

      <button disabled={!file || busy} className="btn btn-primary mt-4 w-full py-3 text-base">
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
