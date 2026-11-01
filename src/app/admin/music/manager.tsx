"use client";

import { useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { STYLES, type StyleId } from "@/lib/config";
import { addMusicAction, updateMusicAction, deleteMusicAction } from "../actions";

export type MusicRow = { id: string; title: string; url: string; durationSec: number; styles: string[]; license: string; active: boolean };
const KEYS = Object.keys(STYLES) as StyleId[];

function audioDuration(f: File) {
  return new Promise<number>((resolve, reject) => {
    const el = new Audio(); const u = URL.createObjectURL(f);
    el.preload = "metadata"; el.src = u;
    el.onloadedmetadata = () => { URL.revokeObjectURL(u); resolve(el.duration); };
    el.onerror = () => { URL.revokeObjectURL(u); reject(new Error("讀不到這個音檔")); };
  });
}

function StyleChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {KEYS.map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />{STYLES[k].label}</label>)}
    </div>
  );
}

export function MusicManager({ rows }: { rows: MusicRow[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [license, setLicense] = useState("");
  const [styles, setStyles] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [pending, start] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null); setProgress(0);
    try {
      const durationSec = await audioDuration(file);
      const b = await upload(`music/${Date.now()}-${file.name}`, file, { access: "public", handleUploadUrl: "/api/upload", onUploadProgress: (p) => setProgress(p.percentage) });
      await addMusicAction({ title: title.trim() || file.name, url: b.url, durationSec, styles, license: license.trim() });
      setFile(null); setTitle(""); setLicense(""); setStyles([]); setFormKey((k) => k + 1);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setProgress(null);
  }

  return (
    <>
      <form onSubmit={add} className="card mt-4 space-y-3 p-4 text-sm">
        <h2 className="font-semibold">新增曲目</h2>
        <input key={formKey} type="file" required accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.wav,.m4a" aria-label="音檔" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <p className="text-xs text-stone-500">支援 MP3、WAV、M4A，30 MB 以內。曲長不夠會自動循環到片長。</p>
        <label className="block">曲名<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="空白就用檔名" className="input mt-1" /></label>
        <label className="block">來源與授權<input value={license} maxLength={200} onChange={(e) => setLicense(e.target.value)} placeholder="例如：Artlist 訂閱授權、自行製作" className="input mt-1" /></label>
        <div><div className="mb-1">適用風格（都不勾＝所有風格）</div><StyleChecks value={styles} onChange={setStyles} /></div>
        <button disabled={!file || progress !== null} className="btn btn-primary">{progress !== null ? `上傳中 ${Math.round(progress)}%` : "上傳"}</button>
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </form>

      <ul className="mt-4 space-y-3">
        {rows.length === 0 && <li className="card p-6 text-center text-sm text-stone-500">曲庫還沒有曲目。</li>}
        {rows.map((t) => (
          <li key={t.id} className={`card space-y-2 p-4 text-sm ${t.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><span className="font-medium">{t.title}</span> <span className="text-xs text-stone-500">{Math.round(t.durationSec)} 秒{t.active ? "" : "，已停用"}</span></div>
              <div className="flex gap-2 text-xs">
                <button disabled={pending} onClick={() => start(() => updateMusicAction(t.id, { active: !t.active }))} className="btn btn-ghost px-2 py-1">{t.active ? "停用" : "啟用"}</button>
                {confirmId === t.id
                  ? <><button disabled={pending} onClick={() => start(() => deleteMusicAction(t.id))} className="btn btn-primary px-2 py-1">確定刪除</button><button onClick={() => setConfirmId(null)} className="btn btn-ghost px-2 py-1">取消</button></>
                  : <button onClick={() => setConfirmId(t.id)} className="btn btn-ghost px-2 py-1 text-red-600">刪除</button>}
              </div>
            </div>
            <audio controls preload="none" src={t.url} className="w-full" />
            <StyleChecks value={t.styles} onChange={(v) => start(() => updateMusicAction(t.id, { styles: v }))} />
            <p className="text-xs text-stone-500">授權：{t.license || "未填"}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
