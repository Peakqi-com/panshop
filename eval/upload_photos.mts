/** 把幾張本機照片上傳並建立「匯入照片」工作：node --env-file=.env.local --import tsx eval/upload_photos.mts <img...> */
import { promises as fs } from "node:fs";
import path from "node:path";
import { putBlob } from "../src/lib/blob";
const files = process.argv.slice(2);
const photos = [];
for (const f of files) photos.push({ url: await putBlob(`uploads/photos/eval-${Date.now()}-${path.basename(f)}`, await fs.readFile(f), f.endsWith(".png") ? "image/png" : "image/jpeg"), name: path.basename(f) });
const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const r = await fetch(`${base}/api/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "photos", photos, shopName: "照片測試", style: "minimal" }) });
console.log(r.status, await r.json());
