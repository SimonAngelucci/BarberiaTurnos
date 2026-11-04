"use client";

import { useRouter } from "next/navigation";

export function SuperLogout() {
  const router = useRouter();
  return (
    <button
      className="btn-ghost"
      onClick={async () => {
        await fetch("/api/superadmin/logout", { method: "POST" });
        router.replace("/superadmin/login");
        router.refresh();
      }}
    >
      Salir
    </button>
  );
}
