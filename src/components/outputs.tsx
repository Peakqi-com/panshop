"use client";

import { useState } from "react";
import type { JobPayload, ItemRow, AssetRow } from "./job-view";
import { Lightbox, type LightboxImage } from "./lightbox";
import { copyText } from "@/lib/copy-text";
import { STYLES, type StyleId } from "@/lib/config";

type Tab = "cards" | "reels" | "catalog";

export function Outputs({ data, onChange }: { data: JobPayload; onChange: () => void }) {
  const { job, items, assets } = data;
  const byItem = new Map(assets.map((a) => [a.itemId, a]));
  const [tab, setTab] = useState<Tab>("cards");
  const [toast, setToast] = useState<string | null>(null);
  const shopPath = `/s/${job.code}`;
  const producing = job.status === "producing";
  const reelsDone = assets.filter((a) => a.reelUrl).length;
  const shotsDone = assets.filter((a) => a.studioUrl || a.lifestyleUrl).length;
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  async function copyLink() {
    const ok = await copyText(`${window.location.origin}${shopPath}`);
    say(ok ? "已複製網址" : "複製失敗，請手動選取");
  }

  return (
    <section className="mt-12">
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">產出</h2>
          <p className="text-sm text-stone-500">{producing ? `正在生成商品圖 ${shotsDone}/${items.length}、短影片 ${reelsDone}/${items.length}…` : `${items.length} 件商品、${reelsDone} 支短影片。點圖可放大、換主圖；文字可直接改。`}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={`/api/jobs/${job._id}/catalog.csv`} className="btn btn-ghost">下載 Meta 目錄 CSV</a>
          <a href={shopPath} target="_blank" className="btn btn-ghost">開啟可購買頁</a>
          <button onClick={copyLink} className="btn btn-ghost">複製網址</button>
        </div>
      </div>

      <div className="mt-4 flex w-fit gap-1 rounded-lg bg-stone-100 p-1 text-sm">
        {([["cards", "商品卡"], ["reels", "短影片"], ["catalog", "目錄與頁面"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-white shadow-sm" : "text-stone-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "cards" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => <ItemCard key={it._id} item={it} asset={byItem.get(it._id)} producing={producing} jobStyle={job.style} currency={job.currency} onChange={onChange} say={say} />)}
        </div>
      )}

      {tab === "reels" && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it) => {
            const a = byItem.get(it._id);
            return (
              <div key={it._id} className="overflow-hidden rounded-xl bg-black">
                {a?.reelUrl ? <video src={a.reelUrl} poster={a.coverUrl} controls playsInline className="aspect-[9/16] w-full object-cover" />
                  : <div className={`aspect-[9/16] w-full ${producing ? "skeleton" : "bg-stone-800"}`} />}
                <div className="flex items-center justify-between px-2 py-1.5 text-xs text-stone-300"><span>{it.code} {it.title}</span>{a?.reelUrl && <a href={a.reelUrl} download className="underline">下載</a>}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "catalog" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-4 text-sm">
            <h3 className="font-semibold">Meta 商品目錄</h3>
            <p className="mt-1 text-stone-600">CSV 欄位依 Commerce Manager 規格（id、title、description、availability、condition、price、link、image_link、brand、google_product_category）。到 Commerce Manager → 目錄 → 新增商品 → 資料來源 → 上傳檔案即可。</p>
            <a href={`/api/jobs/${job._id}/catalog.csv`} className="btn btn-primary mt-3">下載 CSV（{items.length} 列）</a>
          </div>
          <div className="card p-4 text-sm">
            <h3 className="font-semibold">可購買頁</h3>
            <p className="mt-1 text-stone-600">一個網址，放進 IG 個人簡介或貼文留言。顧客看到代碼就能留言下單。</p>
            <div className="mt-3 flex gap-2"><input readOnly value={typeof window !== "undefined" ? `${window.location.origin}${shopPath}` : shopPath} className="input font-mono text-xs" /><button onClick={copyLink} className="btn btn-ghost whitespace-nowrap">複製</button></div>
          </div>
          <CommentDemo jobId={job._id} className="lg:col-span-2" />
        </div>
      )}
    </section>
  );
}

