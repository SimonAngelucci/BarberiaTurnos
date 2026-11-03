"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={url} target="_blank" className="min-w-0 truncate text-sm underline">
        {url}
      </a>
      <button
        type="button"
        className="btn-ghost !px-2 !py-1 text-xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* sin permiso de portapapeles: el link igual es clickeable */
          }
        }}
      >
        {copied ? "¡Copiado!" : "Copiar link"}
      </button>
    </div>
  );
}
