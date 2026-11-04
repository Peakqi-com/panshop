"use client";

import { fmtPrice, CURRENCIES, CURRENCY_LABEL } from "@/lib/i18n";
import { useState } from "react";
import type { JobPayload, ItemRow } from "./job-view";
import { useT } from "@/components/lang";

export function ReviewTable({ data, onChange }: { data: JobPayload; onChange: () => void }) {
  const { job } = data;
  const items = data.items.filter((i) => i.status !== "deleted");
  const deleted = data.items.filter((i) => i.status === "deleted" && !i.title.includes("（併入"));
  const categories = Array.from(new Set(data.items.map((i) => i.category)));
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [batchPrice, setBatchPrice] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const editable = data.canEdit && job.status === "review";
  const low = items.filter((i) => i.confidence.overall < 0.6).length;
  const noPrice = items.filter((i) => i.price == null).length;
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000); };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function produce() {
    setBusy(true);
    await fetch(`/api/jobs/${job._id}/produce`, { method: "POST" });
    setBusy(false);
    onChange();
  }
  async function post(url: string, body: unknown) {
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setSel(new Set()); onChange();
    return { ok: r.ok, j };
  }
  async function merge() {
    const r = await post("/api/items/merge", { ids: Array.from(sel) });
    say(r.ok ? t(`已合併為 ${r.j.keep}`, `Merged into ${r.j.keep}`) : r.j.error ?? t("合併失敗", "Merge failed"));
  }
  async function batch(action: "delete" | "price" | "category", extra: Record<string, unknown> = {}) {
    const r = await post("/api/items/batch", { ids: Array.from(sel), action, ...extra });
    say(r.ok ? t(`已更新 ${r.j.n} 件`, `Updated ${r.j.n} items`) : r.j.error ?? t("失敗", "Failed"));
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-3 text-lg font-semibold">{t("確認表", "Review table")}
          {editable && (
            <select aria-label={t("幣別", "Currency")} value={data.job.currency} disabled={busy} onChange={async (e) => {
              const r = await fetch(`/api/jobs/${data.job._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ currency: e.target.value }) });
              if (!r.ok) say((await r.json().catch(() => ({}))).error ?? t("失敗", "Failed"));
              onChange();
            }} className="input w-auto py-1 text-xs font-normal">
              {CURRENCIES.map((c) => <option key={c} value={c}>{t(...CURRENCY_LABEL[c])}</option>)}
            </select>
          )}
        </h2>
        <p className="text-sm text-stone-500">
          {editable ? <>{t("只要確認一次。", "One check and you're done. ")}{low > 0 && <span className="text-amber-700">{t(`${low} 件信心較低（黃底）`, `${low} low-confidence (yellow)`)}</span>}{low > 0 && noPrice > 0 && t("，", ", ")}{noPrice > 0 && <span>{t(`${noPrice} 件沒有價格`, `${noPrice} without a price`)}</span>}</> : t("已確認", "Confirmed")}
        </p>
      </div>

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border-2 border-[var(--ink)] bg-white p-2 text-xs">
          <span className="text-stone-500">{sel.size ? t(`已選 ${sel.size} 件：`, `${sel.size} selected:`) : t("勾選商品可批次處理：", "Select items for bulk actions:")}</span>
          <button disabled={busy || sel.size < 2} onClick={merge} className="btn btn-ghost px-2 py-1 disabled:opacity-40">{t("合併成一件", "Merge into one")}</button>
          <span className="flex items-center gap-1">
            <input value={batchPrice} onChange={(e) => setBatchPrice(e.target.value)} inputMode="decimal" placeholder={t("價格", "Price")} className="input w-20 py-1" />
            <button disabled={busy || !sel.size || batchPrice === ""} onClick={() => batch("price", { price: Number(batchPrice) })} className="btn btn-ghost px-2 py-1 disabled:opacity-40">{t("套用價格", "Apply price")}</button>
          </span>
          <select disabled={busy || !sel.size} defaultValue="" onChange={(e) => e.target.value && batch("category", { category: e.target.value })} className="input w-28 py-1 disabled:opacity-40">
            <option value="">{t("改品類…", "Change category…")}</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button disabled={busy || !sel.size} onClick={() => batch("delete")} className="btn btn-ghost px-2 py-1 text-red-700 disabled:opacity-40">{t("不賣", "Remove")}</button>
          {msg && <span className="text-green-700">{msg}</span>}
        </div>
      )}

      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm md:min-w-[760px]">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr>{editable && <th className="p-2 sm:p-3"><input type="checkbox" checked={sel.size === items.length && items.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(items.map((i) => i._id)) : new Set())} /></th>}<th className="p-2 sm:p-3">{t("商品", "Item")}</th><th className="p-2 sm:p-3">{t("品名與描述", "Name & description")}</th><th className="p-2 sm:p-3 text-right">{t("價格", "Price")} <span className="font-normal text-stone-400">{data.job.currency}</span></th><th className="hidden p-3 md:table-cell">{t("顏色／材質", "Color / material")}</th><th className="hidden p-3 md:table-cell">{t("依據", "Evidence")}</th><th className="p-2 sm:p-3"></th></tr>
          </thead>
          <tbody>
            {items.map((it) => <Row key={it._id} item={it} editable={editable} categories={categories} selected={sel.has(it._id)} onToggle={() => toggle(it._id)} onChange={onChange} say={say} />)}
          </tbody>
        </table>
      </div>
      {editable && deleted.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <span>{t("已標記不賣：", "Removed:")}</span>
          {deleted.map((d) => (
            <button key={d._id} onClick={async () => { await fetch(`/api/items/${d._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "draft" }) }); onChange(); }} className="rounded-full border-2 border-[var(--ink)] bg-white px-2.5 py-1 font-bold hover:bg-[var(--yellow)]">
              {d.code} {d.title} ↺
            </button>
          ))}
        </div>
      )}
      {editable && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-3 rounded-xl border-[3px] border-[var(--ink)] bg-[var(--yellow)] p-3 font-bold shadow-[5px_5px_0_var(--ink)]">
          <div className="text-sm"><span className="font-medium">{t(`${items.length} 件`, `${items.length} items`)}</span><span className="font-normal text-stone-700">{t(" 將建立目錄、可購買頁與短影片", " → catalog, shop page and a short video each")}</span></div>
          <button onClick={produce} disabled={busy || !items.length} className="btn btn-primary">{busy ? t("處理中…", "Working…") : t("建立目錄", "Build catalog")}</button>
        </div>
      )}
    </section>
  );
}

