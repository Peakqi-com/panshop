import { getDb } from "@/lib/db";
import { seal, unseal, mask } from "@/lib/crypto";
import { SecretSchema, type Secret } from "@/models/secret";

const col = async () => (await getDb()).collection<Secret>("secrets");
const aad = (tenantId: string, name: string) => `${tenantId}:${name}`;

/**
 * 金鑰只經過這裡。規則：
 * - get 回明文，只能在伺服器端呼叫外部 API 前用，不得回傳給前端或寫進日誌
 * - list 只回名稱與末四碼
 * - 沒有「讀全部明文」的方法，故意的
 */
export const secrets = {
  async set(tenantId: string, name: string, value: string, updatedBy = "system") {
    const now = new Date();
    const sealed = seal(value, aad(tenantId, name));
    const doc = SecretSchema.omit({ createdAt: true }).parse({
      tenantId, name, ...sealed, hint: mask(value), updatedAt: now, updatedBy,
    });
    await (await col()).updateOne(
      { tenantId, name },
      { $set: doc, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  },

  async get(tenantId: string, name: string): Promise<string | null> {
    const doc = await (await col()).findOne({ tenantId, name });
    return doc ? unseal(doc, aad(tenantId, name)) : null;
  },

  async list(tenantId: string) {
    return (await col())
      .find({ tenantId }, { projection: { name: 1, hint: 1, updatedAt: 1, updatedBy: 1, keyVersion: 1 } })
      .sort({ name: 1 })
      .toArray();
  },

  async remove(tenantId: string, name: string) {
    await (await col()).deleteOne({ tenantId, name });
  },

  /** 換主鑰：新鑰設成 SECRETS_MASTER_KEY，舊鑰設成 SECRETS_MASTER_KEY_V<舊版號>，跑一次這個，再移除舊變數 */
  async rotateAll() {
    const c = await col();
    let n = 0;
    for await (const doc of c.find({})) {
      const plain = unseal(doc, aad(doc.tenantId, doc.name));
      await c.updateOne({ _id: doc._id }, { $set: { ...seal(plain, aad(doc.tenantId, doc.name)), updatedAt: new Date() } });
      n++;
    }
    return n;
  },
};
