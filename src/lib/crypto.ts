import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 租戶／整合金鑰的加解密。主鑰只放環境變數 SECRETS_MASTER_KEY（32 bytes base64）：
 *   openssl rand -base64 32
 * 系統自己的金鑰（MONGODB_URI、CLERK_SECRET_KEY、ANTHROPIC_API_KEY）仍放環境變數，不走這裡。
 */
export const KEY_VERSION = 1;

export type Sealed = { ciphertext: string; iv: string; tag: string; keyVersion: number };

function masterKey(version = KEY_VERSION): Buffer {
  // 換鑰時：新鑰放 SECRETS_MASTER_KEY，舊鑰放 SECRETS_MASTER_KEY_V<舊版號>，重新加密完再移除舊變數
  const name = version === KEY_VERSION ? "SECRETS_MASTER_KEY" : `SECRETS_MASTER_KEY_V${version}`;
  const b64 = process.env[name];
  if (!b64) throw new Error(`${name} 未設定；產生：openssl rand -base64 32`);
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`${name} 必須是 32 bytes 的 base64`);
  return key;
}

/** 加密。aad 建議帶 `${tenantId}:${name}`，密文就綁死在那一列，搬到別列會解不開 */
export function seal(plain: string, aad?: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

/** 解密。只在伺服器端、真的要呼叫外部 API 的那一刻用；結果不回傳前端、不寫日誌 */
export function unseal(s: Sealed, aad?: string): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(s.keyVersion), Buffer.from(s.iv, "base64"));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(s.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/** 後台顯示用：只露末四碼 */
export const mask = (plain: string) => (plain.length <= 4 ? "••••" : `••••${plain.slice(-4)}`);
