"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      router.replace("/admin/settings?welcome=1");
      router.refresh();
    } else {
      setBusy(false);
      setError(j.error ?? "Error inesperado");
    }
  }

  return (
    <main className="mx-auto mt-12 max-w-sm px-4">
      <form onSubmit={onSubmit} className="card space-y-4">
        <h1 className="text-xl font-bold">Crear mi barbería</h1>
        <p className="text-sm text-neutral-500">Vas a recibir un link propio para que tus clientes reserven.</p>
        <div>
          <label className="label">Nombre de la barbería</label>
          <input name="name" required minLength={2} maxLength={60} className="input" placeholder="Barbería Don Pepe" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" required className="input" autoComplete="username" />
        </div>
        <div>
          <label className="label">Contraseña (mín. 8 caracteres)</label>
          <input name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button className="btn w-full" disabled={busy}>
          {busy ? "Creando…" : "Crear barbería"}
        </button>
        <p className="text-center text-sm text-neutral-500">
          ¿Ya tenés cuenta?{" "}
          <Link href="/admin/login" className="underline">
            Ingresar
          </Link>
        </p>
      </form>
    </main>
  );
}
