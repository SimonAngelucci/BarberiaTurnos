"use client";

import { useEffect, useRef } from "react";

/** Modal accesible basado en <dialog>: foco atrapado, Esc para cerrar y clic afuera para cerrar. */
export function Modal({
  open,
  onClose,
  title,
  children,
  locked = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** true = no se puede cerrar (ej. mientras se procesa una acción) */
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => locked && e.preventDefault()}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current && !locked) onClose();
      }}
      className="m-auto w-[92vw] max-w-md rounded-2xl bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/50"
    >
      {open && (
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
