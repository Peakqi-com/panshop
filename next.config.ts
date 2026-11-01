import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongodb", "ffmpeg-static", "sharp", "@meta-sam/parser", "opencc-js"],
  outputFileTracingIncludes: {
    "/api/jobs/[id]/run": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/**": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
  },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
