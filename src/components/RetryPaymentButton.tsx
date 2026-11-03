"use client";

import { useState } from "react";

/** Genera un cobro nuevo y lleva al cliente a Mercado Pago. Muestra el motivo si no se puede reintentar. */
export function RetryPaymentButton({ a, t, label = "Reintentar pago" }: { a: string; t: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, t }) });
      const j = (await res.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
      if (res.ok && j.checkoutUrl) {
        window.location.href = j.checkoutUrl; // el botón queda ocupado hasta salir
        return;
      }
      setError(j.error ?? "No se pudo reintentar. Probá de nuevo.");
    } catch {
      setError("No hay conexión. Probá de nuevo.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn w-full" onClick={retry} disabled={busy}>
        {busy ? "Redirigiendo a Mercado Pago…" : `↻ ${label}`}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
