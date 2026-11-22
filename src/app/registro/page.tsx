"use client";

import { Icon } from "@/components/ui/Icon";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PasswordPair } from "@/components/ui/PasswordPair";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatorCode, setCreatorCode] = useState("");

  // Los links de los creadores llegan como /registro?ref=JUAN20: el código queda completo.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setCreatorCode(ref.slice(0, 30).toUpperCase());
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password"), confirmPassword: fd.get("confirmPassword"), creatorCode: creatorCode.trim() || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      router.replace("/admin/personalizacion?welcome=1");
      router.refresh();
    } else {
      setBusy(false);
      setError(j.error ?? "Error inesperado");
    }
  }

  return (
    <main className="app-themed min-h-screen pb-10">
      <div className="hero-block px-6 pb-14 pt-12">
        <div className="mx-auto max-w-sm">
          <h1 className="text-3xl font-light tracking-tight">Comenzar mis turnos</h1>
          <p className="mt-2 text-sm opacity-80">Vas a recibir un link propio para que tus clientes reserven.</p>
        </div>
      </div>
      <div className="mx-auto -mt-8 max-w-sm px-4">
      <form onSubmit={onSubmit} className="card space-y-4">
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
          <Icon name="gift" size={16} className="mr-1.5 inline -translate-y-px" /><strong>1 mes de prueba gratis</strong>, sin tarjeta. No se cobra nada durante la prueba.
        </p>
        <div>
          <label className="label">Nombre de tu negocio</label>
          <input name="name" required minLength={2} maxLength={60} className="input" placeholder="Ej: Estudio Luna" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" required className="input" autoComplete="username" />
        </div>
        <PasswordPair newName="password" newLabel="Contraseña" hint="Mínimo 8 caracteres." />

        <div>
          <label className="label">
            Código de creador <span className="font-normal text-neutral-400">(opcional)</span>
          </label>
          <input
            className="input font-mono uppercase tracking-wide"
            value={creatorCode}
            onChange={(e) => setCreatorCode(e.target.value.toUpperCase())}
            maxLength={30}
            placeholder="Ej: JUAN20"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button className="btn w-full" disabled={busy}>
          {busy ? "Creando…" : "Comenzar mis turnos"}
        </button>
        <p className="text-center text-sm text-neutral-500">
          ¿Ya tenés cuenta?{" "}
          <Link href="/admin/login" className="underline">
            Ingresar
          </Link>
        </p>
      </form>
      </div>
    </main>
  );
}
