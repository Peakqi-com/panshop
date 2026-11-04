import { HealthPanel } from "../forms";

export default function AdminHealth() {
  return (
    <div>
      <h1 className="text-2xl font-bold">健康檢查</h1>
      <p className="mt-1 text-sm text-stone-500">資料庫、Blob、Meta Model API、Baseten、ffmpeg。</p>
      <div className="mt-4"><HealthPanel /></div>
      <div className="card mt-4 p-4 text-sm text-stone-600">
        <h2 className="font-semibold text-stone-900">環境</h2>
        <ul className="mt-2 space-y-1 text-xs">
          <li>Node {process.version}</li>
          <li>部署：{process.env.VERCEL ? `Vercel ${process.env.VERCEL_ENV ?? ""} ${process.env.VERCEL_REGION ?? ""}` : "本機"}</li>
          <li>對外網址：{process.env.NEXT_PUBLIC_SITE_URL ?? "未設定"}</li>
          <li>上傳通行碼：{process.env.UPLOAD_PASSCODE ? "已啟用" : "未啟用（公開試用，靠每日次數與花費上限保護）"}</li>
        </ul>
      </div>
    </div>
  );
}
