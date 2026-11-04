"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { fmtPrice, SHOT_LABEL_EN } from "@/lib/i18n";
import type { Showcase } from "@/lib/showcase";

const SHOT_ZH: Record<string, string> = { front: "正面", threeQuarter: "45°", side: "側面", lifestyle: "情境" };

/** 真實成果：影片截圖 ↔ Muse Image 棚拍圖的拖拉對照、四個角度、每件一支直式短片 */
export function ShowcasePanel({ show }: { show: Showcase }) {
  const en = useLang() === "en";
  const [sel, setSel] = useState(0);
  const [cut, setCut] = useState(50);
  const [shotIdx, setShotIdx] = useState(0);
  const it = show.items[sel];
  const shots = it.shots;
  const after = shots[shotIdx]?.url ?? shots[0]?.url;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div>
        <div className="flex flex-wrap gap-2" role="tablist">
          {show.items.map((x, i) => (
            <button key={x.code} role="tab" aria-selected={i === sel} onClick={() => { setSel(i); setShotIdx(0); setCut(50); }} className={`rounded-full border-[2.5px] border-[var(--ink)] px-3 py-1.5 text-sm font-bold transition ${i === sel ? "bg-[var(--ink)] text-white" : "bg-white hover:bg-[var(--yellow)]"}`}>
              <span className="font-mono">{x.code}</span> · {x.title}
            </button>
          ))}
        </div>
        <div className="card relative mt-4 aspect-square select-none overflow-hidden sm:aspect-[4/3]">
          {after && <img src={after} alt={it.title} className="absolute inset-0 h-full w-full object-cover" />}
          {it.crop && (
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - cut}% 0 0)` }}>
              <img src={it.crop} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-y-0 w-[3px] bg-[var(--ink)]" style={{ left: `${cut}%` }}>
            <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-[var(--ink)] bg-[var(--yellow)] text-sm font-black">⇆</span>
          </div>
          <span className="absolute left-3 top-3 rounded-md border-2 border-[var(--ink)] bg-white px-2 py-0.5 text-xs font-black">{en ? "Video frame" : "影片截圖"}</span>
          <span className="absolute right-3 top-3 rounded-md border-2 border-[var(--ink)] bg-[var(--teal)] px-2 py-0.5 text-xs font-black">Muse Image</span>
          <input type="range" min={0} max={100} value={cut} onChange={(e) => setCut(Number(e.target.value))} aria-label={en ? "Compare before and after" : "拖拉比較前後"} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {shots.map((s, i) => (
            <button key={s.kind} onClick={() => setShotIdx(i)} className={`overflow-hidden rounded-lg border-[2.5px] border-[var(--ink)] transition ${i === shotIdx ? "shadow-[3px_3px_0_var(--ink)] ring-2 ring-[var(--accent)]" : "opacity-70 hover:opacity-100"}`}>
              <img src={s.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              <span className="block border-t-2 border-[var(--ink)] bg-white py-0.5 text-center text-[11px] font-bold">{en ? SHOT_LABEL_EN[s.kind] ?? s.kind : SHOT_ZH[s.kind] ?? s.kind}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <ReelPhone key={it.code} src={it.reel} poster={it.cover} />
        <div className="text-center">
          <p className="font-black">{it.title}{it.price != null && <span className="ml-2 rounded-md border-2 border-[var(--ink)] bg-[var(--yellow)] px-1.5 text-sm">{fmtPrice(it.price, show.currency)}</span>}</p>
          {it.speech && <p className="mt-1 text-xs text-stone-500">{en ? "Heard from the seller:" : "賣家原句："}「{it.speech}」</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/s/${show.code}`} className="btn btn-primary text-sm">{en ? "Open the shop page" : "打開可購買頁"}</Link>
          <Link href={`/jobs/${show.code}`} className="btn btn-ghost text-sm">{en ? "All outputs" : "看全部產出"}</Link>
        </div>
      </div>
    </div>
  );
}

function ReelPhone({ src, poster }: { src?: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setNear(true); el.play().catch(() => {}); } else el.pause();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className="relative w-[min(16rem,70vw)] rotate-2 rounded-[28px] border-[3px] border-[var(--ink)] bg-[var(--ink)] p-1.5 shadow-[8px_8px_0_var(--ink)] transition hover:rotate-0">
      <video ref={ref} src={near ? src : undefined} poster={poster} muted loop playsInline preload="none" className="aspect-[9/16] w-full rounded-[22px] bg-stone-800 object-cover" />
      <span className="absolute -left-4 top-6 -rotate-6 rounded-lg border-[2.5px] border-[var(--ink)] bg-[var(--pink)] px-2 py-0.5 text-xs font-black">9:16</span>
    </div>
  );
}
