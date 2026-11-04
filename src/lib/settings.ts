import { secrets } from "@/repositories/secrets";

/**
 * 系統層金鑰的取得順序：
 *   1. 後台 /admin 存進 secrets 集合（tenantId = "system"）的值
 *   2. 環境變數（META_API_KEY、BASETEN_API_KEY）
 * 只在伺服器端、呼叫外部 API 前一刻取用，不回傳前端、不寫日誌。
 */
export const SETTING_KEYS = {
  META_API_KEY: { name: "meta.api_key", env: "META_API_KEY", label: "Meta Model API key" },
  BASETEN_API_KEY: { name: "baseten.api_key", env: "BASETEN_API_KEY", label: "Baseten API key（Muse Spark Open）" },
  BASETEN_MODEL: { name: "baseten.model", env: "BASETEN_MODEL", label: "Baseten 模型 slug" },
  FISH_AUDIO_API_KEY: { name: "fish.api_key", env: "FISH_AUDIO_API_KEY", label: "Fish Audio API key（配音，聽得懂語氣指令）" },
  FISH_VOICE_ID: { name: "fish.voice_id", env: "FISH_VOICE_ID", label: "Fish Audio 聲音 reference id" },
  OPENAI_API_KEY: { name: "openai.api_key", env: "OPENAI_API_KEY", label: "OpenAI API key（配音備援 gpt-4o-mini-tts）" },
} as const;
export type SettingKey = keyof typeof SETTING_KEYS;

const SYSTEM = "system";

export async function getSetting(key: SettingKey): Promise<string | null> {
  const def = SETTING_KEYS[key];
  try {
    const v = await secrets.get(SYSTEM, def.name);
    if (v) return v;
  } catch {
    // 資料庫不可用時退回環境變數
  }
  return process.env[def.env] ?? null;
}

export async function requireSetting(key: SettingKey): Promise<string> {
  const v = await getSetting(key);
  if (!v) throw new Error(`${SETTING_KEYS[key].label} 未設定：請到 /admin 填入，或設環境變數 ${SETTING_KEYS[key].env}`);
  return v;
}

export async function setSetting(key: SettingKey, value: string, by = "admin") {
  await secrets.set(SYSTEM, SETTING_KEYS[key].name, value, by);
}

export async function clearSetting(key: SettingKey) {
  await secrets.remove(SYSTEM, SETTING_KEYS[key].name);
}

export async function listSettings() {
  let rows: Awaited<ReturnType<typeof secrets.list>> = [];
  let dbError: string | null = null;
  try {
    rows = await secrets.list(SYSTEM);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const list = (Object.keys(SETTING_KEYS) as SettingKey[]).map((k) => {
    const def = SETTING_KEYS[k];
    const row = rows.find((r) => r.name === def.name);
    return { key: k, label: def.label, env: def.env, hint: row?.hint ?? null, fromEnv: !row && !!process.env[def.env], updatedAt: row?.updatedAt ?? null };
  });
  return { list, dbError };
}
