/** stage 名稱常數：前後端共用，這個檔案不可 import mongodb */
export const STAGES = ["extract", "discover", "segment", "dedup", "transcribe", "identify", "shoot", "render"] as const;
export type Stage = (typeof STAGES)[number];
/** 上傳後自動跑到 identify；shoot 與 render 等使用者確認後才跑 */
export const AUTO_STAGES: Stage[] = ["extract", "discover", "segment", "dedup", "transcribe", "identify"];
export const PRODUCE_STAGES: Stage[] = ["shoot", "render"];
export const STAGE_LABEL: Record<Stage, string> = { extract: "讀影片", discover: "找品類", segment: "切商品", dedup: "去重", transcribe: "聽口述", identify: "寫品名", shoot: "拍商品圖", render: "做目錄與短片" };
