"use client";

import { fmtPrice } from "@/lib/i18n";
import { useState } from "react";
import type { JobPayload, ItemRow, AssetRow } from "./job-view";
import { Lightbox, type LightboxImage } from "./lightbox";
import { copyText } from "@/lib/copy-text";
import { STYLES, type StyleId } from "@/lib/config";
import { StoryboardEditor } from "./storyboard-editor";
import { useT, useLang } from "@/components/lang";
import { SHOT_LABEL_EN, STYLE_LABEL_EN } from "@/lib/i18n";

type Tab = "cards" | "reels" | "catalog";

export function Outputs({ data, onChange }: { data: JobPayload; onChange: () => void }) {
  const t = useT();
  const { job, items, assets } = data;
  const byItem = new Map(assets.map((a) => [a.itemId, a]));
  const [tab, setTab] = useState<Tab>("cards");
  const [toast, setToast] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const editItem = items.find((i) => i._id === editId);
  const shopPath = `/s/${job.code}`;
  const producing = job.status === "producing";
  const reelsDone = assets.filter((a) => a.reelUrl).length;
  const shotsDone = assets.filter((a) => a.studioUrl || a.lifestyleUrl).length;
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  async function copyLink() {
    const ok = await copyText(`${window.location.origin}${shopPath}`);
    say(ok ? t("已複製網址", "Link copied") : t("複製失敗，請手動選取", "Copy failed — please select and copy manually"));
  }

  return (
    <section className="mt-12">
      {editItem && <StoryboardEditor key={editItem._id} item={editItem} asset={byItem.get(editItem._id)} onChange={onChange} onClose={() => setEditId(null)} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("產出", "Outputs")}</h2>
          <p className="text-sm text-stone-500">{producing ? t(`正在生成商品圖 ${shotsDone}/${items.length}、短影片 ${reelsDone}/${items.length}…`, `Generating product photos ${shotsDone}/${items.length}, promo videos ${reelsDone}/${items.length}…`) : t(`${items.length} 件商品、${reelsDone} 支短影片。點圖可放大、換主圖；文字可直接改。`, `${items.length} products, ${reelsDone} promo videos. Click a photo to enlarge or set the main image; text is editable.`)}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={`/api/jobs/${job._id}/catalog.csv`} className="btn btn-ghost">{t("下載 Meta 目錄 CSV", "Download Meta catalog CSV")}</a>
          <a href={shopPath} target="_blank" className="btn btn-ghost">{t("開啟可購買頁", "Open shop page")}</a>
          <button onClick={copyLink} className="btn btn-ghost">{t("複製網址", "Copy link")}</button>
        </div>
      </div>

      <div className="mt-4 flex w-fit gap-1 rounded-lg bg-stone-100 p-1 text-sm">
        {([["cards", t("商品卡", "Product cards")], ["reels", t("短影片", "Promo videos")], ["catalog", t("目錄與頁面", "Catalog & shop page")]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-white shadow-sm" : "text-stone-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "cards" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => <ItemCard key={it._id} canEdit={data.canEdit} onStoryboard={() => setEditId(it._id)} item={it} asset={byItem.get(it._id)} producing={producing} jobStyle={job.style} currency={job.currency} onChange={onChange} say={say} />)}
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
                <div className="flex items-center justify-between px-2 py-1.5 text-xs text-stone-300"><span className="truncate">{it.code} {it.title}</span>{a?.reelUrl && <a href={a.reelUrl} download className="ml-2 underline">{t("下載", "Download")}</a>}</div>
                {!producing && a && data.canEdit && <button onClick={() => setEditId(it._id)} className="w-full border-t border-stone-700 py-1.5 text-xs text-white hover:bg-stone-800">{t("編輯分鏡", "Edit storyboard")}</button>}
              </div>
            );
          })}
        </div>
      )}

      {tab === "catalog" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-4 text-sm">
            <h3 className="font-semibold">{t("Meta 商品目錄", "Meta product catalog")}</h3>
            <p className="mt-1 text-stone-600">{t("CSV 欄位依 Commerce Manager 規格（id、title、description、availability、condition、price、link、image_link、brand、google_product_category）。到 Commerce Manager → 目錄 → 新增商品 → 資料來源 → 上傳檔案即可。", "Columns follow the Commerce Manager spec (id, title, description, availability, condition, price, link, image_link, brand, google_product_category). In Commerce Manager go to Catalog → Add items → Data sources → Upload file.")}</p>
            <a href={`/api/jobs/${job._id}/catalog.csv`} className="btn btn-primary mt-3">{t(`下載 CSV（${items.length} 列）`, `Download CSV (${items.length} rows)`)}</a>
          </div>
          <div className="card p-4 text-sm">
            <h3 className="font-semibold">{t("可購買頁", "Shop page")}</h3>
            <p className="mt-1 text-stone-600">{t("一個網址，放進 IG 個人簡介或貼文留言。顧客看到代碼就能留言下單。", "One link for your Instagram bio or post comments. Shoppers order by commenting the item code.")}</p>
            <div className="mt-3 flex gap-2"><input readOnly value={typeof window !== "undefined" ? `${window.location.origin}${shopPath}` : shopPath} className="input font-mono text-xs" /><button onClick={copyLink} className="btn btn-ghost whitespace-nowrap">{t("複製", "Copy")}</button></div>
          </div>
          {data.canEdit && <ShopContact jobId={job._id} shopName={job.shopName} contact={job.contact} onChange={onChange} className="lg:col-span-2" />}
          <CommentDemo jobId={job._id} className="lg:col-span-2" />
        </div>
      )}
    </section>
  );
}

