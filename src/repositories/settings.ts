import { getDb } from "@/lib/db";
import { AppSettingsSchema, DEFAULT_APP_SETTINGS, type AppSettings } from "@/models/setting";

type Doc = { _id: string; value: AppSettings; updatedAt: Date; updatedBy?: string };
const col = async () => (await getDb()).collection<Doc>("settings");
const ID = "app";

/** 單一文件存整份設定；讀取失敗時退回預設值，不讓前台因為設定壞掉而掛掉 */
export const settings = {
  async get(): Promise<AppSettings> {
    try {
      const doc = await (await col()).findOne({ _id: ID });
      return AppSettingsSchema.parse({ ...DEFAULT_APP_SETTINGS, ...(doc?.value ?? {}) });
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  },
  async save(patch: Partial<AppSettings>, by = "admin") {
    const current = await this.get();
    const value = AppSettingsSchema.parse({ ...current, ...patch });
    await (await col()).updateOne({ _id: ID }, { $set: { value, updatedAt: new Date(), updatedBy: by } }, { upsert: true });
    return value;
  },
};
