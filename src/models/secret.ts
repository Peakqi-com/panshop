import { z } from "zod";

/** 租戶或整合用的金鑰，一列一把，內容加密（見 src/lib/crypto.ts） */
export const SecretSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().regex(/^[a-z0-9_.-]+$/, "金鑰名稱用小寫英數與 _ . -，例如 line.channel_token"),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  keyVersion: z.number().int().positive(),
  hint: z.string().max(8), // 末四碼遮罩，後台顯示用
  createdAt: z.date(),
  updatedAt: z.date(),
  updatedBy: z.string().optional(), // Clerk userId 或 "system"
});
export type Secret = z.infer<typeof SecretSchema>;
