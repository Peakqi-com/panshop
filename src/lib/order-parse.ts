/**
 * 直播／團購留言的下單格式，用規則解析，不花模型額度：
 * 「A3+1」「a3 +2」「A3 x2」「A3*2」「A3×2」「+1 A3」「A3 兩個」「A3 2件」「Ａ３＋１」，一則可以有多件。
 * 「王小美：A3+1」「Amy: A3 x2」冒號前當成買家名稱。
 * 規則對不上（例如「A3 多少」「還有藍色嗎」）回傳空陣列，交給 Muse Spark Open 判斷。
 */
export type OrderLine = { code: string; qty: number };
export type ParsedComment = { buyer: string | null; lines: OrderLine[] };

const ZH_NUM: Record<string, number> = { 一: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const UNIT = "(?:個|件|份|組|支|雙|本|盒|包|入|pcs?|pieces?)?";

/** 全形英數與符號轉半形 */
export function toHalfWidth(s: string) {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
}

const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : ZH_NUM[s] ?? NaN);

export function parseOrderComment(raw: string, codes: string[]): ParsedComment {
  let text = toHalfWidth(raw).trim();
  let buyer: string | null = null;
  const m = text.match(/^([^:：\n]{1,30})[:：]\s*([\s\S]+)$/);
  if (m && !/^[A-Za-z]\d{1,3}\b/.test(m[1].trim())) { buyer = m[1].trim(); text = m[2]; }
  const known = new Map(codes.map((c) => [c.toUpperCase(), c]));
  const found = new Map<string, number>();
  const add = (code: string, qty: number) => {
    const c = known.get(code.toUpperCase());
    if (!c || !Number.isFinite(qty) || qty < 1 || qty > 99) return;
    found.set(c, (found.get(c) ?? 0) + qty);
  };
  const Q = `(\\d{1,2}|[一兩二三四五六七八九十])`;
  const patterns: [RegExp, (g: RegExpExecArray) => void][] = [
    // A3+1、A3 x2、A3*2、A3×2、A3 兩個、A3 2件
    [new RegExp(`(?<![A-Za-z0-9])([A-Za-z]\\d{1,3})\\s*(?:\\+|x|X|\\*|×)\\s*${Q}${UNIT}`, "g"), (g) => add(g[1], num(g[2]))],
    [new RegExp(`(?<![A-Za-z0-9])([A-Za-z]\\d{1,3})\\s*${Q}\\s*(?:個|件|份|組|支|雙|本|盒|包|入)`, "g"), (g) => add(g[1], num(g[2]))],
    // +1 A3
    [new RegExp(`\\+\\s*${Q}\\s*([A-Za-z]\\d{1,3})(?![A-Za-z0-9])`, "g"), (g) => add(g[2], num(g[1]))],
  ];
  const taken: [number, number][] = [];
  for (const [re, fn] of patterns) {
    for (let g = re.exec(text); g; g = re.exec(text)) {
      const span: [number, number] = [g.index, g.index + g[0].length];
      if (taken.some(([a, b]) => span[0] < b && a < span[1])) continue;
      taken.push(span); fn(g);
    }
  }
  return { buyer, lines: Array.from(found, ([code, qty]) => ({ code, qty })) };
}
