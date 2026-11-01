import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { checkUploadPasscode, isAdmin } from "@/lib/auth";
import { settings } from "@/repositories/settings";

/** Blob 用戶端直傳：瀏覽器先來這裡換 token，再直接把影片送去 Blob，不經過函式的 4.5 MB 限制 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // 曲庫音樂只有管理員能傳
        if (_pathname.startsWith("music/")) {
          if (!(await isAdmin())) throw new Error("請先登入後台");
          return { allowedContentTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac"], maximumSizeInBytes: 30 * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({}) };
        }
        // 分鏡換圖：編輯面板和其他商品操作一樣不用通行碼，但只收圖片
        if (_pathname.startsWith("scenes/")) {
          return { allowedContentTypes: ["image/jpeg", "image/png", "image/webp"], maximumSizeInBytes: 20 * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({}) };
        }
        const payload = clientPayload ? (JSON.parse(clientPayload) as { passcode?: string }) : {};
        if (!checkUploadPasscode(payload.passcode)) throw new Error("上傳通行碼不對");
        const { maxUploadMb } = await settings.get();
        const isImage = /\.(jpe?g|png|webp|heic)$/i.test(_pathname);
        return {
          allowedContentTypes: isImage ? ["image/jpeg", "image/png", "image/webp", "image/heic"] : ["video/mp4", "video/quicktime", "video/x-m4v"],
          maximumSizeInBytes: (isImage ? 20 : maxUploadMb) * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
