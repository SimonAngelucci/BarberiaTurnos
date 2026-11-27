"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Icon } from "./ui/Icon";
import { BlockForm } from "./BlockForm";
import { blockFormValues, blockLabel, type BlockCard } from "@/lib/blocks";
import { removeBlock } from "@/app/admin/schedule/block-actions";

/** Bloqueo listo para mostrar (fechas en ISO: viene del servidor). */
export type BlockCardData = { id: string; groupId: string | null; barberId: string | null; barberName: string | null; startAt: string; endAt: string; lastStart: string; lastEnd: string; reason: string | null; count: number; pattern: "single" | "weekly" | "daily" };

const toCard = (c: BlockCardData): BlockCard => ({ id: c.id, groupId: c.groupId, barberId: c.barberId, reason: c.reason, count: c.count, pattern: c.pattern, startAt: new Date(c.startAt), endAt: new Date(c.endAt), lastStart: new Date(c.lastStart), lastEnd: new Date(c.lastEnd) });

/** «Bloqueos próximos»: una tarjeta por bloqueo (las repeticiones se juntan en una), con editar y quitar. */
export function BlockList({ cards, barbers, tz, today }: { cards: BlockCardData[]; barbers: { id: string; name: string }[]; tz: string; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(c: BlockCardData, scope: "one" | "series") {
    if (scope === "series" && !window.confirm("¿Quitar toda la repetición? Los horarios vuelven a estar disponibles.")) return;
    setBusy(c.id);
    await removeBlock(c.id, scope).catch(() => {});
    setBusy(null);
    router.refresh();
  }

  if (cards.length === 0) return <p className="text-sm text-muted">No hay bloqueos próximos.</p>;

  return (
    <ul className="space-y-3">
      {cards.map((c) => {
        const card = toCard(c);
        const s = DateTime.fromISO(c.startAt).setZone(tz).setLocale("es");
        const last = DateTime.fromISO(c.lastStart).setZone(tz).setLocale("es");
        const label = blockLabel(card.startAt, card.endAt, tz);
        const dateText =
          c.pattern === "weekly"
            ? `Todos los ${s.toFormat("cccc").replace(/o$/, "os")} · hasta el ${last.toFormat("d/MM")} (${c.count} veces)`
            : c.pattern === "daily"
              ? `Del ${s.toFormat("d/MM")} al ${last.toFormat("d/MM")}`
              : label.startsWith("Del ")
                ? ""
                : s.toFormat("cccc d 'de' LLLL");
        return (
          <li key={c.id} className="rounded-2xl border border-black/10 p-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted">
                <Icon name="lock" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {label.startsWith("Del ") ? label : label}
                  {c.pattern !== "single" && <Icon name="repeat" size={14} className="ml-1.5 inline -translate-y-px text-muted" />}
                </div>
                {dateText && <div className="text-sm text-muted first-letter:uppercase">{dateText}</div>}
                <div className="mt-0.5 text-sm text-muted">
                  {c.barberName ?? "Todo el negocio"}
                  {c.reason ? ` · ${c.reason}` : ""}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost !rounded-full !px-3.5 !py-1.5 text-sm" onClick={() => setEditing(editing === c.id ? null : c.id)} aria-expanded={editing === c.id}>
                <Icon name="pencil" size={14} className="mr-1 inline -translate-y-px" />
                Editar
              </button>
              {c.count > 1 ? (
                <>
                  <button type="button" disabled={busy === c.id} className="btn-ghost !rounded-full !px-3.5 !py-1.5 text-sm" onClick={() => remove(c, "one")}>
                    Quitar solo el próximo
                  </button>
                  <button type="button" disabled={busy === c.id} className="btn-ghost !rounded-full !px-3.5 !py-1.5 text-sm" onClick={() => remove(c, "series")}>
                    <Icon name="trash" size={14} className="mr-1 inline -translate-y-px" />
                    Quitar toda la serie
                  </button>
                </>
              ) : (
                <button type="button" disabled={busy === c.id} className="btn-ghost !rounded-full !px-3.5 !py-1.5 text-sm" onClick={() => remove(c, "one")}>
                  <Icon name="trash" size={14} className="mr-1 inline -translate-y-px" />
                  Desbloquear
                </button>
              )}
            </div>
            {editing === c.id && (
              <div className="mt-3 border-t border-black/10 pt-3">
                <BlockForm
                  barbers={barbers}
                  tz={tz}
                  today={today}
                  initial={blockFormValues(card, tz)}
                  replace={{ id: c.id, scope: c.count > 1 ? "series" : "one" }}
                  submitLabel="Guardar cambios"
                  onCancel={() => setEditing(null)}
                  onDone={() => {
                    setEditing(null);
                    router.refresh();
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