function Row({ item, editable, categories, selected, onToggle, onChange, say }: { item: ItemRow; editable: boolean; categories: string[]; selected: boolean; onToggle: () => void; onChange: () => void; say: (m: string) => void }) {
  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(item.price == null ? "" : String(item.price));
  const [desc, setDesc] = useState(item.description);
  const [color, setColor] = useState(item.color);
  const [material, setMaterial] = useState(item.material);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const t = useT();
  const low = item.confidence.overall < 0.6;

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/items/${item._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setSaving(false);
    onChange();
  }
  async function remove() {
    await fetch(`/api/items/${item._id}`, { method: "DELETE" });
    onChange();
  }
  async function split() {
    const r = await fetch(`/api/items/${item._id}/split`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    say(r.ok ? t(`已拆出 ${j.created.join("、")}`, `Split into ${j.created.join(", ")}`) : j.error ?? t("拆分失敗", "Split failed"));
    onChange();
  }

  return (
    <tr className={`border-t border-stone-100 align-top ${selected ? "bg-orange-50/60" : low ? "bg-amber-50/70" : ""}`}>
      {editable && <td className="p-2 sm:p-3"><input type="checkbox" checked={selected} onChange={onToggle} /></td>}
      <td className="p-2 sm:p-3">
        <div className="flex gap-2">
          <img src={item.primaryCutoutUrl ?? item.primaryCropUrls[0]} alt="" className="h-16 w-16 rounded-lg bg-white object-contain ring-1 ring-stone-200" />
          <div className="hidden flex-col gap-1 sm:flex">{item.primaryCropUrls.slice(0, 2).map((u) => <img key={u} src={u} alt="" className="h-7 w-7 rounded object-cover ring-1 ring-stone-200" />)}</div>
        </div>
        <div className="mt-1 flex items-center gap-1 font-mono text-xs text-stone-500">
          {item.code}
          {editable ? (
            <select value={item.category} onChange={(e) => save({ category: e.target.value })} className="rounded border border-transparent bg-transparent font-sans text-xs text-stone-500 hover:border-stone-300">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : <span className="font-sans">· {item.category}</span>}
        </div>
        {item.trackIds.length > 1 && <div className="mt-0.5 text-[11px] text-stone-400">{t(`${item.trackIds.length} 段影像`, `${item.trackIds.length} clips`)}{editable && <> · <button onClick={split} className="underline hover:text-stone-700">{t(`拆成 ${item.trackIds.length} 件`, `Split into ${item.trackIds.length}`)}</button></>}</div>}
      </td>
      <td className="p-2 sm:p-3">
        {editable ? <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== item.title && save({ title })} className="input" /> : <div className="font-medium">{item.title}</div>}
        {editable ? (
          <>
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-xs text-stone-500 hover:text-stone-900">{open ? t("收起描述", "Hide description") : t("描述", "Description")} {item.description && !open && <span className="text-stone-400">· {item.description.slice(0, 24)}…</span>}</button>
            {open && <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== item.description && save({ description: desc })} rows={3} className="input mt-1 text-xs" />}
          </>
        ) : <div className="mt-1 line-clamp-2 text-xs text-stone-500">{item.description}</div>}
        <div className="mt-1 text-[11px] text-stone-400">{t("信心", "Confidence")} {Math.round(item.confidence.overall * 100)}%{saving && t(" · 儲存中…", " · Saving…")}</div>
      </td>
      <td className="p-2 sm:p-3 text-right">
        {editable ? (
          <input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} onBlur={() => (price === "" ? null : Number(price)) !== item.price && save({ price: price === "" ? null : Number(price) })} className="input w-20 text-right sm:w-24" placeholder={t("未定", "TBD")} />
        ) : item.price != null ? fmtPrice(item.price, item.currency) : <span className="text-stone-400">{t("未定", "TBD")}</span>}
      </td>
      <td className="hidden p-3 text-stone-600 md:table-cell">
        {editable ? (
          <div className="flex flex-col gap-1">
            <input value={color} onChange={(e) => setColor(e.target.value)} onBlur={() => color !== item.color && save({ color })} placeholder={t("顏色", "Color")} className="input w-24 py-1 text-xs" />
            <input value={material} onChange={(e) => setMaterial(e.target.value)} onBlur={() => material !== item.material && save({ material })} placeholder={t("材質", "Material")} className="input w-24 py-1 text-xs" />
          </div>
        ) : ([item.color, item.material].filter(Boolean).join("／") || "—")}
      </td>
      <td className="hidden p-3 text-xs text-stone-500 md:table-cell">
        {item.sources.speech ? <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-800" title={item.speechEvidence}>{t("畫面＋口述", "Vision + speech")}</span> : <span className="rounded bg-stone-100 px-1.5 py-0.5">{t("畫面", "Vision")}</span>}
        {item.speechEvidence && <div className="mt-1 max-w-[160px] truncate text-[11px] text-stone-400" title={item.speechEvidence}>「{item.speechEvidence}」</div>}
      </td>
      <td className="p-2 sm:p-3 text-right">{editable && <button onClick={remove} className="text-xs text-stone-400 hover:text-red-600">{t("不賣", "Remove")}</button>}</td>
    </tr>
  );
}
