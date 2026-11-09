import { redirect } from "next/navigation";

/** Ahora vive dentro de «Personalización». */
export default function DesignRedirect() {
  redirect("/admin/personalizacion#diseno");
}
