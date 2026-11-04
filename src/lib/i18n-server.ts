import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, pickLang, type Lang } from "@/lib/i18n";

export async function getLang(): Promise<Lang> {
  return pickLang((await cookies()).get(LANG_COOKIE)?.value);
}
export async function getT() {
  return makeT(await getLang());
}
