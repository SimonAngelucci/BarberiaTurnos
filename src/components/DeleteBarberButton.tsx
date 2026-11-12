"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { deleteBarber } from "@/app/admin/actions";

export function DeleteBarberButton({ id, name, futureCount }: { id: string; name: string; futureCount: number }) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAck = futureCount > 0;
  const plural = futureCount === 1 ? "" : "s";

  function close() {
    if (busy) return;
    setOpen(false);
    setAck(false);
    setError(null);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    if (ack) fd.set("cancelFuture", "on");
    const res = await deleteBarber(fd).catch(() => ({ ok: false as const, error: "No se pudo eliminar. Intentá de nuevo." }));
    setBusy(false);
    // Si salió bien, la lista se actualiza sola (revalidatePath) y este componente desaparece con su tarjeta.
    if (!res.ok) setError(res.error);
  }

  return (
    <>
      <button type="button" className="text-sm text-red-600 underline" onClick={() => setOpen(true)}>
        Eliminar profesional
      </button>

      <Modal open={open} onClose={close} title={`¿Eliminar a ${name}?`} locked={busy}>
        <div className="space-y-3 text-sm">
          <p>Esta acción es <strong>permanente</strong>: se borran el profesional, su foto y sus horarios. Los turnos pasados quedan en el historial.</p>

          {needsAck && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <p>
                <strong>
                  Tiene {futureCount} turno{plural} futuro{plural} confirmado{plural}.
                </strong>{" "}
                Si lo eliminás, se cancelarán y cada cliente recibirá el aviso de cancelación por WhatsApp.
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>Entiendo que se cancelarán {futureCount} turno{plural} y se avisará a los clientes.</span>
              </label>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 p-2 text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || (needsAck && !ack)}
            className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition active:scale-[.98] disabled:opacity-50"
          >
            {busy ? "Eliminando…" : needsAck ? `Cancelar turnos y eliminar` : "Eliminar"}
          </button>
        </div>
      </Modal>
    </>
  );
}
