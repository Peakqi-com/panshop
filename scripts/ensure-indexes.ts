/** 建索引（idempotent）。執行：pnpm indexes */
import { getDb } from "../src/lib/db";

async function main() {
  const db = await getDb();
  await db.collection("jobs").createIndexes([{ key: { code: 1 }, unique: true }, { key: { createdAt: -1 } }]);
  await db.collection("tracks").createIndexes([{ key: { jobId: 1, category: 1, startSec: 1 } }]);
  await db.collection("items").createIndexes([{ key: { jobId: 1, status: 1, code: 1 } }]);
  await db.collection("assets").createIndexes([{ key: { itemId: 1 }, unique: true }, { key: { jobId: 1 } }]);
  await db.collection("comments").createIndexes([{ key: { jobId: 1, _id: -1 } }]);
  await db.collection("secrets").createIndexes([{ key: { tenantId: 1, name: 1 }, unique: true }]);
  console.log("indexes ok");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
