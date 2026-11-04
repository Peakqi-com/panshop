"use client";

import { useActionState, useState, useTransition } from "react";
import { fmtTime } from "@/lib/format";
import { clearSettingAction, loginAction, saveSettingAction, saveAppSettingsAction, retryStageAction, deleteJobAction, deleteJobsAction, runHealthAction, type HealthRow } from "./actions";
import { useRouter } from "next/navigation";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/stages";
import { STYLES, type StyleId } from "@/lib/config";
import type { AppSettings } from "@/models/setting";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null as null | { ok: boolean; error?: string });
  return (
    <form action={action} className="mt-6 flex flex-wrap gap-2">
      <input name="passcode" type="password" required className="input flex-1" placeholder="通行碼" autoFocus />
      <button disabled={pending} className="btn btn-primary">登入</button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function SettingForm(props: { settingKey: string; label: string; env: string; hint: string | null; fromEnv: boolean; updatedAt: string | null }) {
  const [state, action, pending] = useActionState(saveSettingAction, null as null | { ok: boolean; error?: string; key?: string });
  const status = props.hint ? `已設定 ${props.hint}` : props.fromEnv ? `目前用環境變數 ${props.env}` : "未設定";
  return (
    <form action={action} className="card p-4">
      <input type="hidden" name="key" value={props.settingKey} />
      <div className="flex items-baseline justify-between">
        <label className="font-medium">{props.label}</label>
        <span className="text-xs text-stone-500">{status}{props.updatedAt ? `・${fmtTime(props.updatedAt)}` : ""}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <input name="value" type="password" autoComplete="off" className="input flex-1 font-mono text-sm" placeholder="貼上新值" />
        <button disabled={pending} className="btn btn-primary">儲存</button>
        {props.hint && <ClearKey settingKey={props.settingKey} />}
      </div>
      {state && state.key === props.settingKey && <p className={`mt-2 text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.ok ? "已儲存" : state.error}</p>}
    </form>
  );
}

export function AppSettingsForm({ value }: { value: AppSettings }) {
  const [state, action, pending] = useActionState(saveAppSettingsAction, null as null | { ok: boolean; error?: string });
  return (
    <form action={action} className="card space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm"><span className="font-medium">網站名稱</span><input name="siteName" defaultValue={value.siteName} className="input mt-1" /></label>
        <label className="text-sm"><span className="font-medium">預設商品圖風格</span>
          <select name="defaultStyle" defaultValue={value.defaultStyle} className="input mt-1">{(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{STYLES[k].label}</option>)}</select>
        </label>
        <label className="text-sm"><span className="font-medium">影片長度上限（秒）</span><input name="maxVideoSec" type="number" min={30} max={600} defaultValue={value.maxVideoSec} className="input mt-1" /></label>
        <label className="text-sm"><span className="font-medium">上傳大小上限（MB）</span><input name="maxUploadMb" type="number" min={20} max={500} defaultValue={value.maxUploadMb} className="input mt-1" /></label>
        <label className="text-sm"><span className="font-medium">直播回放長度上限（秒）</span><input name="maxReplaySec" type="number" min={60} max={1800} defaultValue={value.maxReplaySec} className="input mt-1" /></label>
        <label className="text-sm"><span className="font-medium">照片匯入張數上限</span><input name="maxPhotos" type="number" min={1} max={60} defaultValue={value.maxPhotos} className="input mt-1" /></label>
        <label className="text-sm sm:col-span-2"><span className="font-medium">範例影片網址</span><input name="sampleVideoUrl" defaultValue={value.sampleVideoUrl} placeholder="空白＝用環境變數 SAMPLE_VIDEO_URL" className="input mt-1 font-mono text-xs" /></label>
        <label className="text-sm sm:col-span-2"><span className="font-medium">首頁範例成果（掃描代碼）</span><input name="featuredJobCode" defaultValue={value.featuredJobCode} placeholder="例如 2edauk4btx；空白不顯示" className="input mt-1 font-mono text-xs" /></label>
        <label className="text-sm sm:col-span-2"><span className="font-medium">首頁公告</span><input name="announcement" defaultValue={value.announcement} placeholder="空白不顯示" className="input mt-1" /></label>
        <label className="text-sm"><span className="font-medium">短片配音</span>
          <select name="voiceMode" defaultValue={value.voiceMode} className="input mt-1"><option value="tts">專業 TTS 含語氣指令（Fish Audio，備援 OpenAI）</option><option value="seller">賣家原聲（從影片口述切出）</option><option value="none">無口白，只有字幕與音樂</option></select>
        </label>
        <label className="text-sm"><span className="font-medium">留言對商品用的模型</span>
          <select name="commentModel" defaultValue={value.commentModel} className="input mt-1"><option value="spark-open">Muse Spark Open（Baseten，開放權重）</option><option value="spark">Muse Spark 1.3（Meta Model API）</option></select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-primary">儲存設定</button>
        {state && <span className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.ok ? "已儲存" : state.error}</span>}
      </div>
    </form>
  );
}

export function RetryButtons({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState<Stage | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-stone-500">從某個 stage 重跑（會重新花模型費用）：</span>
      {armed && <span className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-red-800">確定從「{STAGE_LABEL[armed]}」重跑？<button disabled={pending} onClick={() => start(async () => { await retryStageAction(jobId, armed); setMsg(`已從「${STAGE_LABEL[armed]}」重跑`); setArmed(null); })} className="btn bg-red-600 px-2 py-0.5 text-white">確定</button><button onClick={() => setArmed(null)} className="px-1">取消</button></span>}
      {!armed && STAGES.map((s) => (
        <button key={s} disabled={pending} onClick={() => setArmed(s as Stage)} className="btn btn-ghost px-2 py-1">{STAGE_LABEL[s]}</button>
      ))}
      {msg && <span className="text-green-700">{msg}</span>}
    </div>
  );
}

export function DeleteJobForm({ jobId, code }: { jobId: string; code: string }) {
  const [typed, setTyped] = useState("");
  return (
    <form action={deleteJobAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={jobId} />
      <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`輸入代碼 ${code} 確認`} className="input w-56 font-mono" />
      <button disabled={typed !== code} className="btn bg-red-600 text-white disabled:opacity-40">刪除工作</button>
    </form>
  );
}

export function HealthPanel() {
  const [rows, setRows] = useState<HealthRow[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-600">會各打一次最便宜的呼叫（Spark 約 $0.0003），確認金鑰與服務都通。</p>
        <button disabled={pending} onClick={() => start(async () => setRows(await runHealthAction()))} className="btn btn-primary">{pending ? "檢查中…" : "開始檢查"}</button>
      </div>
      {rows && (
        <table className="mt-4 w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-stone-100">
                <td className="py-2 font-medium">{r.name}</td>
                <td className={`py-2 ${r.ok ? "text-green-700" : "text-red-700"}`}>{r.ok ? "正常" : "失敗"}</td>
                <td className="py-2 text-right font-mono text-xs text-stone-500">{r.ms} ms</td>
                <td className="py-2 pl-4 text-xs text-stone-600">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** 工作列表的勾選刪除：勾選後要再按一次「確定刪除」才會真的刪 */
export function BulkDelete({ ids }: { ids: string[] }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!ids.length) return <span className="text-xs text-stone-400">勾選左側的工作可批次刪除</span>;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-stone-600">已選 {ids.length} 個</span>
      {!armed ? <button type="button" onClick={() => setArmed(true)} className="btn btn-ghost text-red-700">刪除選取</button>
        : <button type="button" disabled={pending} onClick={() => start(async () => { await deleteJobsAction(ids); setArmed(false); router.refresh(); })} className="btn bg-red-600 text-white">{pending ? "刪除中…" : `確定刪除 ${ids.length} 個（含影片與產出）`}</button>}
      {armed && <button type="button" onClick={() => setArmed(false)} className="text-xs text-stone-500">取消</button>}
    </div>
  );
}

function ClearKey({ settingKey }: { settingKey: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return armed
    ? <><button type="button" disabled={pending} onClick={() => start(() => clearSettingAction(settingKey))} className="btn bg-red-600 text-white">確定清除</button><button type="button" onClick={() => setArmed(false)} className="text-xs text-stone-500">取消</button></>
    : <button type="button" onClick={() => setArmed(true)} className="btn btn-ghost text-red-700">清除</button>;
}
