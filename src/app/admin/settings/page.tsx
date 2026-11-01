import { listSettings } from "@/lib/settings";
import { settings } from "@/repositories/settings";
import { AppSettingsForm, SettingForm } from "../forms";

export default async function AdminSettings() {
  const [{ list, dbError }, app] = await Promise.all([listSettings(), settings.get()]);
  return (
    <div>
      <h1 className="text-2xl font-bold">設定與金鑰</h1>
      {dbError && <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">資料庫連不上：{dbError}</p>}
      <h2 className="mt-6 font-semibold">系統設定</h2>
      <p className="text-sm text-stone-500">這些值存在資料庫，改了立刻生效，不用重新部署。</p>
      <div className="mt-3"><AppSettingsForm value={app} /></div>
      <h2 className="mt-8 font-semibold">模型金鑰</h2>
      <p className="text-sm text-stone-500">以 AES-256-GCM 加密存進資料庫，只顯示末四碼；送出新值會覆蓋。沒設定時退回環境變數。</p>
      <div className="mt-3 space-y-4">
        {list.map((r) => <SettingForm key={r.key} settingKey={r.key} label={r.label} env={r.env} hint={r.hint} fromEnv={r.fromEnv} updatedAt={r.updatedAt?.toISOString() ?? null} />)}
      </div>
      <p className="mt-6 text-xs text-stone-400">資料庫連線、Blob token、通行碼、加密主鑰與 stage 共用密鑰仍放環境變數（見 .env.example）。</p>
    </div>
  );
}
