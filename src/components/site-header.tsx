"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangToggle, useT } from "@/components/lang";

/** 賣家用的頂部導覽；買家看的可購買頁不顯示 */
export function SiteHeader() {
  const path = usePathname();
  const t = useT();
  if (path?.startsWith("/s/")) return null;
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-orange-500 to-amber-400" />
          PanShop
        </Link>
        <nav className="flex items-center gap-3 text-sm text-stone-600 sm:gap-5">
          <LangToggle />
          <Link href="/jobs" className="hover:text-stone-900">{t("我的掃描", "My scans")}</Link>
          <Link href="/" className="rounded-full bg-stone-900 px-3 py-1.5 text-white hover:bg-stone-700">{t("新掃描", "New scan")}</Link>
        </nav>
      </div>
    </header>
  );
}
