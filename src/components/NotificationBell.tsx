"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Notice } from "@/lib/notifications";

const ICON: Record<Notice["kind"], string> = { new: "🆕", cancel: "❌", reschedule: "🔁", reminder: "⏰" };
const TONE: Record<Notice["kind"], string> = {
  new: "bg-green-50",
  cancel: "bg-red-50",
  reschedule: "bg-violet-50",
  reminder: "bg-amber-50",
};

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} d`;
}

/** Campanita de avisos del panel: nuevos turnos, cancelaciones, reprogramaciones y turnos por empezar. Se actualiza sola. */
export function NotificationBell() {
  const [data, setData] = useState<{ unread: number; items: Notice[] } | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  async function markRead() {
    await fetch("/api/admin/notifications", { method: "POST" }).catch(() => {});
    setData((d) => (d ? { unread: d.items.filter((i) => i.kind === "reminder").length, items: d.items.map((i) => (i.kind === "reminder" ? i : { ...i, unread: false })) } : d));
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
        aria-expanded={open}
        className="relative rounded-lg px-3 py-2 text-lg hover:bg-neutral-100"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Notificaciones" className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between px-2 py-1.5">
            <h2 className="font-semibold">Notificaciones</h2>
            {data && data.items.some((i) => i.unread && i.kind !== "reminder") && (
              <button type="button" onClick={markRead} className="text-xs font-medium underline">
                Marcar como leídas
              </button>
            )}
          </div>
          {!data || data.items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-neutral-500">Todavía no hay novedades. Acá vas a ver los turnos nuevos, las cancelaciones y los turnos por empezar.</p>
          ) : (
            <ul className="space-y-1">
              {data.items.map((n) => (
                <li key={n.id} className={`flex gap-3 rounded-xl p-2.5 ${n.unread ? TONE[n.kind] : ""}`}>
                  <span aria-hidden className="text-lg">
                    {ICON[n.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm ${n.unread ? "font-semibold" : "font-medium"}`}>{n.title}</span>
                      {n.kind !== "reminder" && <span className="shrink-0 text-[11px] text-neutral-500">{ago(n.at)}</span>}
                    </div>
                    <div className="text-sm text-neutral-600">{n.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <a href="/admin/turnos" className="mt-1 block rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-medium hover:bg-neutral-200">
            Abrir vista de Turnos
          </a>
        </div>
      )}
    </div>
  );
}
