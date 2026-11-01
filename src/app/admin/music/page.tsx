import { music } from "@/repositories/music";
import { MusicManager, type MusicRow } from "./manager";

export default async function AdminMusic() {
  const rows: MusicRow[] = (await music.list()).map((t) => ({ id: String(t._id), title: t.title, url: t.url, durationSec: t.durationSec, styles: t.styles, license: t.license, active: t.active }));
  return (
    <div>
      <h1 className="text-2xl font-bold">音樂曲庫</h1>
      <p className="mt-1 text-sm text-stone-500">短片依商品風格從這裡挑音樂，曲庫沒有適合的曲目才用程式合成。只上傳你有權使用的音樂，並填好來源與授權。</p>
      <MusicManager rows={rows} />
    </div>
  );
}
