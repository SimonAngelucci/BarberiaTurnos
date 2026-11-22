"use client";

import { useEffect, useState } from "react";
import { Ring } from "./ui/Ring";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/**
 * «Próximo turno en»: días, horas y minutos en tres anillos. `nowAt` (hora del servidor) da el primer render, así coincide con
 * el HTML del servidor; después se actualiza cada 30 s. Los anillos son decorativos: el valor está en el número y en el aria-label.
 */
export function NextCountdown({ startAt, nowAt }: { startAt: string; nowAt: string }) {
  const [now, setNow] = useState(() => new Date(nowAt).getTime());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const diff = Math.max(0, new Date(startAt).getTime() - now);
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  const mins = Math.floor((diff % HOUR) / MIN);

  return (
    <div role="group" aria-label={`Próximo turno en ${days} días, ${hours} horas y ${mins} minutos`} className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Ring value={Math.min(days, 7) / 7} label="Días" size={38}>
        {days}
      </Ring>
      <Ring value={hours / 24} label="Horas" size={38}>
        {hours}
      </Ring>
      <Ring value={mins / 60} label="Min" size={38}>
        {mins}
      </Ring>
    </div>
  );
}
