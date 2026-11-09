import { redirect } from "next/navigation";

/** Ahora vive dentro de «Personalización». */
export default function ProfileRedirect() {
  redirect("/admin/personalizacion#mi-pagina");
}
