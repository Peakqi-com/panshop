import { describe, it, expect } from "vitest";
import { parseOrderComment } from "@/lib/order-parse";

const codes = ["A1", "A2", "A3", "B1", "C1"];
const p = (s: string) => parseOrderComment(s, codes);

describe("parseOrderComment", () => {
  it("reads the common +1 formats", () => {
    expect(p("A3+1").lines).toEqual([{ code: "A3", qty: 1 }]);
    expect(p("a3 +2").lines).toEqual([{ code: "A3", qty: 2 }]);
    expect(p("A3 x2").lines).toEqual([{ code: "A3", qty: 2 }]);
    expect(p("A3×3").lines).toEqual([{ code: "A3", qty: 3 }]);
    expect(p("+1 B1").lines).toEqual([{ code: "B1", qty: 1 }]);
    expect(p("Ａ３＋１").lines).toEqual([{ code: "A3", qty: 1 }]);
    expect(p("A3 兩個").lines).toEqual([{ code: "A3", qty: 2 }]);
    expect(p("C1 2件").lines).toEqual([{ code: "C1", qty: 2 }]);
  });
  it("handles several items and buyer names", () => {
    expect(p("王小美：A1+1 B1+2")).toEqual({ buyer: "王小美", lines: [{ code: "A1", qty: 1 }, { code: "B1", qty: 2 }] });
    expect(p("Amy: A3 x2").buyer).toBe("Amy");
  });
  it("leaves questions and unknown codes to the model", () => {
    expect(p("A3 多少").lines).toEqual([]);
    expect(p("還有藍色的嗎").lines).toEqual([]);
    expect(p("Z9+1").lines).toEqual([]);
    expect(p("A3+1").buyer).toBeNull();
  });
});
