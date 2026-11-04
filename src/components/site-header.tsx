"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 賣家用的頂部導覽；買家看的可購買頁不顯示 */
export function SiteHeader() {
  const path = usePathname();
  if (path?.startsWith("/s/")) return null;
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-orange-500 to-amber-400" />
          PanShop
        </Link>
        <nav className="flex items-center gap-5 text-sm text-stone-600">
          <Link href="/jobs" className="hover:text-stone-900">我的掃描</Link>
          <Link href="/" className="rounded-full bg-stone-900 px-3 py-1.5 text-white hover:bg-stone-700">新掃描</Link>
        </nav>
      </div>
    </header>
  );
}
