/**
 * 畫面字斷行：中文逐字斷，英文以單字為單位斷（不把一個單字切成兩半）；
 * 單一個字本身就超寬時才逐字硬切。measure 傳入 ctx.measureText(...).width。
 */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number, maxLines = 3): string[] {
  const tokens = text.match(/[A-Za-z0-9$€£¥.,'’!?%&:/+\-–—()"]+\s*|\s+|./gu) ?? [];
  const lines: string[] = [];
  let cur = "";
  const push = () => { if (cur.trim()) lines.push(cur.trimEnd()); cur = ""; };
  for (const tok of tokens) {
    const next = cur + tok;
    if (measure(next.trimEnd()) <= maxWidth || !cur.trim()) {
      if (!cur.trim() && measure(tok.trimEnd()) > maxWidth) {
        // 單字本身太寬：逐字硬切
        for (const ch of tok) { if (measure(cur + ch) > maxWidth && cur) push(); cur += ch; }
      } else cur = cur.trim() ? next : tok.trimStart();
      continue;
    }
    push();
    cur = tok.trimStart();
  }
  push();
  return lines.slice(0, maxLines);
}
