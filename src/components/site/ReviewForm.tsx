"use client";

import { useState } from "react";

/** Formulario para que un cliente deje su reseña. Va a /api/reviews y queda pendiente hasta que el administrador la apruebe. */
export function ReviewForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!rating) return setError("Elegí una puntuación de 1 a 5 estrellas.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, authorName: fd.get("authorName"), rating, comment: fd.get("comment"), website: fd.get("website") }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No pudimos enviar tu reseña. Intentá de nuevo.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar tu reseña.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="card text-center text-sm">
        ¡Gracias por tu reseña! Va a aparecer en la página cuando el negocio la apruebe.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="text-center">
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost !px-5 !py-2.5">
          ✍️ Dejar una reseña
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h3 className="font-semibold">Tu opinión</h3>
      <div>
        <span className="label">Puntuación</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Puntuación">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
              onClick={() => setRating(n)}
              className={`text-3xl leading-none transition active:scale-90 ${n <= rating ? "text-amber-500" : "text-neutral-300 hover:text-amber-300"}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="rv-name">
          Tu nombre
        </label>
        <input id="rv-name" name="authorName" required minLength={2} maxLength={40} autoComplete="given-name" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="rv-comment">
          Comentario
        </label>
        <textarea id="rv-comment" name="comment" required minLength={5} maxLength={500} rows={4} className="input" />
      </div>
      {/* Campo trampa para bots: las personas no lo ven ni lo completan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn" disabled={busy}>
          {busy ? "Enviando…" : "Enviar reseña"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </button>
      </div>
      <p className="text-xs text-neutral-400">Tu reseña se publica después de que el negocio la revise.</p>
    </form>
  );
}
