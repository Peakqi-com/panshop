import { put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";

const CT: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".wav": "audio/wav", ".csv": "text/csv; charset=utf-8", ".json": "application/json" };

/** 上傳 Buffer 到 Blob，回公開網址。路徑慣例 jobs/<code>/<kind>/<name> */
export async function putBlob(key: string, data: Buffer | string, contentType?: string) {
  const ct = contentType ?? CT[path.extname(key).toLowerCase()] ?? "application/octet-stream";
  const r = await put(key, data, { access: "public", contentType: ct, addRandomSuffix: false, allowOverwrite: true });
  return r.url;
}

export async function putFile(key: string, file: string, contentType?: string) {
  return putBlob(key, await fs.readFile(file), contentType);
}

export async function delBlob(urls: string | string[]) {
  await del(urls);
}
