import { cookies, headers } from "next/headers";
import { LANG_COOKIE, makeT, pickLang, type Lang } from "@/lib/i18n";

export async function getLang(): Promise<Lang> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLang(c.get(LANG_COOKIE)?.value, h.get("accept-language"));
}
export async function getT() {
  return makeT(await getLang());
}
