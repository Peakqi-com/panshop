"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { ItemRow, AssetRow, SceneRow } from "./job-view";

const MOTION_LABEL: Record<string, string> = { push_in: "推近", pull_out: "拉遠", pan_left: "向左移", pan_right: "向右移", drift_up: "上飄", orbit: "微轉" };
const OVERLAY_LABEL: Record<string, string> = { none: "只有字幕", headline: "開場大標", price: "結尾價格" };
const SHOT_LABEL: Record<string, string> = { front: "正面", threeQuarter: "四十五度", side: "側面", lifestyle: "情境" };
const VOICE_LABEL: Record<string, string> = { fish: "專業配音", openai: "專業配音", seller: "賣家原聲", none: "無口白" };
type Track = { id: string; title: string; url: string };

export function StoryboardEditor({ item: it, asset: a, onChange, onClose }: { item: ItemRow; asset?: AssetRow; onChange: () => void; onClose: () => void }) {
  const initial = a?.storyboard;
  const [hook, setHook] = useState(initial?.hook ?? "");
  const [scenes, setScenes] = useState<SceneRow[]>(initial?.scenes ?? []);
  const [musicChoice, setMusicChoice] = useState(initial?.music ?? "auto");
  const [gallery, setGallery] = useState<string[]>(initial?.gallery ?? []);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [hints, setHints] = useState<Record<number, string>>({});
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const preview = musicChoice !== "auto" && musicChoice !== "synth" && musicChoice !== "none" ? tracks.find((t) => t.id === musicChoice) : undefined;

  useEffect(() => { fetch("/api/music").then((r) => r.json()).then((j) => setTracks(j.tracks ?? [])).catch(() => undefined); }, []);

  const api = (body: unknown) => fetch(`/api/items/${it._id}/storyboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));
  function patchScene(i: number, set: Partial<SceneRow>) { setScenes((s) => s.map((x, k) => (k === i ? { ...x, ...set } : x))); setDirty(true); }
  function move(i: number, d: number) { setScenes((s) => { const n = [...s]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; }); setDirty(true); setPicker(null); }
  function remove(i: number) { setScenes((s) => s.filter((_, k) => k !== i)); setDirty(true); setPicker(null); }
  function duplicate(i: number) { setScenes((s) => { const n = [...s]; n.splice(i + 1, 0, { ...s[i], overlay: s[i].overlay === "headline" ? "none" : s[i].overlay }); return n; }); setDirty(true); setPicker(null); }
  function tryClose() { if (dirty) setConfirmClose(true); else onClose(); }

  async function save(): Promise<boolean> {
    const r = await fetch(`/api/items/${it._id}/storyboard`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ hook, music: musicChoice, scenes }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ text: `儲存失敗：${j.error ?? r.status}`, bad: true }); return false; }
    setDirty(false); onChange();
    return true;
  }
  async function saveOnly() { setBusy("save"); if (await save()) setMsg({ text: "分鏡已儲存。按「儲存並重新合成」才會更新影片。" }); setBusy(null); }
  async function saveAndRender() {
    setBusy("render"); setMsg({ text: "正在合成短片，大約需要一到兩分鐘…" });
    if (await save()) {
      const r = await fetch(`/api/items/${it._id}/regenerate-video`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok && !j.fallback) setMsg({ text: "短片已更新。" });
      else if (r.ok && j.fallback) setMsg({ text: `分鏡合成失敗，已退回基本版短片，你的分鏡修改沒有套用：${j.fallback}`, bad: true });
      else setMsg({ text: `合成失敗：${j.error ?? `狀態 ${r.status}，可能超過函式時間`}`, bad: true });
      onChange();
    }
    setBusy(null);
  }
  async function rewriteAll() {
    setConfirmRewrite(false); setBusy("rewrite"); setMsg({ text: "AI 正在重寫整份分鏡…" });
    const { ok, j } = await api({ action: "rewrite" });
    if (ok) { setHook(j.storyboard.hook); setScenes(j.storyboard.scenes); setDirty(false); setMsg({ text: "分鏡已重寫。按「儲存並重新合成」才會更新影片。" }); onChange(); }
    else setMsg({ text: `重寫失敗：${j.error}`, bad: true });
    setBusy(null);
  }
  async function sceneText(i: number) {
    setBusy(`text${i}`);
    const { ok, j } = await api({ action: "scene-text", sceneNo: scenes[i].sceneNo, hint: hints[i] ?? "" });
    if (ok) { patchScene(i, { narration: j.narration, subtitle: j.subtitle, imagePrompt: j.imagePrompt }); setMsg({ text: `第 ${i + 1} 場文字已更新，記得儲存。` }); }
    else setMsg({ text: `失敗：${j.error}`, bad: true });
    setBusy(null);
  }
  async function sceneImage(i: number) {
    setBusy(`image${i}`);
    const description = hints[i]?.trim() || scenes[i].imagePrompt || scenes[i].subtitle;
    const { ok, j } = await api({ action: "scene-image", sceneNo: scenes[i].sceneNo, description });
    if (ok) { patchScene(i, { imageUrl: j.imageUrl, shot: "generate" }); setGallery((g) => [j.imageUrl, ...g]); setMsg({ text: `第 ${i + 1} 場畫面已更新，記得儲存。` }); }
    else setMsg({ text: `生成失敗：${j.error}`, bad: true });
    setBusy(null);
  }
  async function uploadImage(i: number, f: File) {
    setBusy(`image${i}`);
    try {
      const b = await upload(`scenes/${it._id}-${Date.now()}-${f.name}`, f, { access: "public", handleUploadUrl: "/api/upload" });
      await api({ action: "add-image", url: b.url });
      patchScene(i, { imageUrl: b.url, shot: "upload" }); setGallery((g) => [b.url, ...g]); setPicker(null);
    } catch (e) { setMsg({ text: `上傳失敗：${e instanceof Error ? e.message : e}`, bad: true }); }
    setBusy(null);
  }

  const shots = a?.shots ?? [];
  const shotUrls = new Set(shots.map((s) => s.url));
  const extra = Array.from(new Set([...gallery, ...scenes.map((s) => s.imageUrl).filter(Boolean) as string[]])).filter((u) => !shotUrls.has(u));
  const total = scenes.reduce((n, s) => n + s.durationSec, 0);
  const anyBusy = busy !== null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-stone-100">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-3">
        <div className="min-w-0"><h2 className="truncate font-semibold">編輯分鏡：{it.code} {it.title}</h2><p className="text-xs text-stone-500">{scenes.length} 場，約 {Math.round(total)} 秒{dirty ? "，有未儲存的修改" : ""}</p></div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button disabled={anyBusy || scenes.length < 2} onClick={saveOnly} className="btn btn-ghost">{busy === "save" ? "儲存中…" : "儲存"}</button>
          <button disabled={anyBusy || scenes.length < 2} onClick={saveAndRender} className="btn btn-primary">{busy === "render" ? "合成中…" : "儲存並重新合成"}</button>
          {confirmClose
            ? <span className="flex items-center gap-2 rounded-lg bg-red-50 px-2 text-xs text-red-800">還有修改沒儲存<button onClick={onClose} className="btn bg-red-600 px-2 py-1 text-white">不存，關閉</button><button onClick={() => setConfirmClose(false)} className="btn btn-ghost px-2 py-1">繼續編輯</button></span>
            : <button disabled={anyBusy} onClick={tryClose} className="btn btn-ghost">關閉</button>}
        </div>
      </header>
      {msg && <div role="status" className={`px-4 py-2 text-sm ${msg.bad ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-900"}`}>{msg.text}</div>}

      <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-xl bg-black">
            {a?.reelUrl ? <video key={a.reelUrl} src={a.reelUrl} poster={a.coverUrl} controls playsInline className="aspect-[9/16] w-full object-cover" /> : <div className="aspect-[9/16] w-full bg-stone-800" />}
          </div>
          <p className="text-xs text-stone-500">上方是目前的成品。配音：{VOICE_LABEL[initial?.voice ?? ""] ?? "尚未合成"}。上次音樂：{initial?.musicLabel ?? "尚未合成"}。</p>
          <div className="card space-y-3 p-3 text-sm">
            <label className="block font-medium">開場大標<input value={hook} maxLength={40} onChange={(e) => { setHook(e.target.value); setDirty(true); }} className="input mt-1 font-normal" /></label>
            <label className="block font-medium">背景音樂
              <select value={musicChoice} onChange={(e) => { setMusicChoice(e.target.value); setDirty(true); }} className="input mt-1 font-normal">
                <option value="auto">自動（依風格從曲庫挑）</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                <option value="synth">程式合成</option>
                <option value="none">不要音樂</option>
              </select>
            </label>
            {preview && <audio controls preload="none" src={preview.url} className="w-full" aria-label={`試聽 ${preview.title}`} />}
            {tracks.length === 0 && <p className="text-xs text-stone-500">曲庫還沒有曲目，自動會用程式合成的音樂。</p>}
            {confirmRewrite
              ? <div className="rounded-lg bg-red-50 p-2 text-xs text-red-800">會蓋掉目前所有場景的文字與圖片選擇。<div className="mt-2 flex gap-2"><button onClick={rewriteAll} className="btn btn-primary px-2 py-1">確定重寫</button><button onClick={() => setConfirmRewrite(false)} className="btn btn-ghost px-2 py-1">取消</button></div></div>
              : <button disabled={anyBusy} onClick={() => setConfirmRewrite(true)} className="btn btn-ghost w-full">{busy === "rewrite" ? "重寫中…" : initial ? "AI 重寫整份分鏡" : "讓 AI 寫分鏡"}</button>}
          </div>
        </aside>

        <ol className="space-y-3">
          {scenes.length === 0 && <li className="card p-6 text-center text-sm text-stone-500">這件商品還沒有分鏡。請按左邊的「讓 AI 寫分鏡」。</li>}
          {scenes.map((sc, i) => (
            <li key={`${i}-${sc.sceneNo}`} className="card p-3">
              <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <div>
                  <button aria-label={`更換第 ${i + 1} 場畫面`} onClick={() => setPicker(picker === i ? null : i)} className="block aspect-[9/16] w-full overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 hover:ring-2 hover:ring-orange-400">
                    {sc.imageUrl ? <img src={sc.imageUrl} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-stone-500">未選圖</span>}
                  </button>
                  <button onClick={() => setPicker(picker === i ? null : i)} className="mt-1 w-full text-center text-xs text-stone-600 underline">換圖</button>
                </div>
                <div className="min-w-0 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">第 {i + 1} 場</span>
                    <div className="flex gap-1 text-xs">
                      <button disabled={i === 0} onClick={() => move(i, -1)} className="btn btn-ghost px-2 py-1">上移</button>
                      <button disabled={i === scenes.length - 1} onClick={() => move(i, 1)} className="btn btn-ghost px-2 py-1">下移</button>
                      <button disabled={scenes.length >= 8} onClick={() => duplicate(i)} className="btn btn-ghost px-2 py-1">複製一場</button>
                      <button disabled={scenes.length <= 2} onClick={() => remove(i)} className="btn btn-ghost px-2 py-1 text-red-600">刪除</button>
                    </div>
                  </div>
                  <label className="block text-xs text-stone-600">旁白（句首方括號是語氣，例如 [溫暖、放慢]，不會念出來）<textarea value={sc.narration} maxLength={200} rows={2} onChange={(e) => patchScene(i, { narration: e.target.value })} className="input mt-0.5 text-sm" /></label>
                  <NarrationFit text={sc.narration} sec={sc.durationSec} />
                  <label className="block text-xs text-stone-600">字幕<input value={sc.subtitle} maxLength={60} onChange={(e) => patchScene(i, { subtitle: e.target.value })} className="input mt-0.5 text-sm" /></label>
                  <div className="grid grid-cols-3 gap-2 text-xs text-stone-600">
                    <label className="block">鏡頭<select value={sc.motion} onChange={(e) => patchScene(i, { motion: e.target.value })} className="input mt-0.5">{Object.entries(MOTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                    <label className="block">畫面文字<select value={sc.overlay === "cta" ? "price" : sc.overlay} onChange={(e) => patchScene(i, { overlay: e.target.value })} className="input mt-0.5">{Object.entries(OVERLAY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                    <label className="block">秒數<input type="number" min={2} max={10} step={0.5} value={sc.durationSec} onChange={(e) => patchScene(i, { durationSec: Math.max(2, Math.min(10, Number(e.target.value) || 2)) })} className="input mt-0.5" /></label>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <input value={hints[i] ?? ""} onChange={(e) => setHints((h) => ({ ...h, [i]: e.target.value }))} placeholder="重做這場的方向（選填），例如：放在木桌上、語氣更輕鬆" aria-label={`第 ${i + 1} 場重做方向`} className="input text-xs" />
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                      <button disabled={anyBusy} onClick={() => sceneText(i)} className="btn btn-ghost px-2 py-1">{busy === `text${i}` ? "重寫中…" : "重寫這場文字"}</button>
                      <button disabled={anyBusy} onClick={() => sceneImage(i)} className="btn btn-ghost px-2 py-1">{busy === `image${i}` ? "生成中，約 20 秒…" : "重新生成這場畫面"}</button>
                    </div>
                  </div>
                </div>
              </div>
              {picker === i && (
                <div className="mt-3 rounded-lg bg-stone-50 p-3">
                  <div className="flex items-center justify-between text-xs"><span className="font-medium">選一張圖</span><label className="btn btn-ghost cursor-pointer px-2 py-1">上傳自己的圖<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(i, f); }} /></label></div>
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                    {shots.map((s) => <Pick key={s.url} url={s.url} label={SHOT_LABEL[s.kind] ?? s.label} on={sc.imageUrl === s.url} onClick={() => { patchScene(i, { imageUrl: s.url, shot: s.kind }); setPicker(null); }} />)}
                    {extra.map((u) => <Pick key={u} url={u} label="場景" on={sc.imageUrl === u} onClick={() => { patchScene(i, { imageUrl: u, shot: "generate" }); setPicker(null); }} />)}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Pick({ url, label, on, onClick }: { url: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`overflow-hidden rounded-md bg-white text-[11px] ring-1 ${on ? "ring-2 ring-orange-400" : "ring-stone-200"}`}>
      <img src={url} alt="" className="aspect-square w-full object-contain" /><span className="block truncate px-1 py-0.5 text-stone-600">{label}</span>
    </button>
  );
}

/** 旁白長度提示：一般語速每秒約 4.5 個字，超過時合成會自動把這場拉長 */
function NarrationFit({ text, sec }: { text: string; sec: number }) {
  const n = Array.from(text.replace(/\[[^\]]*\]|［[^］]*］/g, "").replace(/[\s，。、！？,.!?]/g, "")).length;
  const need = n / 4.5;
  if (!n) return null;
  return <p className={`text-xs ${need > sec + 0.5 ? "text-amber-700" : "text-stone-400"}`}>{n} 字，約念 {need.toFixed(1)} 秒{need > sec + 0.5 ? `，比這場的 ${sec} 秒長，合成時會自動延長這一場` : ""}</p>;
}
