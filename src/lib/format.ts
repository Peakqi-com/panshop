/** 時間一律以台北時區顯示（正式站伺服器是 UTC） */
export const fmtTime = (d: Date | string) => new Date(d).toLocaleString("zh-TW", { hour12: false, timeZone: "Asia/Taipei" });
