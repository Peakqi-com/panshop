import { z } from "zod";

/** 可在後台調整的系統設定（非金鑰）。金鑰走 secrets 集合 */
export const AppSettingsSchema = z.object({
  maxVideoSec: z.number().int().min(30).max(600).default(240),
  maxReplaySec: z.number().int().min(60).max(1800).default(600),
  maxPhotos: z.number().int().min(1).max(60).default(30),
  maxUploadMb: z.number().int().min(20).max(500).default(300),
  defaultStyle: z.string().default("lifestyle"),
  sampleVideoUrl: z.string().default(""),            // 空白＝用環境變數 SAMPLE_VIDEO_URL
  siteName: z.string().default("PanShop"),
  announcement: z.string().default(""),               // 首頁公告，空白不顯示
  commentModel: z.enum(["spark-open", "spark"]).default("spark-open"),
  voiceMode: z.enum(["tts", "seller", "none"]).default("seller"),   // 短片配音：專業 TTS、賣家原聲、無口白
  featuredJobCode: z.string().default(""),                        // 首頁「看範例成果」連到的掃描代碼，空白不顯示
  trialJobsPerIp: z.number().int().min(0).max(100).default(3),   // 公開試用：每個 IP 每 24 小時可建幾個掃描，0＝不限
  dailyBudgetUsd: z.number().min(0).max(1000).default(20),        // 全站 24 小時模型花費上限（美元），超過就暫停新掃描與產出，0＝不限
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export const DEFAULT_APP_SETTINGS: AppSettings = AppSettingsSchema.parse({});
