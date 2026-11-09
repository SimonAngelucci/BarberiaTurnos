import { redirect } from "next/navigation";

/** Ahora vive dentro de «Personalización». */
export default async function SettingsRedirect({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  redirect(`/admin/personalizacion${welcome ? "?welcome=1" : ""}#negocio`);
}
