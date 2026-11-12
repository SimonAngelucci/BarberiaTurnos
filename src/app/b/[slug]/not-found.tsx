import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <div className="card space-y-3">
        <h1 className="text-xl font-bold">Este negocio no existe</h1>
        <p className="text-sm text-neutral-500">Revisá que el link esté bien escrito.</p>
        <Link href="/" className="btn w-full">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
