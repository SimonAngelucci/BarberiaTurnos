"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Consulta el estado del turno cada pocos segundos y refresca la página cuando deja de estar pendiente. */
export function PaymentPoller({ a, t }: { a: string; t: string }) {
  const router = useRouter();

  useEffect(() => {
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(`/api/appointments/status?a=${encodeURIComponent(a)}&t=${encodeURIComponent(t)}`, { cache: "no-store" });
        const j = (await r.json()) as { status?: string };
        if (j.status && j.status !== "PENDING_PAYMENT") {
          clearInterval(id);
          router.refresh();
        }
      } catch {
        /* reintenta en el próximo ciclo */
      }
      if (tries >= 60) clearInterval(id); // ~3 min; después alcanza con recargar
    }, 3000);
    return () => clearInterval(id);
  }, [a, t, router]);

  return <p className="text-xs text-neutral-400">Actualizando automáticamente…</p>;
}
