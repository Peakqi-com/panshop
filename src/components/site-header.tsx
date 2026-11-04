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
    <header className="sticky top-0 z-30 border-b-[3px] border-[var(--ink)] bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
          <span aria-hidden className="inline-block h-7 w-7 rounded-lg border-[2.5px] border-[var(--ink)] bg-[var(--accent)] shadow-[2px_2px_0_var(--ink)]" />
          PanShop
        </Link>
        <nav className="flex items-center gap-2 text-sm font-bold sm:gap-4">
          <LangToggle />
          <Link href="/jobs" className="rounded-full border-[2.5px] border-transparent px-2 py-1 hover:border-[var(--ink)] hover:bg-[var(--yellow)]">{t("我的掃描", "My scans")}</Link>
          <Link href="/new" className="btn btn-primary px-3 py-1.5 text-sm">{t("新掃描", "New scan")}</Link>
        </nav>
      </div>
    </header>
  );
}
