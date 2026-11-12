import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="card space-y-4 text-center">
        <h1 className="text-2xl font-bold">Turnos online para tu negocio</h1>
        <p className="text-neutral-600">
          Creá tu página de reservas, recibí tu link propio para que tus clientes reserven y administrá turnos, servicios y horarios desde el panel.
          Para barberías, estética, uñas, tatuajes, consultorios y más.
        </p>
        <Link href="/registro" className="btn w-full">
          Comenzar mis turnos
        </Link>
        <Link href="/admin/login" className="btn-ghost w-full">
          Ya tengo cuenta
        </Link>
      </div>
    </main>
  );
}
