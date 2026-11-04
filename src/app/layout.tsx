import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
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
        <SiteHeader />
        {children}
        <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-stone-400">
          PanShop · Built with SAM 3.1, Muse Spark, Muse Voice Transcribe, Muse Image and Muse Spark Open · PEAKQI, Taipei
        </footer>
      </body>
    </html>
  );
}
