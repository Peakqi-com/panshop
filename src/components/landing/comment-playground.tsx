"use client";

import { useMemo, useState } from "react";
import { useLang } from "@/components/lang";
import { fmtPrice } from "@/lib/i18n";
import { parseOrderComment } from "@/lib/order-parse";
import type { ShowItem } from "@/lib/showcase";

/** 留言試玩：用 repo 裡同一支規則解析器，邊打邊算訂單表 */
export function CommentPlayground({ items, currency }: { items: ShowItem[]; currency: string }) {
  const en = useLang() === "en";
  const codes = items.map((i) => i.code);
  const [c0, c1, c2] = [codes[0] ?? "A1", codes[1] ?? codes[0] ?? "B1", codes[2] ?? codes[0] ?? "C1"];
  const [text, setText] = useState(en ? `${c0}+1\nAmy: ${c1} x2 ${c2}+1\n+2 ${c0}\nHow much is ${c2}?` : `${c0}+1\n小美：${c1} x2 ${c2}+1\n+2 ${c0}\n${c2} 還有別的顏色嗎？`);
  const rows = useMemo(() => text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ line: l, ...parseOrderComment(l, codes) })), [text, codes]);
  const sheet = useMemo(() => {
    const m = new Map<string, { buyer: string; code: string; qty: number }>();
    rows.forEach((r, i) => r.lines.forEach((l) => {
      const buyer = r.buyer ?? (en ? `Viewer ${i + 1}` : `觀眾 ${i + 1}`);
      const k = `${buyer}|${l.code}`;
      const prev = m.get(k);
      m.set(k, { buyer, code: l.code, qty: (prev?.qty ?? 0) + l.qty });
    }));
    return [...m.values()].map((o) => {
      const it = items.find((i) => i.code === o.code);
      return { ...o, title: it?.title ?? o.code, sub: (it?.price ?? 0) * o.qty };
    });
  }, [rows, items, en]);
  const total = sheet.reduce((s, o) => s + o.sub, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-4">
        <label htmlFor="pg" className="font-mono text-xs font-black uppercase tracking-wider">{en ? "Live comments — type your own" : "直播留言（可以自己打）"}</label>
        <textarea id="pg" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="input mt-2 w-full resize-y font-mono text-sm" />
        <ul className="mt-3 space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-xl border-2 border-[var(--ink)] bg-white px-2 py-0.5 font-bold">{r.line}</span>
              {r.lines.length > 0
                ? <span className="rounded-md border-2 border-[var(--ink)] bg-[var(--teal)] px-1.5 text-xs font-black">{r.lines.map((l) => `${l.code}×${l.qty}`).join(" ")}</span>
                : <span className="rounded-md border-2 border-[var(--ink)] bg-[var(--yellow)] px-1.5 text-xs font-black">{en ? "→ Muse Spark Open" : "→ 交給 Muse Spark Open"}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-500">{en ? `Codes on this demo: ${codes.join(", ")}. Order codes are parsed by rules with no model call; questions go to the model.` : `這個範例的代碼：${codes.join("、")}。下單代碼用規則解析，不花模型額度；問題才交給模型。`}</p>
      </div>
      <div className="card p-4">
        <p className="font-mono text-xs font-black uppercase tracking-wider">{en ? "Order sheet" : "訂單表"}</p>
        <div className="mt-2 overflow-hidden rounded-lg border-2 border-[var(--ink)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--yellow)] text-left"><tr><th className="px-2 py-1.5">{en ? "Buyer" : "買家"}</th><th className="px-2 py-1.5">{en ? "Item" : "商品"}</th><th className="px-2 py-1.5 text-right">{en ? "Qty" : "數量"}</th><th className="px-2 py-1.5 text-right">{en ? "Subtotal" : "小計"}</th></tr></thead>
            <tbody>
              {sheet.map((o) => (
                <tr key={`${o.buyer}${o.code}`} className="border-t-2 border-[var(--ink)]/15">
                  <td className="whitespace-nowrap px-2 py-1.5 font-bold">{o.buyer}</td>
                  <td className="px-2 py-1.5"><span className="font-mono font-black">{o.code}</span> <span className="text-stone-600">{o.title}</span></td>
                  <td className="px-2 py-1.5 text-right">{o.qty}</td>
                  <td className="px-2 py-1.5 text-right font-bold">{fmtPrice(o.sub, currency)}</td>
                </tr>
              ))}
              {sheet.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-stone-400">{en ? "Type a comment like A1+1" : "打一則像「A1+1」的留言"}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-baseline justify-between"><span className="font-black">{en ? "Total" : "合計"}</span><span className="text-3xl font-black">{fmtPrice(total, currency)}</span></p>
      </div>
    </div>
  );
}
