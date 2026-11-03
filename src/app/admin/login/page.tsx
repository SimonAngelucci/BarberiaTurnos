"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace("/admin");
      router.refresh();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Error");
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-sm">
      <form onSubmit={onSubmit} className="card space-y-4">
        <h1 className="text-xl font-bold">Ingresar al panel</h1>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" required className="input" autoComplete="username" />
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input name="password" type="password" required className="input" autoComplete="current-password" />
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button className="btn w-full" disabled={busy}>
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
