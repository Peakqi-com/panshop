import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { LoginForm } from "./forms";

export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "總覽"],
  ["/admin/jobs", "掃描工作"],
  ["/admin/comments", "留言紀錄"],
  ["/admin/settings", "設定與金鑰"],
  ["/admin/health", "健康檢查"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-bold">PanShop 後台</h1>
        <p className="mt-2 text-sm text-stone-500">輸入管理員通行碼。</p>
        <LoginForm />
      </main>
    );
  }
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[200px_1fr]">
      <aside>
        <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-stone-400">後台</div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-white hover:shadow-sm">{label}</Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
