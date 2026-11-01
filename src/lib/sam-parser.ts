/** @meta-sam/parser 是 ESM-only；用動態 import 讓 CJS（tsx 腳本）與 Next 伺服器都能載入 */
export type SamParser = typeof import("@meta-sam/parser");
let cached: Promise<SamParser> | null = null;
export function samParser(): Promise<SamParser> {
  return (cached ??= import("@meta-sam/parser"));
}
