/** 管線演算法參數（不是業務設定，所以放程式；業務可調的值一律放資料庫） */
export const PIPE = {
  procFps: 4,            // 給 SAM 的影片幀率
  procShort: 720,        // 給 SAM 的影片短邊
  overviewFrames: 8,     // 總覽與 UI 用的高解析影格數
  maxCategories: 5,
  minTrackSec: 0.75,     // 短於此的 track 視為雜訊
  minTrackArea: 0.003,   // 框面積占畫面比例低於此視為雜訊
  minTrackConf: 0.35,
  cropsPerTrack: 3,
  cropMargin: 0.15,
  cutoutPad: 0.08,
  sparkEffort: "low" as const,
  identifyConcurrency: 4,
};

/** 定價（USD），依 dev.meta.ai 2026-10 公告；只用來估算 job.metrics.costUsd */
export const PRICE = {
  sparkIn: 1.25 / 1e6,
  sparkOut: 4.25 / 1e6,
  samVideoFrame: 0.20 / 1000,
  samVideoMinFrames: 50,
  samImage: 2.5 / 1000,
  image: 0.01,
  voicePerHour: 0.18,
};
