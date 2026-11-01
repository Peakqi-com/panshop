"use server";

import { revalidatePath } from "next/cache";
import { checkAdminPasscode, grantAdmin, isAdmin } from "@/lib/auth";
import { setSetting, SETTING_KEYS, type SettingKey } from "@/lib/settings";

export async function loginAction(_: unknown, formData: FormData) {
  const code = String(formData.get("passcode") ?? "");
  if (!checkAdminPasscode(code)) return { ok: false, error: "通行碼不對" };
  await grantAdmin();
  revalidatePath("/admin");
  return { ok: true };
}

export async function saveSettingAction(_: unknown, formData: FormData) {
  if (!(await isAdmin())) return { ok: false, error: "未登入" };
  const key = String(formData.get("key") ?? "") as SettingKey;
  const value = String(formData.get("value") ?? "").trim();
  if (!(key in SETTING_KEYS)) return { ok: false, error: "未知的設定" };
  if (value.length < 4) return { ok: false, error: "值太短" };
  await setSetting(key, value, "admin");
  revalidatePath("/admin");
  return { ok: true, key };
}
