import { isAdmin } from "@/lib/auth";
import { listSettings } from "@/lib/settings";
import { LoginForm, SettingForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await isAdmin();
  if (!admin) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-semibold">PanShop 後台</h1>
        <p className="mt-2 text-sm text-neutral-500">輸入 ADMIN_PASSCODE。</p>
        <LoginForm />
      </main>
    );
  }
  const { list: rows, dbError } = await listSettings();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">PanShop 後台：模型金鑰</h1>
      <p className="mt-2 text-sm text-neutral-500">
        值以 AES-256-GCM 加密存進資料庫，只顯示末四碼。送出新值會覆蓋。沒有在這裡設定時，會退回環境變數。
      </p>
      {dbError && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          資料庫連不上，金鑰暫時存不進去。先把 MONGODB_URI 填進 .env.local 再重整。<br /><span className="text-xs">{dbError}</span>
        </p>
      )}
      <div className="mt-6 space-y-6">
        {rows.map((r) => (
          <SettingForm key={r.key} settingKey={r.key} label={r.label} env={r.env} hint={r.hint} fromEnv={r.fromEnv} updatedAt={r.updatedAt?.toISOString() ?? null} />
        ))}
      </div>
      <p className="mt-8 text-xs text-neutral-400">
        資料庫連線、Blob token、通行碼與加密主鑰仍放環境變數（見 .env.example）。
      </p>
    </main>
  );
}