function ItemCard({ canEdit, onStoryboard, item: it, asset: a, producing, jobStyle, currency, onChange, say }: { canEdit: boolean; onStoryboard: () => void; item: ItemRow; asset?: AssetRow; producing: boolean; jobStyle: string; currency: string; onChange: () => void; say: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [lb, setLb] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [regen, setRegen] = useState<null | "studio" | "lifestyle" | "both">(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [style, setStyle] = useState<string>(jobStyle);
  const [form, setForm] = useState({ title: it.title, price: it.price == null ? "" : String(it.price), caption: a?.caption ?? "", captionShort: a?.captionShort ?? "", captionLong: a?.captionLong ?? "", hook: a?.hook ?? "", voiceover: a?.voiceover ?? "", sellingPoints: (a?.sellingPoints ?? []).join("\n") });
  const [capTab, setCapTab] = useState<"short" | "post" | "long">("post");
  const captionOf = (k: typeof capTab) => (k === "short" ? a?.captionShort : k === "long" ? a?.captionLong : a?.caption) || "";
  // 商品卡只放生成的多角度圖與情境圖；原影片截圖不進卡片
  const KIND_LABEL: Record<string, string> = lang === "en" ? SHOT_LABEL_EN : { front: "正面", threeQuarter: "四十五度", side: "側面", lifestyle: "情境" };
  const shots = a?.shots?.length ? a.shots : [a?.studioUrl && { kind: "threeQuarter", label: t("棚拍", "Studio"), url: a.studioUrl }, a?.lifestyleUrl && { kind: "lifestyle", label: t("情境", "Lifestyle"), url: a.lifestyleUrl }].filter(Boolean) as { kind: string; label: string; url: string }[];
  const images: LightboxImage[] = [
    ...shots.map((sh) => ({ url: sh.url, label: KIND_LABEL[sh.kind] ?? sh.label, kind: sh.kind })),
    ...(a?.history ?? []).map((h, i) => ({ url: h.url, label: t(`舊版 ${i + 1}（${KIND_LABEL[h.kind] ?? h.kind}）`, `Previous ${i + 1} (${KIND_LABEL[h.kind] ?? h.kind})`), kind: "history" })),
  ];
  if (!images.length && (a?.cutoutUrl ?? it.primaryCutoutUrl)) images.push({ url: (a?.cutoutUrl ?? it.primaryCutoutUrl)!, label: t("去背圖", "Cutout"), kind: "cutout" });
  const hero = it.heroUrl ?? shots.find((sh) => sh.kind === "threeQuarter")?.url ?? shots[0]?.url ?? a?.cutoutUrl ?? it.primaryCutoutUrl;

  async function save() {
    setBusy(true);
    const price = form.price === "" ? null : Number(form.price);
    const r1 = await fetch(`/api/items/${it._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title, price }) });
    const r2 = await fetch(`/api/items/${it._id}/asset`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: form.caption, captionShort: form.captionShort, captionLong: form.captionLong, hook: form.hook, voiceover: form.voiceover, sellingPoints: form.sellingPoints.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3) }) });
    say(r1.ok && r2.ok ? t("已儲存", "Saved") : t("儲存失敗", "Save failed"));
    setBusy(false); setEditing(false); onChange();
  }
  async function setHero(url: string) {
    await fetch(`/api/items/${it._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ heroUrl: url }) });
    say(t("已設為主圖", "Set as main image")); onChange();
  }
  async function regenerateVideo() {
    setBusy(true); say(t("短片製作中，大約一分鐘…", "Rendering video, about a minute…"));
    const r = await fetch(`/api/items/${it._id}/regenerate-video`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    say(r.ok && j.ok ? t("短片已重做", "Video re-rendered") : t(`短片失敗：${j.error ?? "未知錯誤"}`, `Video failed: ${j.error ?? "unknown error"}`));
    setBusy(false); onChange();
  }
  async function regenerate(which: "studio" | "lifestyle" | "both") {
    setBusy(true);
    const r = await fetch(`/api/items/${it._id}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ which, hint, style }) });
    const j = await r.json().catch(() => ({}));
    say(r.ok && j.ok ? t("商品圖已重做", "Photos regenerated") : t(`重做失敗：${(j.errors ?? [j.error ?? "未知錯誤"]).join("；")}`, `Regeneration failed: ${(j.errors ?? [j.error ?? "unknown error"]).join("; ")}`));
    setBusy(false); setRegen(null); setHint(""); onChange();
  }

  return (
    <article className="card overflow-hidden">
      {lb != null && <Lightbox images={images} index={lb} onClose={() => setLb(null)} onSetHero={canEdit ? setHero : undefined} heroUrl={hero} />}
      <button onClick={() => images.length && setLb(Math.max(0, images.findIndex((im) => im.url === hero)))} className="block aspect-square w-full bg-white">
        {hero ? <img src={hero} alt="" className="h-full w-full object-contain transition hover:scale-[1.02]" /> : <div className="skeleton h-full w-full" />}
      </button>
      <div className="p-3">
        <div className="flex items-baseline justify-between"><span className="font-mono text-xs text-stone-400">{it.code} · {it.category}</span><span className="font-semibold">{it.price != null ? fmtPrice(it.price, currency) : t("未定價", "No price")}</span></div>
        <h3 className="mt-1 font-medium leading-snug">{it.title}</h3>
        <div className="mt-2 flex gap-1">
          {images.slice(0, 6).map((im, k) => <button key={im.url} onClick={() => setLb(k)} title={im.label} className={`h-11 w-11 overflow-hidden rounded-md ring-1 ${im.url === hero ? "ring-2 ring-orange-400" : "ring-stone-200"}`}><img src={im.url} alt="" className="h-full w-full object-cover" /></button>)}
          {producing && images.length < 4 && Array.from({ length: 4 - images.length }).map((_, k) => <div key={k} className="skeleton h-11 w-11 rounded-md" />)}
        </div>

        {!editing ? (
          <>
            {a?.hook && <p className="mt-3 text-sm font-medium">{a.hook}</p>}
            {a?.sellingPoints && a.sellingPoints.length > 0 && <ul className="mt-1 flex flex-wrap gap-1">{a.sellingPoints.map((s) => <li key={s} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{s}</li>)}</ul>}
            {a?.caption ? (
              <>
                <div className="mt-2 flex gap-1 text-[11px]">
                  {([["short", t("限動", "Story")], ["post", t("貼文", "Post")], ["long", t("商品頁", "Product page")]] as const).map(([k, l]) => <button key={k} onClick={() => setCapTab(k)} className={`rounded-full px-2 py-0.5 ${capTab === k ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}>{l}</button>)}
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-stone-500">{captionOf(capTab) || t("（這個長度還沒有文案，按編輯可補）", "(No copy for this length yet — click Edit to add it)")}</p>
              </>
            ) : producing ? <div className="skeleton mt-2 h-10 rounded" /> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {a?.caption && <button onClick={async () => say((await copyText(captionOf(capTab))) ? t("文案已複製", "Copy copied") : t("複製失敗", "Copy failed"))} className="btn btn-ghost px-2 py-1">{t("複製文案", "Copy text")}</button>}
              {canEdit && <>
                <button onClick={() => setEditing(true)} className="btn btn-ghost px-2 py-1">{t("編輯", "Edit")}</button>
                <button disabled={busy} onClick={() => setRegen(regen ? null : "both")} className="btn btn-ghost px-2 py-1">{t("換一張", "New photos")}</button>
                {a && !producing && <button disabled={busy} onClick={onStoryboard} className="btn btn-ghost px-2 py-1">{t("編輯分鏡", "Edit storyboard")}</button>}
                <button disabled={busy} onClick={regenerateVideo} className="btn btn-ghost px-2 py-1">{t("重做短片", "Re-render video")}</button>
              </>}
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-2 text-xs">
            <label className="block">{t("品名", "Title")}<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input mt-0.5" /></label>
            <label className="block">{t(`價格（${currency}）`, `Price (${currency})`)}<input value={form.price} inputMode="decimal" onChange={(e) => setForm({ ...form, price: e.target.value })} className="input mt-0.5 w-32" /></label>
            <label className="block">{t("短片開頭一句", "Video opening line")}<input value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} className="input mt-0.5" /></label>
            <label className="block">{t("三個賣點（一行一個）", "Three selling points (one per line)")}<textarea value={form.sellingPoints} onChange={(e) => setForm({ ...form, sellingPoints: e.target.value })} rows={3} className="input mt-0.5" /></label>
            <label className="block">{t("限動一句", "Story line")}<input value={form.captionShort} onChange={(e) => setForm({ ...form, captionShort: e.target.value })} className="input mt-0.5" /></label>
            <label className="block">{t("貼文文案", "Post caption")}<textarea value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} rows={4} className="input mt-0.5" /></label>
            <label className="block">{t("商品頁完整介紹", "Full product description")}<textarea value={form.captionLong} onChange={(e) => setForm({ ...form, captionLong: e.target.value })} rows={4} className="input mt-0.5" /></label>
            <p className="text-stone-500">{t("短片旁白、字幕和每一場畫面請到「編輯分鏡」修改。", "Edit narration, subtitles and scene images in “Edit storyboard”.")}</p>
            <div className="flex gap-2"><button disabled={busy} onClick={save} className="btn btn-primary px-3 py-1.5">{t("儲存", "Save")}</button><button onClick={() => setEditing(false)} className="btn btn-ghost px-3 py-1.5">{t("取消", "Cancel")}</button></div>
            <p className="text-stone-400">{t("改完後按「重做短片」才會更新影片。", "Click “Re-render video” afterwards to update the video.")}</p>
          </div>
        )}

        {regen && (
          <div className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3 text-xs">
            <div className="font-medium">{t("重做商品圖（三個角度加情境，約 30 秒）", "Regenerate photos (three angles plus lifestyle, ~30 s)")}</div>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="input">{(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{lang === "en" ? (STYLE_LABEL_EN[k] ?? STYLES[k].label) : STYLES[k].label}</option>)}</select>
            <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t("一句方向（選填），例如：放在木桌上，旁邊有一杯咖啡", "Optional direction, e.g. on a wooden table next to a cup of coffee")} className="input" />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => regenerate("both")} className="btn btn-primary px-3 py-1.5">{busy ? t("生成中…", "Generating…") : t("棚拍＋情境", "Studio + lifestyle")}</button>
              <button disabled={busy} onClick={() => regenerate("studio")} className="btn btn-ghost px-3 py-1.5">{t("只重做三個角度", "Angles only")}</button>
              <button disabled={busy} onClick={() => regenerate("lifestyle")} className="btn btn-ghost px-3 py-1.5">{t("只重做情境", "Lifestyle only")}</button>
              <button onClick={() => setRegen(null)} className="text-stone-500">{t("取消", "Cancel")}</button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

