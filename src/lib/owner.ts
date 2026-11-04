/**
 * 掃描的編輯權：建立掃描的瀏覽器拿到一個隨機 token（httpOnly cookie，ps_<代碼>），資料庫只存雜湊。
 * 有 token 或管理員才能改商品、重做圖片與短片；其他人只能看。沒有帳號系統，網址分享出去也不會被亂改或被花掉模型額度。
 */
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { isAdmin, safeEqual } from "@/lib/auth";
import { jobs } from "@/repositories/jobs";
import { items } from "@/repositories/items";
import type { Job } from "@/models/job";
import type { Item } from "@/models/item";
import { apiError } from "@/lib/api-error";

const PREFIX = "ps_";
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** 建立掃描時呼叫：設 cookie，回傳要存進資料庫的雜湊 */
export async function issueEditToken(code: string) {
  const token = randomBytes(24).toString("base64url");
  (await cookies()).set(PREFIX + code, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return hashToken(token);
}

export async function canEditJob(job: Pick<Job, "code" | "editTokenHash">) {
  if (await isAdmin()) return true;
  if (!job.editTokenHash) return false;
  const t = (await cookies()).get(PREFIX + job.code)?.value;
  return !!t && safeEqual(hashToken(t), job.editTokenHash);
}

/** 這個瀏覽器建立過、而且 token 仍然有效的掃描 */
export async function myJobs(limit = 50) {
  const codes = (await cookies()).getAll().filter((c) => c.name.startsWith(PREFIX)).map((c) => c.name.slice(PREFIX.length));
  if (!codes.length) return [] as Job[];
  const list = await jobs.byCodes(codes.slice(-200));
  const ok: Job[] = [];
  for (const j of list) if (await canEditJob(j)) ok.push(j);
  return ok.slice(0, limit);
}

const deny = () => apiError("只有建立這個掃描的瀏覽器可以修改", "Only the browser that created this scan can change it", 403);
const notFound = () => apiError("找不到", "Not found", 404);

export async function guardJob(id: string): Promise<Job | Response> {
  const job = ObjectId.isValid(id) ? await jobs.byId(id) : await jobs.byCode(id);
  if (!job?._id) return notFound();
  return (await canEditJob(job)) ? job : deny();
}

export async function guardItem(id: string): Promise<{ it: Item; job: Job } | Response> {
  if (!ObjectId.isValid(id)) return apiError("id 不對", "Invalid id", 400);
  const it = await items.byId(id);
  if (!it?._id) return notFound();
  const job = await jobs.byId(it.jobId);
  if (!job?._id) return notFound();
  return (await canEditJob(job)) ? { it, job } : deny();
}

/** 批次動作：所有商品要屬於同一個掃描，且有那個掃描的編輯權 */
export async function guardItems(ids: string[]): Promise<Job | Response> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  const docs = (await Promise.all(valid.map((id) => items.byId(id)))).filter(Boolean) as Item[];
  if (!docs.length) return notFound();
  const jobIds = new Set(docs.map((d) => String(d.jobId)));
  if (jobIds.size !== 1) return apiError("商品不屬於同一個掃描", "The items belong to different scans", 400);
  return guardJob([...jobIds][0]);
}
