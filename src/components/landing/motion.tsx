"use client";

import { useEffect, useRef, useState } from "react";

/** 進入畫面才淡入上浮；精簡動態時直接顯示（見 globals.css .reveal） */
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${on ? "reveal-on" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

/** 數字往上跳：int 整數、sec 秒數顯示成「2m 26s」、usd 兩位小數 */
export function CountUp({ to, kind = "int", lang }: { to: number; kind?: "int" | "sec" | "usd"; lang: "zh" | "en" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min((t - t0) / 1200, 1);
        setV(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      setV(0);
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  const n = Math.round(v);
  const mm = Math.floor(n / 60), ss = String(n % 60).padStart(2, "0");
  const s = kind === "usd" ? `$${v.toFixed(2)}` : kind === "sec" ? (lang === "en" ? `${mm}m ${ss}s` : `${mm} 分 ${ss} 秒`) : String(n);
  return <span ref={ref} className="tabular-nums">{s}</span>;
}
