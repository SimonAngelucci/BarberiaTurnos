/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Las fotos/logos (hasta 2 MB) viajan dentro de la server action; el default de Next es 1 MB.
  // 4 MB es el máximo que admite una función de Vercel (4,5 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};
export default nextConfig;
