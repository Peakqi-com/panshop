"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, makeT, type Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("zh");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
export function useT() {
  const lang = useContext(Ctx);
  return useMemo(() => makeT(lang), [lang]);
}

function persistLang(l: Lang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute("lang", l === "en" ? "en" : "zh-Hant-TW");
}

/** 中／EN 切換：寫 cookie 後重新整理伺服器元件 */
export function LangToggle({ className = "" }: { className?: string }) {
  const lang = useLang();
  const router = useRouter();
  const set = (l: Lang) => {
    persistLang(l);
    router.refresh();
  };
  return (
    <div className={`inline-flex overflow-hidden rounded-full border border-stone-300 text-xs ${className}`} role="group" aria-label="Language">
      {(["zh", "en"] as const).map((l) => (
        <button key={l} type="button" onClick={() => set(l)} aria-pressed={lang === l}
          className={`px-2.5 py-1 ${lang === l ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}>
          {l === "zh" ? "中" : "EN"}
        </button>
      ))}
    </div>
  );
}
