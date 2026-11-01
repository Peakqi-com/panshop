/** 管線演算法參數（不是業務設定，所以放程式；業務可調的值一律放資料庫） */
export const PIPE = {
  procFps: 4,            // 給 SAM 的影片幀率
  procShort: 720,        // 給 SAM 的影片短邊
  overviewFrames: 8,     // 總覽與 UI 用的高解析影格數
  maxCategories: 5,
  minTrackSec: 0.75,     // 短於此的 track 視為雜訊
  minTrackArea: 0.003,   // 框面積占畫面比例低於此視為雜訊
  minTrackConf: 0.35,
  sliverArea: 0.03,      // 面積占比低於此且
  sliverSec: 4,          // 長度短於此 → 視為進出畫面的一角，丟掉
  cropsPerTrack: 3,
  cropMargin: 0.15,
  cutoutPad: 0.08,
  sparkEffort: "low" as const,
  identifyConcurrency: 4,
};

/** 定價（USD），依 dev.meta.ai 2026-10 公告；只用來估算 job.metrics.costUsd */
export const PRICE = {
  sparkIn: 1.25 / 1e6,
  sparkOut: 4.25 / 1e6,
  samVideoFrame: 0.20 / 1000,
  samVideoMinFrames: 50,
  samImage: 2.5 / 1000,
  image: 0.01,
  voicePerHour: 0.18,
};

/** 商品圖風格：使用者在上傳時選，影響 Muse Image 的場景描述；文字一律後製疊加，不讓模型畫字 */
export const STYLES = {
  lifestyle: { label: "生活情境", hint: "natural lifestyle scene with the product in use or at rest, real environment, candid warm daylight" },
  minimal: { label: "極簡乾淨", hint: "minimalist composition, generous negative space, soft neutral or pastel backdrop, the product as the single hero" },
  natural: { label: "自然質感", hint: "earthy organic mood, wood and linen textures, plants, soft window light, wellness feel" },
  luxury: { label: "精品質感", hint: "premium editorial look, deep rich tones, marble or velvet surfaces, dramatic soft spotlight" },
  cute: { label: "可愛親和", hint: "friendly playful mood, soft pastel palette, rounded props, bright even light" },
  promo: { label: "電商促銷", hint: "clean high-contrast commercial composition with clear space reserved for price and headline overlays" },
} as const;
export type StyleId = keyof typeof STYLES;
export const DEFAULT_STYLE: StyleId = "lifestyle";

/** 情境圖每件輪一種構圖，避免整批長得一樣 */
export const SCENE_VARIATIONS = [
  "wide shot with the surrounding environment visible and balanced composition",
  "tight tabletop close-up with shallow depth of field and a softly blurred background",
  "the product on a shelf or ledge with a few complementary props",
  "in-use moment with a person's hands interacting with the product, no face visible",
  "flat-lay top-down arrangement with tasteful complementary props",
  "golden-hour side light with long soft shadows",
];

/** 商品圖角度：棚拍三個角度加一張情境 */
export const ANGLES = [
  { kind: "front", label: "正面", hint: "straight-on front view, the product facing the camera" },
  { kind: "threeQuarter", label: "四十五度", hint: "three-quarter hero angle from slightly above, showing the front and one side" },
  { kind: "side", label: "側面", hint: "clean side profile view" },
] as const;
