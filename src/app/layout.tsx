import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const noto = Noto_Sans_TC({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-noto" });

export const metadata: Metadata = {
  title: { default: "PanShop", template: "%s · PanShop" },
  description: "掃一圈，就開賣。Pan your phone across your products. Your shop is ready.",
};
export const viewport: Viewport = { themeColor: "#f5f2ec", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className={noto.variable}>
      <body className="min-h-dvh bg-[var(--bg)] text-[var(--fg)] antialiased">
        <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[var(--bg)]/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-orange-500 to-amber-400" />
              PanShop
            </Link>
            <nav className="flex items-center gap-5 text-sm text-stone-600">
              <Link href="/jobs" className="hover:text-stone-900">我的掃描</Link>
              <Link href="/" className="rounded-full bg-stone-900 px-3 py-1.5 text-white hover:bg-stone-700">新掃描</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-stone-400">
          PanShop · Built with SAM 3.1, Muse Spark, Muse Voice Transcribe, Muse Image and Muse Spark Open · PEAKQI, Taipei
        </footer>
      </body>
    </html>
  );
}
