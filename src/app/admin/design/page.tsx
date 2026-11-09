import { notFound, redirect } from "next/navigation";
import { FEATURES } from "@/lib/features";

/** Editor de diseño: ahora vive dentro de «Personalización» y está apagado (ver src/lib/features.ts). */
export default function DesignRedirect() {
  if (!FEATURES.DESIGN_EDITOR) notFound();
  redirect("/admin/personalizacion#diseno");
}
