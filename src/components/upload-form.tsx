"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UploadForm({ needPasscode }: { needPasscode: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [shopName, setShopName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const blob = await upload(`uploads/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ passcode }),
        onUploadProgress: (p) => setProgress(p.percentage),
      });
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoUrl: blob.url, fileName: file.name, bytes: file.size, shopName, passcode }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "建立失敗");
      router.push(`/jobs/${j.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      <label className="block">
        <span className="text-sm font-medium">商品影片（MP4 或 MOV）</span>
        <input type="file" accept="video/mp4,video/quicktime" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">店名（選填）</span>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" placeholder="例如 小花選物" />
        </label>
        {needPasscode && (
          <label className="block">
            <span className="text-sm font-medium">通行碼</span>
            <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
        )}
      </div>
      <button disabled={!file || progress !== null} className="w-full rounded-lg bg-orange-600 px-4 py-3 font-medium text-white disabled:opacity-50">
        {progress === null ? "開始分析" : progress < 100 ? `上傳中 ${Math.round(progress)}%` : "建立中…"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
