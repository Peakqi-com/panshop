import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 黑客松版不做帳號：
 * - /admin 用 ADMIN_PASSCODE，通過後發一個 HMAC cookie
 * - 上傳頁用 UPLOAD_PASSCODE（空白＝不限制）
 * - 管線 stage 自我呼叫用 WORKER_SECRET header
 */
const COOKIE = "panshop_admin";

function sig(v: string) {
  const key = process.env.SECRETS_MASTER_KEY ?? process.env.ADMIN_PASSCODE ?? "dev";
  return createHmac("sha256", key).update(v).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function isAdmin(): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && safeEqual(c, sig("admin"));
}

export async function grantAdmin() {
  (await cookies()).set(COOKIE, sig("admin"), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export function checkAdminPasscode(input: string) {
  const want = process.env.ADMIN_PASSCODE;
  return !!want && safeEqual(input, want);
}

export function checkUploadPasscode(input: string | null | undefined) {
  const want = process.env.UPLOAD_PASSCODE;
  if (!want) return true;
  return !!input && safeEqual(input, want);
}

export function checkWorkerSecret(header: string | null) {
  const want = process.env.WORKER_SECRET;
  return !!want && !!header && safeEqual(header, want);
}
