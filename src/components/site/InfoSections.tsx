import { SOCIAL_LABELS, mapsHref, prettyPhone, telHref, whatsappHref } from "@/lib/profile";

type Profile = {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
};

/** Texto libre del administrador: se muestra como texto plano (respeta los saltos de línea), nunca como HTML. */
export function TextCard({ text }: { text: string }) {
  return (
    <div className="card">
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{text}</p>
    </div>
  );
}

const SOCIALS = ["instagram", "facebook", "tiktok", "youtube", "website"] as const;
const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" } as const;

export const hasContact = (p: Profile) => !!(p.phone || p.whatsapp || p.email || p.address || p.mapsUrl || SOCIALS.some((k) => p[k]));

// Los datos ya se validaron al guardarse; esto es un segundo seguro al mostrarlos (solo http(s) y teléfonos con formato internacional).
const safeUrl = (u: string | null): u is string => !!u && /^https?:\/\//i.test(u);
const safePhone = (v: string | null): v is string => !!v && /^\+\d{6,15}$/.test(v);

export function ContactCard({ p: raw }: { p: Profile }) {
  const p = { ...raw, phone: safePhone(raw.phone) ? raw.phone : null, whatsapp: safePhone(raw.whatsapp) ? raw.whatsapp : null };
  const mapsCandidate = mapsHref(p.mapsUrl, p.address);
  const maps = safeUrl(mapsCandidate) ? mapsCandidate : null;
  const socials = SOCIALS.filter((k) => safeUrl(p[k]));
  return (
    <div className="card space-y-4">
      {(p.whatsapp || p.phone || p.email) && (
        <div className="flex flex-wrap gap-2">
          {p.whatsapp && (
            <a href={whatsappHref(p.whatsapp)} {...EXTERNAL} className="btn">
              WhatsApp
            </a>
          )}
          {p.phone && (
            <a href={telHref(p.phone)} className="btn-ghost !px-4 !py-2.5">
              Llamar · {prettyPhone(p.phone)}
            </a>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className="btn-ghost !px-4 !py-2.5 break-all">
              {p.email}
            </a>
          )}
        </div>
      )}

      {(p.address || maps) && (
        <div className="space-y-2">
          {p.address && (
            <p className="text-sm">
              <span className="mr-1" aria-hidden>
                📍
              </span>
              {p.address}
            </p>
          )}
          {maps && (
            <a href={maps} {...EXTERNAL} className="btn-ghost !px-4 !py-2.5">
              Cómo llegar · Google Maps
            </a>
          )}
        </div>
      )}

      {socials.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {socials.map((k) => (
            <a key={k} href={p[k]!} {...EXTERNAL} className="rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm font-medium hover:bg-neutral-100">
              {SOCIAL_LABELS[k]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
