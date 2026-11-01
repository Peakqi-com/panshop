import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { checkUploadPasscode } from "@/lib/auth";

/** Blob 用戶端直傳：瀏覽器先來這裡換 token，再直接把影片送去 Blob，不經過函式的 4.5 MB 限制 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? (JSON.parse(clientPayload) as { passcode?: string }) : {};
        if (!checkUploadPasscode(payload.passcode)) throw new Error("上傳通行碼不對");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/x-m4v"],
          maximumSizeInBytes: 300 * 1024 * 1024,
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
