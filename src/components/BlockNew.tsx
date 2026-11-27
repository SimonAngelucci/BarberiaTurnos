"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BlockForm } from "./BlockForm";

/** «Nuevo bloqueo» de la pantalla Horarios: al guardar, avisa y deja el formulario vacío para cargar otro. */
export function BlockNew({ barbers, tz, today }: { barbers: { id: string; name: string }[]; tz: string; today: string }) {
  const router = useRouter();
  const [gen, setGen] = useState(0);
  const [ok, setOk] = useState(false);
  return (
    <div>
      {ok && (
        <p role="status" className="mb-3 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white">
          Bloqueo guardado. Ya figura en «Bloqueos próximos».
        </p>
      )}
      <BlockForm
        key={gen}
        barbers={barbers}
        tz={tz}
        today={today}
        onDone={() => {
          setOk(true);
          setGen((g) => g + 1);
          router.refresh();
          setTimeout(() => setOk(false), 4000);
        }}
      />
    </div>
  );
}
