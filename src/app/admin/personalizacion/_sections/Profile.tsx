import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { uploadsEnabled } from "@/lib/upload";
import { fmtDateTime } from "@/lib/format";
import { MAX_GALLERY_PHOTOS, MAX_HERO_PHOTOS } from "@/lib/profile";
import { ActionForm } from "@/components/ActionForm";
import { PhotoManager } from "@/components/PhotoManager";
import { MediaManager } from "@/components/MediaManager";
import { Stars } from "@/components/site/Stars";
import { createReview, deleteReview, saveAbout, saveContact, saveGallerySettings, saveReviewSettings, setReviewStatus } from "@/app/admin/profile/actions";

const STATUS = {
  PENDING: ["Pendiente de aprobación", "bg-amber-100 text-amber-800"],
  APPROVED: ["Publicada", "bg-green-100 text-green-800"],
  HIDDEN: ["Oculta", "bg-neutral-200 text-neutral-700"],
} as const;

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4 space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-sm text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const Field = ({ label, name, value, placeholder, type = "text", max = 200, hint }: { label: string; name: string; value?: string | null; placeholder?: string; type?: string; max?: number; hint?: string }) => (
  <div>
    <label className="label" htmlFor={name}>
      {label}
    </label>
    <input id={name} name={name} type={type} maxLength={max} defaultValue={value ?? ""} placeholder={placeholder} className="input" />
    {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
  </div>
);

export async function ProfileSection() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const [profile, photos, reviews] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { businessId } }),
    prisma.businessPhoto.findMany({ where: { businessId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, url: true, kind: true, mediaType: true, posterUrl: true, visible: true } }),
    prisma.review.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const enabled = uploadsEnabled();
  const hero = photos.filter((p) => p.kind === "HERO");
  const gallery = photos.filter((p) => p.kind === "GALLERY");
  const sortedReviews = [...reviews].sort((a, z) => Number(z.status === "PENDING") - Number(a.status === "PENDING")); // las pendientes primero
  const pending = reviews.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Mi página</h1>
        <p className="text-sm opacity-70">
          Todo lo que cargues acá aparece en tu página de reservas. Las secciones sin contenido no se muestran, y el diseño (colores y tipografías) es el que ya configuraste.
        </p>
      </div>

      <Section id="portada" title="Portada" hint={`Fotos grandes que pasan solas arriba de tu página. Conviene que sean horizontales. Hasta ${MAX_HERO_PHOTOS}. Sin fotos, la portada es una franja con el color de tu marca.`}>
        <PhotoManager kind="HERO" photos={hero} max={MAX_HERO_PHOTOS} enabled={enabled} />
      </Section>

      <Section id="galeria" title="Galería" hint={`Fotos y videos cortos del local y de tus trabajos. Hasta ${MAX_GALLERY_PHOTOS} elementos.`}>
        <MediaManager items={gallery} max={MAX_GALLERY_PHOTOS} enabled={enabled} />
        <div className="border-t border-neutral-100 pt-3">
          <ActionForm action={saveGallerySettings} submitLabel="Guardar">
            <div>
              <label className="label" htmlFor="galleryVisible">
                Fotos visibles a la vez en tu página
              </label>
              <select id="galleryVisible" name="galleryVisible" defaultValue={String(profile?.galleryVisible ?? 4)} className="input sm:max-w-[12rem]">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-400">Las demás se desplazan hacia el costado. En celular se ven hasta 2 a la vez.</p>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" name="galleryShowAll" defaultChecked={profile?.galleryShowAll ?? false} className="mt-1" />
              <span>
                <span className="font-medium">Mostrar botón «Mostrar galería»</span>
                <span className="block text-xs text-neutral-400">Agrega un botón «Mostrar galería» en tu página que abre todas las fotos y videos en formato collage, en una página aparte.</span>
              </span>
            </label>
          </ActionForm>
        </div>
      </Section>

      <Section id="acerca" title="Acerca de y política de reserva" hint="Dejá un campo vacío y esa parte no se muestra.">
        <ActionForm action={saveAbout} submitLabel="Guardar textos">
          <div>
            <label className="label" htmlFor="aboutTitle">
              Título de «Acerca de»
            </label>
            <input id="aboutTitle" name="aboutTitle" maxLength={80} defaultValue={profile?.aboutTitle ?? ""} placeholder="Ej: Nuestra historia" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="aboutText">
              Acerca de (historia, ambiente, qué los hace diferentes…)
            </label>
            <textarea id="aboutText" name="aboutText" rows={6} maxLength={2000} defaultValue={profile?.aboutText ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="policyText">
              Política de reserva (cancelaciones, señas, puntualidad…)
            </label>
            <textarea id="policyText" name="policyText" rows={6} maxLength={2000} defaultValue={profile?.policyText ?? ""} placeholder={"Ej:\n• Podés cancelar hasta 2 horas antes.\n• Pasados 10 minutos de tolerancia se libera el turno."} className="input" />
          </div>
        </ActionForm>
      </Section>

      <Section id="contacto" title="Contacto, redes y ubicación" hint="Podés pegar el link completo o solo tu @usuario en las redes.">
        <ActionForm action={saveContact} submitLabel="Guardar contacto">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Teléfono" name="phone" value={profile?.phone} placeholder="+54 9 11 1234 5678" max={30} />
            <Field label="WhatsApp" name="whatsapp" value={profile?.whatsapp} placeholder="+54 9 11 1234 5678" max={30} hint="Con este número se arma el botón «Escribinos»." />
            <Field label="Email" name="email" type="email" value={profile?.email} placeholder="hola@minegocio.com" max={120} />
            <Field label="Sitio web" name="website" value={profile?.website} placeholder="https://minegocio.com" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Instagram" name="instagram" value={profile?.instagram} placeholder="@minegocio" />
            <Field label="Facebook" name="facebook" value={profile?.facebook} placeholder="https://facebook.com/minegocio" />
            <Field label="TikTok" name="tiktok" value={profile?.tiktok} placeholder="@minegocio" />
            <Field label="YouTube" name="youtube" value={profile?.youtube} placeholder="@minegocio" />
          </div>
          <Field label="Dirección completa" name="address" value={profile?.address} placeholder="Av. Siempre Viva 742, Springfield" />
          <Field
            label="Link de Google Maps (opcional)"
            name="mapsUrl"
            value={profile?.mapsUrl}
            placeholder="https://maps.app.goo.gl/…"
            max={500}
            hint="En Google Maps buscá tu local → Compartir → Copiar link. Si lo dejás vacío, el botón «Cómo llegar» usa la dirección."
          />
        </ActionForm>
      </Section>

      <Section id="resenas" title="Reseñas" hint="Las que envían los clientes quedan pendientes hasta que las apruebes. Las que cargues vos se publican directo.">
        <ActionForm action={saveReviewSettings} submitLabel="Guardar">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="reviewsEnabled" defaultChecked={profile?.reviewsEnabled ?? false} className="mt-1" />
            <span>
              <strong>Mostrar reseñas en mi página</strong> y dejar que los clientes envíen la suya (se publican solo si las aprobás).
            </span>
          </label>
        </ActionForm>

        <details className="rounded-xl border border-neutral-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Agregar una reseña manualmente</summary>
          <div className="mt-3">
            <ActionForm action={createReview} submitLabel="Agregar reseña" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre del cliente" name="authorName" max={40} placeholder="Ej: Lucas G." />
                <div>
                  <label className="label" htmlFor="rating">
                    Puntuación
                  </label>
                  <select id="rating" name="rating" defaultValue="5" className="input">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {"★".repeat(n)}
                        {"☆".repeat(5 - n)} ({n})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="comment">
                  Comentario
                </label>
                <textarea id="comment" name="comment" rows={3} maxLength={500} className="input" />
              </div>
            </ActionForm>
          </div>
        </details>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            Reseñas cargadas ({reviews.length}){pending > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{pending} por aprobar</span>}
          </h3>
          {reviews.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay reseñas.</p>}
          {sortedReviews.map((r) => (
            <div key={r.id} className={`space-y-2 rounded-xl border p-3 ${r.status === "PENDING" ? "border-amber-300 bg-amber-50/40" : "border-neutral-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-sm font-medium">{r.authorName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                <span className="text-xs text-neutral-400">
                  {r.source === "CLIENT" ? "Enviada por un cliente" : "Cargada por vos"} · {fmtDateTime(r.createdAt, b.timezone)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-neutral-700">{r.comment}</p>
              <div className="flex flex-wrap gap-2">
                {r.status !== "APPROVED" && (
                  <form action={setReviewStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <button className="btn !px-3 !py-1.5 text-sm">{r.status === "PENDING" ? "Aprobar y publicar" : "Publicar"}</button>
                  </form>
                )}
                {r.status !== "HIDDEN" && (
                  <form action={setReviewStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="HIDDEN" />
                    <button className="btn-ghost">{r.status === "PENDING" ? "Rechazar" : "Ocultar"}</button>
                  </form>
                )}
                <form action={deleteReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-ghost !border-red-300 !text-red-600">Eliminar</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
