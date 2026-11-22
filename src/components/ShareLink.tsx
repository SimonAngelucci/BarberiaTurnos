"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/Icon";

/** Link de la página de reservas: URL corta (sin https://www.) en una fila con copiar y compartir a la derecha. */
export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => void (timer.current && clearTimeout(timer.current));
  }, []);
  const short = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const btn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-95";

  return (
    <div className="mt-1 flex items-center gap-2">
      <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold">
        {short}
      </a>
      <button
        type="button"
        aria-label={copied ? "Copiado" : "Copiar link"}
        title="Copiar link"
        className={`${btn} ${copied ? "border-transparent bg-primary text-on-primary" : "border-[color-mix(in_srgb,currentColor_20%,transparent)]"}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1600);
          } catch {
            /* sin permiso de portapapeles */
          }
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={18} />
      </button>
      {canShare && (
        <button
          type="button"
          aria-label="Compartir link"
          title="Compartir link"
          className={`${btn} border-[color-mix(in_srgb,currentColor_20%,transparent)]`}
          onClick={() => void navigator.share({ url, title: "Reservá tu turno" }).catch(() => {})}
        >
          <Icon name="share" size={18} />
        </button>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copiado" : ""}
      </span>
    </div>
  );
}