import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAccess } from "@/lib/billing";
import { UploadError, uploadImage, uploadVideo } from "@/lib/upload";

export const dynamic = "force-dynamic";

// «video» comparte la carpeta de la galería: sus fotos de portada (poster) también van ahí.
const FOLDERS = { logo: "logo", barber: "barbers", hero: "hero", gallery: "gallery", video: "gallery" } as const;

/**
 * Subida inmediata de logo / foto de barbero. Responde SIEMPRE con JSON y un mensaje claro
 * (a diferencia de una server action, donde Next oculta el error en producción).
 * Solo sube el archivo; guardarlo en la barbería lo hace el formulario con la URL devuelta.
 */
export async function POST(req: Request) {
  const session = await getSession(); // /api no pasa por el middleware: se valida acá
  if (!session) return NextResponse.json({ error: "Tu sesión venció. Volvé a ingresar." }, { status: 401 });
  if ((await getAccess(session.businessId)).readonly) {
    return NextResponse.json({ error: "Tu cuenta está en modo solo lectura: regularizá tu suscripción para subir imágenes." }, { status: 403 });
  }

  const fd = await req.formData().catch(() => null);
  const kind = String(fd?.get("kind") ?? "");
  if (!fd || !(kind in FOLDERS)) return NextResponse.json({ error: "Petición inválida." }, { status: 400 });

  try {
    const folder = `${session.businessId}/${FOLDERS[kind as keyof typeof FOLDERS]}`;
    const url = kind === "video" ? await uploadVideo(fd.get("file"), folder) : await uploadImage(fd.get("file"), folder);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("upload", e);
    return NextResponse.json({ error: "Error inesperado al subir la imagen." }, { status: 500 });
  }
}
