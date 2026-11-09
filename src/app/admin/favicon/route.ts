import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isOwnBlobUrl } from "@/lib/upload";

export const dynamic = "force-dynamic";

const SIZE = 64;
const RED = { r: 220, g: 38, b: 38 }; // red-600
const MAX_BYTES = 5 * 1024 * 1024;

/** Círculo rojo liso: lo que se muestra si el negocio no tiene logo o no se pudo leer. */
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#dc2626"/></svg>`;

/**
 * Favicon del panel de administración: el logo del negocio teñido de rojo (para distinguir la pestaña del panel de la página pública).
 * El rojo toma la forma del logo (su transparencia) y conserva sus claros y oscuros como sombreado.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const headers = { "Cache-Control": "private, max-age=3600" };
  const biz = await prisma.business.findUnique({ where: { id: session.businessId }, select: { logoUrl: true } });
  const url = biz?.logoUrl;

  try {
    // Solo se descarga un logo propio de este negocio (ya se valida al guardarlo; acá se vuelve a comprobar).
    if (!url || !isOwnBlobUrl(url, session.businessId)) throw new Error("sin logo");
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`logo ${res.status}`);
    const src = Buffer.from(await res.arrayBuffer());
    if (src.length > MAX_BYTES) throw new Error("logo muy pesado");

    const { default: sharp } = await import("sharp");
    const logo = await sharp(src)
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png()
      .toBuffer();
    const alpha = await sharp(logo).extractChannel(3).toBuffer();
    const red = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: RED } })
      .joinChannel(alpha)
      .png()
      .toBuffer();
    const shade = await sharp(logo).greyscale().png().toBuffer();
    const png = await sharp(red).composite([{ input: shade, blend: "overlay" }]).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
  } catch {
    return new Response(FALLBACK_SVG, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
}
