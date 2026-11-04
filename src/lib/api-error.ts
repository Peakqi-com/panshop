import { getT } from "@/lib/i18n-server";

/** API 錯誤訊息依使用者選的介面語言回傳（瀏覽器會自動帶語言 cookie） */
export async function apiError(zh: string, en: string, status: number) {
  const t = await getT();
  return Response.json({ error: t(zh, en) }, { status });
}
