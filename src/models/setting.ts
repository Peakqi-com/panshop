import { z } from "zod";

/** 可在後台調整的系統設定（非金鑰）。金鑰走 secrets 集合 */
export const AppSettingsSchema = z.object({
  maxVideoSec: z.number().int().min(30).max(600).default(240),
  maxUploadMb: z.number().int().min(20).max(500).default(300),
  defaultStyle: z.string().default("lifestyle"),
  sampleVideoUrl: z.string().default(""),            // 空白＝用環境變數 SAMPLE_VIDEO_URL
  siteName: z.string().default("PanShop"),
  announcement: z.string().default(""),               // 首頁公告，空白不顯示
  commentModel: z.enum(["spark-open", "spark"]).default("spark-open"),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export const DEFAULT_APP_SETTINGS: AppSettings = AppSettingsSchema.parse({});
