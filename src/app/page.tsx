import { UploadForm } from "@/components/upload-form";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-sm font-medium tracking-wide text-orange-600">PanShop</p>
      <h1 className="mt-2 text-4xl font-semibold leading-tight">掃一圈，就開賣。</h1>
      <p className="mt-3 text-neutral-600">對著桌上的商品慢慢拍一段影片，邊拍邊說品名和價格。PanShop 會切出每一件商品、做好商品圖與文案，匯出 Meta 商品目錄、可購買頁，和每件一支直式短影片。</p>
      <UploadForm needPasscode={!!process.env.UPLOAD_PASSCODE} />
      <ul className="mt-10 grid gap-2 text-sm text-neutral-500 sm:grid-cols-3">
        <li>・一次 10 件以內、3 個品類以內最準</li>
        <li>・每件完整入鏡至少 3 秒</li>
        <li>・影片 1 到 3 分鐘，300 MB 以內</li>
      </ul>
    </main>
  );
}
