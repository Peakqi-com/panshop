/**
 * 公開試用的保護：全站每天花費上限。
 * 管理員不受限。IP 只存雜湊，不存原值。
 */
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { jobs } from "@/repositories/jobs";
import { settings } from "@/repositories/settings";
import { isAdmin } from "@/lib/auth";
import { makeT, type Lang } from "@/lib/i18n";

const DAY = 86400_000;

export async function clientIpHash() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const salt = process.env.SECRETS_MASTER_KEY ?? "panshop";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** 回傳 null 代表放行；否則回傳要給使用者看的訊息與狀態碼 */
export async function checkTrial(lang: Lang): Promise<{ error: string; status: number } | null> {
  if (await isAdmin()) return null;
  const t = makeT(lang);
  const cfg = await settings.get();
  const since = new Date(Date.now() - DAY);
  if (cfg.dailyBudgetUsd > 0 && (await jobs.costSince(since)) >= cfg.dailyBudgetUsd) {
    return { error: t("今天的公開試用額度已用完，請明天再試。", "Today's open-trial budget is used up. Please try again tomorrow."), status: 503 };
  }
  return null;
}
