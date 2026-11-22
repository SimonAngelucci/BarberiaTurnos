/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Las fotos/logos (hasta 2 MB) viajan dentro de la server action; el default de Next es 1 MB.
    // 4 MB es el maximo que admite una funcion de Vercel (4,5 MB).
    serverActions: { bodySizeLimit: "4mb" },
    // Las pestanas vecinas del panel se precargan para que el swipe sea instantaneo; las precargadas se reutilizan solo 30 s
    // (por defecto serian 5 min) para no mostrar datos viejos de turnos.
    staleTimes: { dynamic: 0, static: 30 },
  },
};
export default nextConfig;
