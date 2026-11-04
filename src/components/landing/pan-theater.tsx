"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { fmtPrice } from "@/lib/i18n";
import { parseOrderComment } from "@/lib/order-parse";
import type { Showcase } from "@/lib/showcase";

/**
 * 首頁主視覺：五幕捲動劇場。捲動只產生一個進度 p ∈ [0, 5)，整數是幕、小數是幕內進度。
 *   0 掃一圈：手機從左掃到右
 *   1 SAM 3.1：每件長出描邊與追蹤編號，離開又回來的那件先算成第 4 件再併回
 *   2 聽價格：賣家原句逐字出現，價格牌與下單代碼貼上去
 *   3 產出：商品排成目錄、換成 Muse Image 棚拍圖，短片手機滑進來
 *   4 留言：「A1+1」等留言用真正的規則解析器算成訂單表
 * 商品圖、口述原句、價格都來自正式站一筆真實掃描。
 */

const N = 5;
type Ch = { en: string; title: [string, string]; lead: string };

const SLOTS = [
  { x: 18, y: 58 },
  { x: 50, y: 52 },
  { x: 82, y: 58 },
];
const GRID = [
  { x: 18, y: 40 },
  { x: 43, y: 40 },
  { x: 68, y: 40 },
];
const TONES = ["var(--pink)", "var(--teal)", "var(--purple)"];

