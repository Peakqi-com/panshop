import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongodb", "ffmpeg-static", "sharp", "@meta-sam/parser", "opencc-js", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/jobs/[id]/run": ["./node_modules/ffmpeg-static/ffmpeg", "./src/assets/fonts/**"],
    "/api/**": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
  },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
