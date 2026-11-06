import { Stars } from "./Stars";
import { SOCIAL_LABELS, mapsHref, prettyPhone, telHref, whatsappHref } from "@/lib/profile";
import { safePhone, safeUrl } from "./InfoSections";

type Contact = {
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
};

const SOCIALS = ["instagram", "facebook", "tiktok", "youtube", "website"] as const;
const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * Tarjeta principal (a la derecha en pantallas grandes, flotante y fija al desplazarse): logo, nombre, puntuación, botón de
 * reservar, dirección y contacto. En celular va arriba, sobre la portada.
 */
export function BusinessCard({
  name,
  tagline,
  logoUrl,
  average,
  total,
  showRating,
  contact,
  bookHref,
  bookLabel,
}: {
  name: string;
  tagline: string;
  logoUrl: string | null;
  average: number | null;
  total: number;
  showRating: boolean;
  contact: Contact | null;
  bookHref: string;
  bookLabel: string;
}) {
  const phone = safePhone(contact?.phone ?? null) ? contact!.phone : null;
  const whatsapp = safePhone(contact?.whatsapp ?? null) ? contact!.whatsapp : null;
  const mapsCandidate = contact ? mapsHref(contact.mapsUrl, contact.address) : null;
  const maps = safeUrl(mapsCandidate) ? mapsCandidate : null;
  const socials = contact ? SOCIALS.filter((k) => safeUrl(contact[k])) : [];

  return (
    <div className="card relative !p-6 text-center shadow-lg shadow-black/5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="-mt-16 mx-auto h-24 w-24 rounded-full border-4 border-white bg-white object-cover shadow-md" />
      ) : (
        <div aria-hidden className="-mt-16 mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-brand text-3xl font-bold text-brand-fg shadow-md">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}

      <h1 className="mt-3 text-balance text-2xl font-bold leading-tight tracking-tight">{name}</h1>
      {tagline && <p className="mt-1 text-balance text-sm text-neutral-500">{tagline}</p>}

      {showRating && (
        <a href="#resenas" className="mt-3 inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
          {total > 0 && average !== null ? (
            <>
              <span className="font-semibold text-neutral-900">{average.toFixed(1)}</span>
              <Stars value={average} />
              <span>
                ({total} {total === 1 ? "reseña" : "reseñas"})
              </span>
            </>
          ) : (
            <span>Sé el primero en dejar una reseña</span>
          )}
        </a>
      )}

      <a href={bookHref} className="btn mt-5 w-full !rounded-2xl !py-4 text-base font-semibold shadow-md transition hover:shadow-lg">
        {bookLabel}
      </a>

      {contact && (contact.address || maps) && (
        <div className="mt-5 border-t border-neutral-100 pt-4 text-sm">
          {contact.address && (
            <p className="text-neutral-700">
              <span aria-hidden className="mr-1">
                📍
              </span>
              {contact.address}
            </p>
          )}
          {maps && (
            <a href={maps} {...EXTERNAL} className="mt-1 inline-block font-medium underline underline-offset-2">
              Cómo llegar
            </a>
          )}
        </div>
      )}

      {(phone || whatsapp || socials.length > 0) && (
        <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-neutral-100 pt-4">
          {whatsapp && (
            <a href={whatsappHref(whatsapp)} {...EXTERNAL} className="rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm font-medium hover:bg-neutral-100">
              WhatsApp
            </a>
          )}
          {phone && (
            <a href={telHref(phone)} className="rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm font-medium hover:bg-neutral-100">
              {prettyPhone(phone)}
            </a>
          )}
          {contact &&
            socials.map((k) => (
              <a key={k} href={contact[k]!} {...EXTERNAL} className="rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm font-medium hover:bg-neutral-100">
                {SOCIAL_LABELS[k]}
              </a>
            ))}
        </div>
      )}
    </div>
  );
}
