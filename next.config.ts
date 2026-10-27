import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FLEET_PREVIEW === "1" ? ".next-fleet-preview" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Fotos de evidencia (ya comprimidas en el navegador); Vercel admite hasta 4.5 MB
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