type CommentResult = { text: string; reply: string; itemCode: string | null; itemTitle: string | null; model: string; ms: number; buyer?: string | null; lines?: { code: string; qty: number; title: string; price: number | null; currency: string }[] };

/** 留言對商品：可一次貼整串直播留言；「A3+1」這類下單由規則解析並彙整成訂單表，提問才交給 Muse Spark Open */
function CommentDemo({ jobId, className = "" }: { jobId: string; className?: string }) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<CommentResult[]>([]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const rows = text.split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
    if (!rows.length) return;
    setBusy(true);
    for (const row of rows) {
      const r = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, text: row }) });
      const j = await r.json().catch(() => ({}));
      setLog((l) => [{ text: row, reply: j.reply ?? j.error ?? "", itemCode: j.itemCode ?? null, itemTitle: j.itemTitle ?? null, model: j.model ?? "", ms: j.ms ?? 0, buyer: j.buyer ?? null, lines: j.lines }, ...l]);
    }
    setText(""); setBusy(false);
  }
  // 訂單表：同一位買家同一件合併數量
  const orders = new Map<string, { buyer: string; code: string; title: string; qty: number; price: number | null; currency: string }>();
  for (const l of [...log].reverse()) for (const x of l.lines ?? []) {
    const buyer = l.buyer || t("（未署名）", "(no name)");
    const k = `${buyer}|${x.code}`;
    const o = orders.get(k);
    if (o) o.qty += x.qty; else orders.set(k, { buyer, code: x.code, title: x.title, qty: x.qty, price: x.price, currency: x.currency });
  }
  const rows = Array.from(orders.values());
  const total = rows.every((r) => r.price != null) && rows.length ? rows.reduce((s, r) => s + r.price! * r.qty, 0) : null;
  const csv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const body = [["buyer", "code", "title", "qty", "unit_price", "currency", "subtotal"], ...rows.map((r) => [r.buyer, r.code, r.title, r.qty, r.price ?? "", r.currency, r.price != null ? r.price * r.qty : ""])].map((r) => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/csv" }));
    a.download = `orders-${jobId}.csv`; a.click();
  };
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="font-semibold">{t("直播留言 → 訂單", "Live comments → orders")}</h3>
      <p className="text-xs text-stone-500">{t("把直播或貼文的留言整串貼進來，一行一則。「A3+1」「王小美：A1+1 B2 x2」這類下單直接用規則解析並整理成訂單表；「A3 多少」「還有藍色的嗎」這類提問，由開放權重的 Muse Spark Open（Baseten 託管）判斷並草擬回覆。", "Paste the comments from a live stream or post, one per line. Orders like “A3+1” or “Amy: A1+1 B2 x2” are parsed by rules into an order sheet; questions like “how much is A3?” or “got it in blue?” go to the open-weight Muse Spark Open (hosted on Baseten), which drafts a reply.")}</p>
      <form onSubmit={send} className="mt-3 space-y-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="input font-mono text-xs" placeholder={t("王小美：A1+1\nA3 x2\n+1 B1\nC1 還有別的顏色嗎？", "Amy: A1+1\nA3 x2\n+1 B1\nDoes C1 come in other colors?")} />
        <button disabled={busy || !text.trim()} className="btn btn-primary">{busy ? t("處理中…", "Working…") : t("解析留言", "Process comments")}</button>
      </form>
      {rows.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <h4 className="text-sm font-semibold">{t(`訂單表（${rows.length} 筆）`, `Order sheet (${rows.length})`)}</h4>
            <button type="button" onClick={csv} className="text-xs text-stone-500 underline hover:text-stone-900">{t("下載訂單 CSV", "Download orders CSV")}</button>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-stone-500"><tr><th className="py-1 pr-2">{t("買家", "Buyer")}</th><th className="py-1 pr-2">{t("商品", "Item")}</th><th className="py-1 pr-2 text-right">{t("數量", "Qty")}</th><th className="py-1 text-right">{t("小計", "Subtotal")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.buyer}|${r.code}`} className="border-t border-stone-100">
                    <td className="py-1 pr-2">{r.buyer}</td>
                    <td className="py-1 pr-2"><span className="font-mono text-orange-700">{r.code}</span> {r.title}</td>
                    <td className="py-1 pr-2 text-right">{r.qty}</td>
                    <td className="py-1 text-right">{r.price != null ? fmtPrice(r.price * r.qty, r.currency) : t("未定價", "No price")}</td>
                  </tr>
                ))}
              </tbody>
              {total != null && <tfoot><tr className="border-t border-stone-200 font-semibold"><td className="py-1" colSpan={3}>{t("合計", "Total")}</td><td className="py-1 text-right">{fmtPrice(total, rows[0].currency)}</td></tr></tfoot>}
            </table>
          </div>
        </div>
      )}
      <ul className="mt-3 space-y-2 text-sm">
        {log.map((l, i) => (
          <li key={i} className="rounded-lg bg-stone-50 p-2">
            <div className="text-stone-500">{t("顧客：", "Shopper: ")}{l.text}</div>
            <div className="mt-0.5">{t("回覆：", "Reply: ")}{l.reply} {!l.lines?.length && l.itemCode && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 font-mono text-xs text-orange-700">{l.itemCode} {l.itemTitle}</span>}</div>
            <div className="mt-0.5 text-[10px] text-stone-400">{l.model === "rule" ? t("規則解析（不用模型）", "Rule-based (no model call)") : l.model} · {l.ms} ms</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 店家資料：店名與買家聯絡方式，可購買頁的下單按鈕會帶顧客去這裡 */
function ShopContact({ jobId, shopName, contact, onChange, className = "" }: { jobId: string; shopName: string; contact?: { instagram: string; line: string; phone: string }; onChange: () => void; className?: string }) {
  const t = useT();
  const [form, setForm] = useState({ shopName, instagram: contact?.instagram ?? "", line: contact?.line ?? "", phone: contact?.phone ?? "" });
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ shopName: form.shopName, contact: { instagram: form.instagram, line: form.line, phone: form.phone } }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { text: t("已儲存，可購買頁的下單按鈕已更新。", "Saved. The order buttons on your shop page are updated.") } : { text: j.error ?? t("儲存失敗", "Save failed"), bad: true });
    setBusy(false); if (r.ok) onChange();
  }
  const none = !form.instagram && !form.line && !form.phone;
  return (
    <form onSubmit={save} className={`card p-4 text-sm ${className}`}>
      <h3 className="font-semibold">{t("店家資料與下單方式", "Shop details & how to order")}</h3>
      <p className="mt-1 text-stone-600">{t("顧客在可購買頁按「下單」時，會複製「我要 代碼 品名」並帶去你填的地方。至少填一種。", "When a shopper taps “Order” on the shop page, we copy “I want [code] [title]” and send them to the channel you set. Fill in at least one.")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">{t("店名", "Shop name")}<input value={form.shopName} maxLength={60} onChange={(e) => setForm({ ...form, shopName: e.target.value })} className="input mt-1" /></label>
        <label className="block">{t("Instagram 帳號", "Instagram handle")}<input value={form.instagram} maxLength={40} placeholder={t("例如 xiaohua.shop", "e.g. xiaohua.shop")} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="input mt-1" /></label>
        <label className="block">LINE ID<input value={form.line} maxLength={40} placeholder={t("例如 @xiaohua", "e.g. @xiaohua")} onChange={(e) => setForm({ ...form, line: e.target.value })} className="input mt-1" /></label>
        <label className="block">{t("手機（簡訊）", "Mobile (SMS)")}<input value={form.phone} maxLength={30} inputMode="tel" placeholder={t("例如 0912345678", "e.g. 0912345678")} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input mt-1" /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button disabled={busy} className="btn btn-primary">{busy ? t("儲存中…", "Saving…") : t("儲存", "Save")}</button>
        {none && <span className="text-amber-700">{t("還沒有設定下單方式，顧客只能複製文字。", "No order channel yet — shoppers can only copy the text.")}</span>}
        {msg && <span role="status" className={msg.bad ? "text-red-600" : "text-green-700"}>{msg.text}</span>}
      </div>
    </form>
  );
}
