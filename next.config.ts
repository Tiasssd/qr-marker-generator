import type { NextConfig } from "next";

/**
 * GitHub Pages — это статический хостинг без Node.js.
 * Поэтому собираем полностью статический сайт в out/ (output: "export").
 * Для project pages приложение живёт по адресу /repo/, путь приходит
 * из GitHub Actions в NEXT_PUBLIC_BASE_PATH.
 */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath =
  rawBasePath === "/" ? "" : rawBasePath.replace(/\/+$/, "").replace(/^([^/])/, "/$1");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
