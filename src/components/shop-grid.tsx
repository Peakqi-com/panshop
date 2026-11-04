"use client";

import { useMemo, useState } from "react";
import { Lightbox, type LightboxImage } from "./lightbox";
import { copyText } from "@/lib/copy-text";
import { useT, useLang } from "@/components/lang";
import { SHOT_LABEL_EN } from "@/lib/i18n";

export type ShopItem = {
  id: string; code: string; title: string; price: number | null; currency: string; category: string; description: string;
  color: string; material: string; hero: string | null; shots: { kind: string; label: string; url: string }[]; reelUrl: string | null; caption: string;
};

const KIND_LABEL: Record<string, string> = { front: "正面", threeQuarter: "四十五度", side: "側面", lifestyle: "情境" };
const ALL = "__all__";

/** 可購買頁：品類分頁、商品詳情（多圖、短片、描述）、留言下單與分享 */
export type ShopContact = { instagram: string; line: string; phone: string };

export function ShopGrid({ items, shopName, shopUrl, qrDataUrl, contact }: { items: ShopItem[]; shopName: string; shopUrl: string; qrDataUrl: string; contact: ShopContact }) {
  const cats = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);
  const t = useT();
  const [cat, setCat] = useState<string>(ALL);
  const [open, setOpen] = useState<ShopItem | null>(null);
  const [share, setShare] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1600); };
  const visible = cat === ALL ? items : items.filter((i) => i.category === cat);

  async function doShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try { await navigator.share({ title: shopName, url: shopUrl }); return; } catch { /* 使用者取消 */ }
    }
    setShare(true);
  }

  return (
    <>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto text-sm">
          {[ALL, ...cats].map((c) => <button key={c} onClick={() => setCat(c)} className={`whitespace-nowrap rounded-full px-3 py-1 ${cat === c ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200"}`}>{c === ALL ? t("全部", "All") : c}</button>)}
        </div>
        <button onClick={doShare} className="btn btn-ghost whitespace-nowrap px-3 py-1 text-xs">{t("分享", "Share")}</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {visible.map((it) => (
          <button key={it.id} id={it.code} onClick={() => setOpen(it)} className="card overflow-hidden text-left transition hover:shadow-md">
            <div className="aspect-square bg-white">{it.hero && <img src={it.hero} alt={it.title} className="h-full w-full object-contain" />}</div>
            <div className="p-2.5">
              <div className="font-mono text-[11px] text-stone-400">{it.code}</div>
              <h2 className="text-sm font-medium leading-tight">{it.title}</h2>
              <div className="mt-1 text-sm font-semibold">{it.price != null ? `${it.currency} ${it.price.toLocaleString()}` : t("私訊詢價", "Ask for price")}</div>
            </div>
          </button>
        ))}
      </div>

      {open && <Detail item={open} shopName={shopName} contact={contact} onClose={() => setOpen(null)} say={say} />}

      {share && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setShare(false)}>
          <div className="card w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{t("分享這間店", "Share this shop")}</h3>
            <img src={qrDataUrl} alt="QR code" className="mx-auto mt-3 h-44 w-44" />
            <p className="mt-2 break-all font-mono text-xs text-stone-500">{shopUrl}</p>
            <div className="mt-3 flex justify-center gap-2 text-sm">
              <button onClick={async () => say((await copyText(shopUrl)) ? t("已複製網址", "Link copied") : t("複製失敗", "Copy failed"))} className="btn btn-primary">{t("複製網址", "Copy link")}</button>
              <a href={qrDataUrl} download={`${shopName}-qr.png`} className="btn btn-ghost">{t("下載 QR", "Download QR")}</a>
              <button onClick={() => setShare(false)} className="btn btn-ghost">{t("關閉", "Close")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ item: it, shopName, contact, onClose, say }: { item: ShopItem; shopName: string; contact: ShopContact; onClose: () => void; say: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [lb, setLb] = useState<number | null>(null);
  const images: LightboxImage[] = it.shots.map((s) => ({ url: s.url, label: (lang === "en" ? SHOT_LABEL_EN[s.kind] : KIND_LABEL[s.kind]) ?? s.label, kind: s.kind }));
  if (!images.length && it.hero) images.push({ url: it.hero, label: it.title });
  const [idx, setIdx] = useState(0);
  const order = t(`我要 ${it.code} ${it.title}`, `I'd like ${it.code} ${it.title}`);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      {lb != null && <Lightbox images={images} index={lb} onClose={() => setLb(null)} />}
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--bg)] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-square bg-white">
          {images[idx] && <img src={images[idx].url} alt={it.title} onClick={() => setLb(idx)} className="h-full w-full cursor-zoom-in object-contain" />}
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">{t("關閉", "Close")}</button>
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {images.map((im, k) => <button key={im.url} onClick={() => setIdx(k)} className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ${k === idx ? "ring-orange-400" : "ring-transparent"}`}><img src={im.url} alt="" className="h-full w-full object-cover" /></button>)}
          </div>
        )}
        <div className="px-4 pb-6">
          <div className="flex items-baseline justify-between"><span className="font-mono text-xs text-stone-400">{it.code} · {it.category}</span><span className="text-lg font-semibold">{it.price != null ? `${it.currency} ${it.price.toLocaleString()}` : t("私訊詢價", "Ask for price")}</span></div>
          <h2 className="mt-1 text-xl font-semibold">{it.title}</h2>
          {(it.color || it.material) && <p className="mt-1 text-sm text-stone-500">{[it.color, it.material].filter(Boolean).join(" · ")}</p>}
          {it.description && <p className="mt-3 text-sm leading-relaxed text-stone-700">{it.description}</p>}
          {it.reelUrl && <video src={it.reelUrl} controls playsInline className="mt-4 aspect-[9/16] w-full rounded-xl bg-black" />}
          <OrderBar order={order} shopName={shopName} contact={contact} say={say} />
        </div>
      </div>
    </div>
  );
}

/** 下單：先複製「我要 代碼 品名」，再開賣家設定的管道；都沒設定就只複製 */
function OrderBar({ order, shopName, contact, say }: { order: string; shopName: string; contact: ShopContact; say: (m: string) => void }) {
  const t = useT();
  const text = t(`${shopName}：${order}`, `${shopName}: ${order}`);
  const links = [
    contact.instagram && { label: t("Instagram 私訊", "Instagram DM"), href: `https://ig.me/m/${encodeURIComponent(contact.instagram)}` },
    contact.line && { label: "LINE", href: `https://line.me/R/ti/p/${encodeURIComponent(contact.line.startsWith("@") ? contact.line : `@${contact.line}`)}` },
    contact.phone && { label: t("簡訊", "SMS"), href: `sms:${contact.phone.replace(/[\s-]/g, "")}?body=${encodeURIComponent(text)}` },
  ].filter(Boolean) as { label: string; href: string }[];
  async function go(href?: string) {
    const ok = await copyText(order);
    if (href) { say(ok ? t(`已複製「${order}」，貼上送出即可`, `Copied "${order}" — paste and send`) : t("請手動輸入商品代碼", "Please type the item code")); window.open(href, "_blank", "noopener"); }
    else say(ok ? t(`已複製「${order}」，貼到賣家貼文留言即可`, `Copied "${order}" — paste it as a comment on the seller's post`) : t("複製失敗", "Copy failed"));
  }
  return (
    <div className="sticky bottom-0 mt-4 bg-[var(--bg)] py-3">
      {links.length ? (
        <div className="flex flex-wrap gap-2">
          {links.map((l, i) => <button key={l.label} onClick={() => go(l.href)} className={`btn flex-1 py-3 ${i === 0 ? "btn-primary" : "btn-ghost"}`}>{i === 0 ? t(`下單：${l.label}`, `Order via ${l.label}`) : l.label}</button>)}
        </div>
      ) : (
        <button onClick={() => go()} className="btn btn-primary w-full py-3">{t("複製下單文字", "Copy order message")}</button>
      )}
      <p className="mt-2 text-center text-xs text-stone-500">{t(`會先複製「${order}」，送出就完成下單。`, `We copy "${order}" for you — send it to place the order.`)}</p>
    </div>
  );
}
