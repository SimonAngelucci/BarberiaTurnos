import { DateTime } from "luxon";
import { Stars } from "./Stars";
import { ReviewForm } from "./ReviewForm";

export type ReviewView = { id: string; authorName: string; rating: number; comment: string; createdAt: Date };

/** Reseñas aprobadas (promedio + tarjetas) y el formulario para dejar una nueva. Todo el texto se muestra como texto plano. */
export function Reviews({ slug, reviews, average, total, timezone }: { slug: string; reviews: ReviewView[]; average: number | null; total: number; timezone: string }) {
  return (
    <div className="space-y-4">
      {total > 0 && average !== null && (
        <div className="flex items-center gap-3">
          <span className="text-4xl font-extrabold tabular-nums">{average.toFixed(1)}</span>
          <div>
            <Stars value={average} className="text-xl" />
            <p className="text-sm opacity-70">
              {total} {total === 1 ? "reseña" : "reseñas"}
            </p>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm opacity-70">Todavía no hay reseñas. ¡Sé el primero en dejar la tuya!</p>
      ) : (
        <ul className="grid gap-x-10 sm:grid-cols-2">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] py-5">
              <div className="flex items-center justify-between gap-2">
                <Stars value={r.rating} />
                <span className="text-xs opacity-50">{DateTime.fromJSDate(r.createdAt).setZone(timezone).setLocale("es").toFormat("LLL yyyy")}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{r.comment}</p>
              <p className="mt-auto text-sm font-semibold">{r.authorName}</p>
            </li>
          ))}
        </ul>
      )}

      <ReviewForm slug={slug} />
    </div>
  );
}
