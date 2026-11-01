"use client";

import { useActionState } from "react";
import { loginAction, saveSettingAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null as null | { ok: boolean; error?: string });
  return (
    <form action={action} className="mt-6 flex flex-wrap gap-2">
      <input name="passcode" type="password" required className="flex-1 rounded border px-3 py-2" placeholder="通行碼" autoFocus />
      <button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">登入</button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function SettingForm(props: { settingKey: string; label: string; env: string; hint: string | null; fromEnv: boolean; updatedAt: string | null }) {
  const [state, action, pending] = useActionState(saveSettingAction, null as null | { ok: boolean; error?: string; key?: string });
  const status = props.hint ? `已設定 ${props.hint}` : props.fromEnv ? `目前用環境變數 ${props.env}` : "未設定";
  return (
    <form action={action} className="rounded-lg border p-4">
      <input type="hidden" name="key" value={props.settingKey} />
      <div className="flex items-baseline justify-between">
        <label className="font-medium">{props.label}</label>
        <span className="text-xs text-neutral-500">{status}{props.updatedAt ? `・${new Date(props.updatedAt).toLocaleString("zh-TW")}` : ""}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <input name="value" type="password" autoComplete="off" className="flex-1 rounded border px-3 py-2 font-mono text-sm" placeholder="貼上新值" />
        <button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">儲存</button>
      </div>
      {state && state.key === props.settingKey && (
        <p className={`mt-2 text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.ok ? "已儲存" : state.error}</p>
      )}
    </form>
  );
}
