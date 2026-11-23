/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Las fotos/logos (hasta 2 MB) viajan dentro de la server action; el default de Next es 1 MB.
    // 4 MB es el maximo que admite una funcion de Vercel (4,5 MB).
    serverActions: { bodySizeLimit: "4mb" },
    // Las 5 pestanas del panel se precargan completas (con datos) y se renuevan cada minuto (ver SwipeShell): static = cuanto vale
    // una precarga completa; dynamic = paginas ya visitadas. Las acciones del panel invalidan esta cache al guardar.
    staleTimes: { dynamic: 30, static: 90 },
  },
};
export default nextConfig;
