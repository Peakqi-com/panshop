/** stage 名稱常數：前後端共用，這個檔案不可 import mongodb */
export const STAGES = ["extract", "discover", "segment", "dedup", "transcribe", "identify", "shoot", "render"] as const;
export type Stage = (typeof STAGES)[number];
/** 上傳後自動跑到 identify；shoot 與 render 等使用者確認後才跑 */
export const AUTO_STAGES: Stage[] = ["extract", "discover", "segment", "dedup", "transcribe", "identify"];
export const PRODUCE_STAGES: Stage[] = ["shoot", "render"];
export const STAGE_LABEL: Record<Stage, string> = { extract: "讀影片", discover: "找品類", segment: "切商品", dedup: "去重", transcribe: "聽口述", identify: "寫品名", shoot: "拍商品圖", render: "做目錄與短片" };

/** 各 stage 對 80 秒影片的平均耗時（秒，正式站實測），用來估剩餘時間；shoot／render 依件數 */
export const STAGE_AVG_SEC: Record<Stage, number> = { extract: 40, discover: 7, segment: 90, dedup: 40, transcribe: 15, identify: 35, shoot: 25, render: 40 };
export function estimateRemaining(stages: Partial<Record<Stage, { status: string; startedAt?: string; ms?: number }>>, chain: Stage[], durationSec: number | undefined, itemCount: number | undefined): number {
  const scale = Math.max(0.4, Math.min(3, (durationSec ?? 80) / 80));
  const perItem = Math.max(1, itemCount ?? 8);
  let total = 0;
  for (const s of chain) {
    const st = stages[s];
    if (st?.status === "done" || st?.status === "skipped") continue;
    const full = s === "shoot" || s === "render" ? STAGE_AVG_SEC[s] * perItem / 1.5 : STAGE_AVG_SEC[s] * scale;
    if (st?.status === "running" && st.startedAt) total += Math.max(3, full - (Date.now() - new Date(st.startedAt).getTime()) / 1000);
    else total += full;
  }
  return Math.round(total);
}
