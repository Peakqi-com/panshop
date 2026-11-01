/** 把本機影片丟進本機管線：node --env-file=.env.local --import tsx eval/run_job.mts <video> [shopName] */
import { promises as fs } from "node:fs";
import path from "node:path";
import { putBlob } from "../src/lib/blob";
const [video, shopName = "測試店"] = process.argv.slice(2);
const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const url = await putBlob(`uploads/eval-${Date.now()}-${path.basename(video)}`, await fs.readFile(video), "video/mp4");
const r = await fetch(`${base}/api/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoUrl: url, fileName: path.basename(video), shopName, passcode: process.env.UPLOAD_PASSCODE ?? "" }) });
const j = await r.json();
console.log(r.status, j, `${base}/jobs/${j.code}`);
