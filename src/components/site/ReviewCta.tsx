import { Stars } from "@/components/site/Stars";
import Link from "next/link";

/**
 * Invitación bien visible a dejar una reseña (lleva a la sección de reseñas de la página del negocio).
 * `after` = ya pidió su turno: el mensaje insiste en que cuente cómo le fue después de venir.
 */
export function ReviewCta({ slug, after = false }: { slug: string; after?: boolean }) {
  return (
    <section aria-label="Dejá tu reseña" className="card card-ink overflow-hidden !rounded-[2rem] p-6 text-center">
      <Stars value={5} size={30} className="justify-center" />
      <h2 className="mt-2 text-xl font-light text-primary">{after ? "Después de tu turno, ¡contanos cómo te fue!" : "¿Ya te atendimos? ¡Dejá tu reseña!"}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm opacity-80">
        {after
          ? "Tu opinión nos ayuda a mejorar y a que otras personas se animen a reservar. Te lleva menos de un minuto."
          : "Tu opinión ayuda a otros clientes a elegir y a nosotros a mejorar. Te lleva menos de un minuto."}
      </p>
      <Link href={`/b/${slug}#resenas`} className="btn mt-4 !rounded-full !px-7 !py-3 font-semibold shadow-md">
        Dejar una reseña
      </Link>
    </section>
  );
}
