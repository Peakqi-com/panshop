import { music } from "@/repositories/music";

/** 編輯面板選曲用：只回啟用中的曲目名稱，不含授權備註 */
export async function GET() {
  const list = await music.active();
  return Response.json({ tracks: list.map((t) => ({ id: String(t._id), title: t.title, styles: t.styles, url: t.url })) });
}
