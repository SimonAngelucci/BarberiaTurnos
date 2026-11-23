"use client";

import { Icon } from "@/components/ui/Icon";

type Props = { title: string; startISO: string; endISO: string; address: string | null; mapsUrl: string | null; shareText: string };

const ics = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");

const btn = "flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface px-2 py-3 text-xs font-semibold transition active:scale-[.97]";
const ico = "flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-primary";

/** Acciones del turno confirmado: agregar al calendario (archivo .ics), compartir y cómo llegar. */
export function ConfirmActions({ title, startISO, endISO, address, mapsUrl, shareText }: Props) {
  function addToCalendar() {
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Turnos//ES",
      "BEGIN:VEVENT",
      `UID:${ics(startISO)}-${Math.abs(title.length * 7919)}@turnos`,
      `DTSTAMP:${ics(new Date().toISOString())}`,
      `DTSTART:${ics(startISO)}`,
      `DTEND:${ics(endISO)}`,
      `SUMMARY:${esc(title)}`,
      ...(address ? [`LOCATION:${esc(address)}`] : []),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "turno.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title, text: shareText });
      else await navigator.clipboard.writeText(shareText);
    } catch {
      /* cancelado o sin permiso */
    }
  }

  return (
    <div className={`grid gap-2 ${mapsUrl ? "grid-cols-3" : "grid-cols-2"}`}>
      <button type="button" onClick={addToCalendar} className={btn}>
        <span className={ico}>
          <Icon name="calendar" size={18} />
        </span>
        Agregar al calendario
      </button>
      <button type="button" onClick={share} className={btn}>
        <span className={ico}>
          <Icon name="share" size={18} />
        </span>
        Compartir
      </button>
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          <span className={ico}>
            <Icon name="map-pin" size={18} />
          </span>
          Cómo llegar
        </a>
      )}
    </div>
  );
}