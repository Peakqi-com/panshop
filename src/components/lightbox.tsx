"use client";

import { useCallback, useEffect, useState } from "react";

export type LightboxImage = { url: string; label: string; kind?: string };

/** 全畫面看圖：左右切換、下載、可選「設為主圖」 */
export function Lightbox({ images, index, onClose, onSetHero, heroUrl }: { images: LightboxImage[]; index: number; onClose: () => void; onSetHero?: (url: string) => void; heroUrl?: string }) {
  const [i, setI] = useState(index);
  const img = images[i];
  const prev = useCallback(() => setI((x) => (x - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setI((x) => (x + 1) % images.length), [images.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") prev(); if (e.key === "ArrowRight") next(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose, prev, next]);
  if (!img) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <span>{img.label} <span className="text-white/50">{i + 1}／{images.length}</span></span>
        <div className="flex items-center gap-3">
          {onSetHero && (heroUrl === img.url ? <span className="rounded-full bg-orange-500 px-2.5 py-1 text-xs">主圖</span> : <button onClick={() => onSetHero(img.url)} className="rounded-full bg-white/15 px-2.5 py-1 text-xs hover:bg-white/25">設為主圖</button>)}
          <a href={img.url} download target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-2.5 py-1 text-xs hover:bg-white/25">下載</a>
          <button onClick={onClose} className="rounded-full bg-white/15 px-2.5 py-1 text-xs hover:bg-white/25">關閉</button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-12" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-xl hover:bg-white/25">‹</button>}
        <img src={img.url} alt={img.label} className="max-h-[80vh] max-w-full rounded-lg bg-white object-contain" />
        {images.length > 1 && <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-xl hover:bg-white/25">›</button>}
      </div>
      <div className="flex justify-center gap-2 px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {images.map((im, k) => <button key={im.url + k} onClick={() => setI(k)} className={`h-12 w-12 overflow-hidden rounded ${k === i ? "ring-2 ring-orange-400" : "opacity-60 hover:opacity-100"}`}><img src={im.url} alt="" className="h-full w-full object-cover" /></button>)}
      </div>
    </div>
  );
}