function ItemCard({ item: it, asset: a, producing, jobStyle, currency, onChange, say }: { item: ItemRow; asset?: AssetRow; producing: boolean; jobStyle: string; currency: string; onChange: () => void; say: (m: string) => void }) {
  const [lb, setLb] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [regen, setRegen] = useState<null | "studio" | "lifestyle" | "both">(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [style, setStyle] = useState<string>(jobStyle);
  const [form, setForm] = useState({ title: it.title, price: it.price == null ? "" : String(it.price), caption: a?.caption ?? "", hook: a?.hook ?? "", voiceover: a?.voiceover ?? "", sellingPoints: (a?.sellingPoints ?? []).join("\n") });
  // 商品卡只放生成的多角度圖與情境圖；原影片截圖不進卡片
  const KIND_LABEL: Record<string, string> = { front: "正面", threeQuarter: "四十五度", side: "側面", lifestyle: "情境" };
  const shots = a?.shots?.length ? a.shots : [a?.studioUrl && { kind: "threeQuarter", label: "棚拍", url: a.studioUrl }, a?.lifestyleUrl && { kind: "lifestyle", label: "情境", url: a.lifestyleUrl }].filter(Boolean) as { kind: string; label: string; url: string }[];
  const images: LightboxImage[] = [
    ...shots.map((sh) => ({ url: sh.url, label: KIND_LABEL[sh.kind] ?? sh.label, kind: sh.kind })),
    ...(a?.history ?? []).map((h, i) => ({ url: h.url, label: `舊版 ${i + 1}（${KIND_LABEL[h.kind] ?? h.kind}）`, kind: "history" })),
  ];
  if (!images.length && (a?.cutoutUrl ?? it.primaryCutoutUrl)) images.push({ url: (a?.cutoutUrl ?? it.primaryCutoutUrl)!, label: "去背圖", kind: "cutout" });
  const hero = it.heroUrl ?? shots.find((sh) => sh.kind === "threeQuarter")?.url ?? shots[0]?.url ?? a?.cutoutUrl ?? it.primaryCutoutUrl;

  async function save() {
    setBusy(true);
    const price = form.price === "" ? null : Number(form.price);
    const r1 = await fetch(`/api/items/${it._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title, price }) });
    const r2 = await fetch(`/api/items/${it._id}/asset`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: form.caption, hook: form.hook, voiceover: form.voiceover, sellingPoints: form.sellingPoints.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3) }) });
    say(r1.ok && r2.ok ? "已儲存" : "儲存失敗");
    setBusy(false); setEditing(false); onChange();
  }
  async function setHero(url: string) {
    await fetch(`/api/items/${it._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ heroUrl: url }) });
    say("已設為主圖"); onChange();
  }
  async function regenerateVideo() {
    setBusy(true); say("短片製作中，約 30 秒…");
    const r = await fetch(`/api/items/${it._id}/regenerate-video`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    say(r.ok && j.ok ? "短片已重做" : `短片失敗：${j.error ?? "未知錯誤"}`);
    setBusy(false); onChange();
  }
  async function regenerate(which: "studio" | "lifestyle" | "both") {
    setBusy(true);
    const r = await fetch(`/api/items/${it._id}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ which, hint, style }) });
    const j = await r.json().catch(() => ({}));
    say(r.ok && j.ok ? "商品圖已重做" : `重做失敗：${(j.errors ?? [j.error ?? "未知錯誤"]).join("；")}`);
    setBusy(false); setRegen(null); setHint(""); onChange();
  }

  return (
    <article className="card overflow-hidden">
      {lb != null && <Lightbox images={images} index={lb} onClose={() => setLb(null)} onSetHero={setHero} heroUrl={hero} />}
      <button onClick={() => images.length && setLb(Math.max(0, images.findIndex((im) => im.url === hero)))} className="block aspect-square w-full bg-white">
        {hero ? <img src={hero} alt="" className="h-full w-full object-contain transition hover:scale-[1.02]" /> : <div className="skeleton h-full w-full" />}
      </button>
      <div className="p-3">
        <div className="flex items-baseline justify-between"><span className="font-mono text-xs text-stone-400">{it.code} · {it.category}</span><span className="font-semibold">{it.price != null ? `${currency} ${it.price.toLocaleString()}` : "未定價"}</span></div>
        <h3 className="mt-1 font-medium leading-snug">{it.title}</h3>
        <div className="mt-2 flex gap-1">
          {images.slice(0, 6).map((im, k) => <button key={im.url} onClick={() => setLb(k)} title={im.label} className={`h-11 w-11 overflow-hidden rounded-md ring-1 ${im.url === hero ? "ring-2 ring-orange-400" : "ring-stone-200"}`}><img src={im.url} alt="" className="h-full w-full object-cover" /></button>)}
          {producing && images.length < 4 && Array.from({ length: 4 - images.length }).map((_, k) => <div key={k} className="skeleton h-11 w-11 rounded-md" />)}
        </div>

        {!editing ? (
          <>
            {a?.hook && <p className="mt-3 text-sm font-medium">{a.hook}</p>}
            {a?.sellingPoints && a.sellingPoints.length > 0 && <ul className="mt-1 flex flex-wrap gap-1">{a.sellingPoints.map((s) => <li key={s} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{s}</li>)}</ul>}
            {a?.caption ? <p className="mt-2 whitespace-pre-line text-xs text-stone-500">{a.caption}</p> : producing ? <div className="skeleton mt-2 h-10 rounded" /> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {a?.caption && <button onClick={async () => say((await copyText(a.caption)) ? "文案已複製" : "複製失敗")} className="btn btn-ghost px-2 py-1">複製文案</button>}
              <button onClick={() => setEditing(true)} className="btn btn-ghost px-2 py-1">編輯</button>
              <button disabled={busy} onClick={() => setRegen(regen ? null : "both")} className="btn btn-ghost px-2 py-1">換一張</button>
              <button disabled={busy} onClick={regenerateVideo} className="btn btn-ghost px-2 py-1">重做短片</button>
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-2 text-xs">
            <label className="block">品名<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input mt-0.5" /></label>
            <label className="block">價格（{currency}）<input value={form.price} inputMode="decimal" onChange={(e) => setForm({ ...form, price: e.target.value })} className="input mt-0.5 w-32" /></label>
            <label className="block">短片開頭一句<input value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} className="input mt-0.5" /></label>
            <label className="block">三個賣點（一行一個）<textarea value={form.sellingPoints} onChange={(e) => setForm({ ...form, sellingPoints: e.target.value })} rows={3} className="input mt-0.5" /></label>
            <label className="block">貼文文案<textarea value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} rows={4} className="input mt-0.5" /></label>
            <label className="block">口白<textarea value={form.voiceover} onChange={(e) => setForm({ ...form, voiceover: e.target.value })} rows={3} className="input mt-0.5" /></label>
            <div className="flex gap-2"><button disabled={busy} onClick={save} className="btn btn-primary px-3 py-1.5">儲存</button><button onClick={() => setEditing(false)} className="btn btn-ghost px-3 py-1.5">取消</button></div>
            <p className="text-stone-400">改完後按「重做短片」才會更新影片。</p>
          </div>
        )}

        {regen && (
          <div className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3 text-xs">
            <div className="font-medium">重做商品圖（三個角度加情境，約 20 秒、$0.04）</div>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="input">{(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{STYLES[k].label}</option>)}</select>
            <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="一句方向（選填），例如：放在木桌上，旁邊有一杯咖啡" className="input" />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => regenerate("both")} className="btn btn-primary px-3 py-1.5">{busy ? "生成中…" : "棚拍＋情境"}</button>
              <button disabled={busy} onClick={() => regenerate("studio")} className="btn btn-ghost px-3 py-1.5">只重做三個角度</button>
              <button disabled={busy} onClick={() => regenerate("lifestyle")} className="btn btn-ghost px-3 py-1.5">只重做情境</button>
              <button onClick={() => setRegen(null)} className="text-stone-500">取消</button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function CommentDemo({ jobId, className = "" }: { jobId: string; className?: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ text: string; reply: string; itemCode: string | null; itemTitle: string | null; model: string; ms: number }[]>([]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, text }) });
    const j = await r.json();
    setLog((l) => [{ text, reply: j.reply ?? j.error, itemCode: j.itemCode ?? null, itemTitle: j.itemTitle ?? null, model: j.model ?? "", ms: j.ms ?? 0 }, ...l]);
    setText(""); setBusy(false);
  }
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="font-semibold">留言對商品</h3>
      <p className="text-xs text-stone-500">貼上顧客留言，例如「A3 多少」「還有藍色的嗎」。由開放權重的 Muse Spark Open（Baseten 託管）判斷意圖、對上商品、草擬回覆。</p>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="顧客留言…" />
        <button disabled={busy} className="btn btn-primary whitespace-nowrap">{busy ? "…" : "送出"}</button>
      </form>
      <ul className="mt-3 space-y-2 text-sm">
        {log.map((l, i) => (
          <li key={i} className="rounded-lg bg-stone-50 p-2">
            <div className="text-stone-500">顧客：{l.text}</div>
            <div className="mt-0.5">小編：{l.reply} {l.itemCode && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 font-mono text-xs text-orange-700">{l.itemCode} {l.itemTitle}</span>}</div>
            <div className="mt-0.5 text-[10px] text-stone-400">{l.model} · {l.ms} ms</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
