"use client";

import { useEffect } from "react";
import { saveBooked } from "@/lib/booking-storage";

/** Sin interfaz: al ver la confirmación, guarda el turno en este navegador para avisar «Ya tenés tu turno» en la página del negocio. */
export function RememberTurn({ slug, startAt, serviceName, claimCode }: { slug: string; startAt: string; serviceName: string; claimCode: string }) {
  useEffect(() => {
    saveBooked(slug, { startAt, serviceName, claimCode });
  }, [slug, startAt, serviceName, claimCode]);
  return null;
}