export function PanTheater({ show }: { show: Showcase | null }) {
  const lang = useLang();
  const en = lang === "en";
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = el.offsetHeight - window.innerHeight;
      const v = span > 0 ? Math.min(Math.max(-r.top / span, 0), 0.9999) * N : 0;
      setP((old) => (Math.abs(old - v) > 0.002 ? v : old));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);

  const ch = Math.min(Math.floor(p), N - 1);
  const local = p - ch;

  const chapters: Ch[] = en
    ? [
        { en: "01 · PAN", title: ["Pan your phone across your products.", "Your shop is ready."], lead: "For live-stream and group-buy sellers. One slow pan, a stack of photos or a live replay is all it takes." },
        { en: "02 · SEE · SAM 3.1", title: ["Every item, found", "and counted once."], lead: "SAM 3.1 segments and tracks each product across frames. An item that leaves and comes back is merged, not counted twice." },
        { en: "03 · LISTEN · MUSE VOICE", title: ["Say the price.", "It's on the tag."], lead: "Muse Voice Transcribe hears what you say about each item; Muse Spark matches it to the right product and gives it an order code." },
        { en: "04 · MAKE · MUSE IMAGE", title: ["Photos, catalog, videos.", "All at once."], lead: "Studio angles from Muse Image, a Meta catalog CSV, a shoppable page and a 9:16 video for every item." },
        { en: "05 · SELL · COMMENTS", title: ["Shoppers type “A1+1”.", "That's an order."], lead: "Paste the comment thread: order codes become an order sheet with subtotals. Questions go to Muse Spark Open." },
      ]
    : [
        { en: "01 · PAN", title: ["對著商品慢慢掃一圈，", "你的店就開好了。"], lead: "直播、團購賣家的開播前後台。掃一段影片、丟一疊照片，或上傳直播回放就好。" },
        { en: "02 · SEE · SAM 3.1", title: ["每一件都認得，", "而且只算一次。"], lead: "SAM 3.1 逐格切出、跨畫面追蹤每件商品；離開鏡頭又回來的那件會被併回去，不會變成兩件。" },
        { en: "03 · LISTEN · MUSE VOICE", title: ["你說價格，", "它就貼上價格牌。"], lead: "Muse Voice Transcribe 聽你介紹每一件，Muse Spark 對到正確的商品，順便編好下單代碼。" },
        { en: "04 · MAKE · MUSE IMAGE", title: ["商品圖、目錄、短片，", "一次到位。"], lead: "Muse Image 多角度棚拍圖、Meta 商品目錄 CSV、可購買頁，每件再配一支直式短片。" },
        { en: "05 · SELL · COMMENTS", title: ["觀眾留言「A1+1」，", "就是一筆訂單。"], lead: "把留言串貼進來，下單代碼自動整理成訂單表與小計；問價格的留言交給 Muse Spark Open。" },
      ];

  const its = (show?.items ?? []).slice(0, 3);
  const cur = show?.currency ?? "TWD";
  const comments = useMemo(
    () => (en ? ["A1+1", "Amy: B1 x2", "+1 C1", "How much is A1?"] : ["A1+1", "小美：B1 x2", "+1 C1", "A1 多少？"]),
    [en],
  );
  const codes = its.map((i) => i.code);
  const shownComments = ch === 4 ? Math.min(comments.length, Math.floor(local * (comments.length + 1.5))) : 0;
  const order = useMemo(() => {
    const m = new Map<string, number>();
    comments.slice(0, shownComments).forEach((c) => parseOrderComment(c, codes).lines.forEach((l) => m.set(l.code, (m.get(l.code) ?? 0) + l.qty)));
    return [...m.entries()].map(([code, qty]) => {
      const it = its.find((i) => i.code === code);
      return { code, qty, title: it?.title ?? code, sub: (it?.price ?? 0) * qty };
    });
  }, [comments, shownComments, codes, its]);
  const total = order.reduce((s, o) => s + o.sub, 0);

  const speech = its[0]?.speech ?? "";
  const typed = ch === 2 ? speech.slice(0, Math.ceil(speech.length * Math.min(local * 1.6, 1))) : ch > 2 ? speech : "";
  const phoneX = ch === 0 ? 4 + local * 70 : ch > 0 ? 74 : 4;

  return (
    <section ref={ref} className="relative" style={{ height: `${N * 90 + 100}vh` }} aria-label={en ? "How PanShop works" : "PanShop 怎麼運作"}>
      <div className="sticky top-16 flex h-[calc(100svh-4rem)] flex-col-reverse justify-end gap-4 overflow-hidden px-4 pb-4 pt-4 lg:mx-auto lg:max-w-6xl lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:pt-0">
        {/* 左：章節文字 */}
        <div className="relative min-h-[18.5rem] lg:min-h-[24rem] lg:w-[44%]">
          {chapters.map((c, i) => (
            <div key={i} className="absolute inset-0 transition-all duration-500 ease-out" style={{ opacity: i === ch ? 1 : 0, transform: `translateY(${i === ch ? 0 : i < ch ? -18 : 18}px)`, pointerEvents: i === ch ? "auto" : "none" }} aria-hidden={i !== ch}>
              <p className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
                <span className="h-3 w-3 rounded-full border-2 border-[var(--ink)]" style={{ background: ["var(--accent)", "var(--teal)", "var(--yellow)", "var(--purple)", "var(--pink)"][i] }} />{c.en}
              </p>
              <h1 className={`mt-3 font-black leading-[1.18] tracking-tight ${en ? "text-[clamp(1.5rem,6.6vw,2.6rem)] lg:text-[2.6rem]" : "text-[clamp(1.45rem,7.4vw,2.75rem)] lg:text-[2.75rem]"}`}>
                <span className={en ? "block" : "block whitespace-nowrap"}>{c.title[0]}</span>
                <span className={`mark mt-2 ${en ? "" : "whitespace-nowrap"}`} style={{ background: ["var(--yellow)", "var(--teal)", "var(--pink)", "var(--yellow)", "var(--teal)"][i] }}>{c.title[1]}</span>
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-stone-700 lg:text-base">{c.lead}</p>
              {i === 0 && (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/new" className="btn btn-primary px-5 py-2.5">{en ? "Try it free" : "免費試用"}</Link>
                  <a href="#showcase" className="btn btn-ghost px-5 py-2.5">{en ? "See real results" : "看真實成果"}</a>
                </div>
              )}
            </div>
          ))}
          <div className="absolute -bottom-1 left-0 flex items-center gap-2 lg:bottom-0">
            {chapters.map((_, i) => (
              <span key={i} className="h-2.5 rounded-full border-2 border-[var(--ink)] transition-all duration-300" style={{ width: i === ch ? 34 : 12, background: i <= ch ? "var(--ink)" : "white" }} />
            ))}
            <span className="ml-1 font-mono text-[11px] font-bold">{String(ch + 1).padStart(2, "0")} / 0{N}</span>
            {ch === 0 && local < 0.15 && <span className="ml-2 animate-bounce font-mono text-[11px] font-bold">↓ {en ? "scroll" : "往下捲"}</span>}
          </div>
        </div>

        {/* 右：舞台 */}
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-[18px] border-[3px] border-[var(--ink)] bg-white shadow-[8px_8px_0_var(--ink)] lg:w-[54%]" style={{ backgroundImage: "radial-gradient(rgba(17,17,17,.13) 1.3px, transparent 1.3px)", backgroundSize: "18px 18px" }}>
          {/* 裝飾幾何 */}
          <span aria-hidden className="ps-float absolute bottom-[38%] left-[2%] h-8 w-8 rounded-full border-[3px] border-[var(--ink)] bg-[var(--pink)]" />
          <span aria-hidden className="ps-float-2 absolute right-[7%] top-[10%] h-0 w-0 border-x-[16px] border-b-[28px] border-x-transparent border-b-[var(--teal)] drop-shadow-[2px_2px_0_var(--ink)]" />
          <svg aria-hidden className="ps-float absolute bottom-[6%] right-[5%] w-16" viewBox="0 0 64 16"><path d="M2 8 Q10 0 18 8 T34 8 T50 8 T64 8" fill="none" stroke="var(--purple)" strokeWidth="4" strokeLinecap="round" /></svg>

          {/* 桌面 */}
          <div className="absolute inset-x-[4%] bottom-[8%] h-[26%] rounded-[14px] border-[3px] border-[var(--ink)] bg-[var(--yellow)] transition-opacity duration-500" style={{ opacity: ch >= 3 ? 0 : 1 }} />

          {/* 計數器 */}
          <div className="absolute left-[4%] top-[5%] z-20 rounded-full border-[2.5px] border-[var(--ink)] bg-white px-3 py-1 font-mono text-xs font-black shadow-[2px_2px_0_var(--ink)] transition-opacity duration-300" style={{ opacity: ch >= 1 && ch <= 2 ? 1 : 0 }}>
            {ch === 1 && local < 0.55 ? (en ? "4 tracks" : "4 條軌跡") : en ? `${its.length} items` : `${its.length} 件商品`}
            {ch === 1 && local >= 0.55 && <span className="ml-1 text-[var(--purple)]">{en ? "· merged" : "· 已合併"}</span>}
          </div>

          {/* 商品 */}
          {its.map((it, i) => {
            const grid = ch >= 3;
            const pos = grid ? GRID[i] : SLOTS[i];
            const shot = it.shots.find((s) => s.kind === "front")?.url;
            const w = grid ? 22 : 25;
            const hidden = ch === 4 && i > 2;
            return (
              <div key={it.code} className="absolute z-10 transition-all duration-700 ease-[cubic-bezier(.2,.9,.25,1.15)]" style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${w}%`, transform: `translate(-50%,-50%) ${ch === 4 ? "scale(.82) translateY(-14%)" : ""}`, opacity: hidden ? 0 : 1 }}>
                <div className={`relative aspect-square ${grid ? "rounded-xl border-[2.5px] border-[var(--ink)] bg-white shadow-[4px_4px_0_var(--ink)]" : ""}`}>
                  {it.cutout && <img src={it.cutout} alt="" className="absolute inset-0 h-full w-full object-contain p-[6%] transition-opacity duration-500" style={{ opacity: grid && shot ? 0 : 1, filter: grid ? "none" : "drop-shadow(3px 4px 0 rgba(17,17,17,.25))" }} />}
                  {shot && <img src={shot} alt="" loading="lazy" className="absolute inset-0 h-full w-full rounded-[9px] object-cover transition-opacity duration-500" style={{ opacity: grid ? 1 : 0 }} />}
                  {/* SAM 描邊 */}
                  <div className="pointer-events-none absolute -inset-[6%] rounded-2xl border-[3px] border-dashed transition-all duration-300" style={{ borderColor: TONES[i], opacity: ch === 1 || ch === 2 ? 1 : 0, transform: ch === 1 ? "scale(1)" : "scale(.94)" }} />
                  <span className="absolute -top-[16%] left-0 rounded-md border-2 border-[var(--ink)] px-1.5 font-mono text-[10px] font-black text-white transition-opacity duration-300" style={{ background: TONES[i], opacity: ch === 1 ? 1 : 0 }}>#{i + 1}</span>
                  {/* 代碼與價格牌 */}
                  <span className="absolute -left-[8%] -top-[12%] grid h-8 min-w-8 place-items-center rounded-full border-[2.5px] border-[var(--ink)] bg-[var(--yellow)] px-1 text-xs font-black shadow-[2px_2px_0_var(--ink)] transition-all duration-300" style={{ opacity: ch >= 2 && (ch > 2 || local > 0.35 + i * 0.12) ? 1 : 0, transform: `scale(${ch >= 2 ? 1 : 0.4}) rotate(-8deg)` }}>{it.code}</span>
                  {it.price != null && (
                    <span className="absolute -bottom-[10%] -right-[10%] rounded-lg border-[2.5px] border-[var(--ink)] bg-white px-1.5 py-0.5 text-[11px] font-black shadow-[2px_2px_0_var(--ink)] transition-all duration-300 sm:text-xs" style={{ opacity: ch >= 2 && (ch > 2 || local > 0.55 + i * 0.12) ? 1 : 0, transform: `rotate(6deg) scale(${ch >= 2 ? 1 : 0.4})` }}>{fmtPrice(it.price, cur)}</span>
                  )}
                </div>
                {grid && <p className="mt-2 truncate text-center text-[10px] font-bold sm:text-xs">{it.title}</p>}
              </div>
            );
          })}

          {/* 離開又回來的那件：第 4 條軌跡，併回 C */}
          {its[2]?.cutout && (
            <div className="absolute z-10 w-[18%] transition-all duration-500" style={{ left: ch === 1 && local >= 0.55 ? `${SLOTS[2].x}%` : "93%", top: "30%", transform: "translate(-50%,-50%)", opacity: ch === 1 ? (local < 0.55 ? 0.9 : 0) : 0 }}>
              <img src={its[2].cutout} alt="" className="aspect-square w-full object-contain opacity-60" />
              <div className="absolute -inset-[6%] rounded-2xl border-[3px] border-dashed border-[var(--accent)]" />
              <span className="absolute -top-[18%] left-0 rounded-md border-2 border-[var(--ink)] bg-[var(--accent)] px-1.5 font-mono text-[10px] font-black">#4?</span>
            </div>
          )}

          {/* 掃描中的手機 */}
          <div className="absolute top-[14%] z-20 h-[72%] w-[24%] rounded-[16px] border-[3px] border-[var(--ink)] bg-white/10 shadow-[4px_4px_0_var(--ink)] transition-opacity duration-300" style={{ left: `${phoneX}%`, opacity: ch === 0 ? 1 : 0 }}>
            <div className="absolute inset-[7%] rounded-[8px] border-2 border-dashed border-[var(--ink)]/60" />
            <div className="ps-scan absolute inset-x-[7%] h-[3px] bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
            <span className="absolute left-1/2 top-[3%] h-1.5 w-8 -translate-x-1/2 rounded-full bg-[var(--ink)]" />
            <span className="absolute bottom-[4%] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[var(--ink)] px-2 py-0.5 text-[9px] font-bold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />REC</span>
          </div>

          {/* 口述泡泡 */}
          <div className="absolute left-[4%] right-[4%] top-[5%] z-20 rounded-2xl border-[2.5px] border-[var(--ink)] bg-white px-3 py-2 shadow-[3px_3px_0_var(--ink)] transition-all duration-300 sm:right-[18%]" style={{ opacity: ch === 2 ? 1 : 0, transform: `translateY(${ch === 2 ? 0 : -10}px)` }}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 items-end gap-[2px]" aria-hidden>{[5, 9, 14, 8, 12, 6, 10].map((h, k) => <span key={k} className="ps-wave w-[3px] rounded bg-[var(--purple)]" style={{ height: h, animationDelay: `${k * 90}ms` }} />)}</span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-500">Muse Voice Transcribe</span>
            </div>
            <p className="mt-1 min-h-[1.4em] text-sm font-bold">「{typed}<span className="animate-pulse">▍</span>」</p>
          </div>

          {/* 產出：CSV 與短片手機 */}
          <div className="absolute bottom-[8%] left-[6%] z-20 flex gap-2 transition-all duration-500" style={{ opacity: ch === 3 ? 1 : 0, transform: `translateY(${ch === 3 ? 0 : 16}px)` }}>
            <span className="rounded-lg border-[2.5px] border-[var(--ink)] bg-[var(--teal)] px-2 py-1 font-mono text-[10px] font-black shadow-[2px_2px_0_var(--ink)] sm:text-xs">catalog.csv ✓</span>
            <span className="rounded-lg border-[2.5px] border-[var(--ink)] bg-white px-2 py-1 font-mono text-[10px] font-black shadow-[2px_2px_0_var(--ink)] sm:text-xs">/s/{show?.code ?? "shop"} ✓</span>
          </div>
          {its[0]?.cover && (
            <div className="absolute top-[8%] z-20 w-[17%] rounded-[14px] border-[3px] border-[var(--ink)] bg-[var(--ink)] p-[3px] shadow-[4px_4px_0_var(--ink)] transition-all duration-700 ease-[cubic-bezier(.2,.9,.25,1.15)]" style={{ right: ch === 3 ? "4%" : "-25%", transform: "rotate(5deg)" }}>
              <img src={its[0].cover} alt="" loading="lazy" className="aspect-[9/16] w-full rounded-[10px] object-cover" />
              <span className="absolute -left-3 bottom-[12%] rounded-md border-2 border-[var(--ink)] bg-[var(--pink)] px-1.5 text-[10px] font-black">9:16 ▶</span>
            </div>
          )}

          {/* 留言與訂單表 */}
          <div className="absolute bottom-[5%] left-[4%] z-20 flex w-[44%] flex-col gap-1.5 transition-opacity duration-300" style={{ opacity: ch === 4 ? 1 : 0 }}>
            {comments.map((c, k) => {
              const parsed = parseOrderComment(c, codes).lines.length > 0;
              return (
                <div key={c} className="flex items-center gap-1.5 transition-all duration-300" style={{ opacity: k < shownComments ? 1 : 0, transform: `translateX(${k < shownComments ? 0 : -16}px)` }}>
                  <span className="h-5 w-5 shrink-0 rounded-full border-2 border-[var(--ink)]" style={{ background: TONES[k % 3] }} />
                  <span className="truncate rounded-xl border-2 border-[var(--ink)] bg-white px-2 py-0.5 text-[11px] font-bold sm:text-xs">{c}</span>
                  {!parsed && <span className="shrink-0 rounded border border-[var(--ink)] bg-[var(--yellow)] px-1 text-[9px] font-bold">Spark Open</span>}
                </div>
              );
            })}
          </div>
          <div className="absolute bottom-[5%] right-[4%] z-20 w-[46%] rounded-xl border-[2.5px] border-[var(--ink)] bg-white p-2 shadow-[4px_4px_0_var(--ink)] transition-all duration-500" style={{ opacity: ch === 4 ? 1 : 0, transform: `translateY(${ch === 4 ? 0 : 20}px)` }}>
            <p className="font-mono text-[10px] font-black uppercase tracking-wider">{en ? "Order sheet" : "訂單表"}</p>
            <ul className="mt-1 space-y-0.5 text-[10px] sm:text-xs">
              {order.map((o) => <li key={o.code} className="flex justify-between gap-2"><span className="truncate"><b>{o.code}</b> ×{o.qty}</span><span className="font-bold">{fmtPrice(o.sub, cur)}</span></li>)}
              {order.length === 0 && <li className="text-stone-400">…</li>}
            </ul>
            <p className="mt-1 flex justify-between border-t-2 border-[var(--ink)] pt-1 text-xs font-black sm:text-sm"><span>{en ? "Total" : "合計"}</span><span>{fmtPrice(total, cur)}</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
