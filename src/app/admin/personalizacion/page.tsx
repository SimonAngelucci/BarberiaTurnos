import { PageHero } from "@/components/ui/PageHero";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { FEATURES } from "@/lib/features";
import { PersonalizationFlow, type FlowStep } from "@/components/PersonalizationFlow";
import { BusinessSection } from "./_sections/Business";
import { DesignSection } from "./_sections/Design";
import { AboutStep, ContactStep, MediaStep, ReviewsStep } from "./_sections/Profile";

export const dynamic = "force-dynamic";

/**
 * Personalización por pasos: Negocio → (Diseño, si está activo: src/lib/features.ts) → Portada y galería → Acerca de →
 * Contacto → Reseñas. Cada paso conserva su propio formulario y su botón de guardar; el flujo agrega el acceso rápido
 * de arriba, el progreso y «Anterior / Siguiente». Los links viejos (#mi-pagina, #contacto…) siguen llevando al paso que corresponde.
 */
export default async function CustomizePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { businessId } = await requireAdmin();
  const pending = await prisma.review.count({ where: { businessId, status: "PENDING" } }).catch(() => 0);

  const steps: FlowStep[] = [
    { id: "negocio", label: "Negocio", node: <BusinessSection welcome={welcome} /> },
    ...(FEATURES.DESIGN_EDITOR ? [{ id: "diseno", label: "Diseño", node: <DesignSection /> } satisfies FlowStep] : []),
    { id: "portada", label: "Portada y galería", anchors: ["mi-pagina", "galeria"], node: <MediaStep /> },
    { id: "acerca", label: "Acerca de", node: <AboutStep /> },
    { id: "contacto", label: "Contacto", node: <ContactStep /> },
    { id: "resenas", label: "Reseñas", badge: pending, node: <ReviewsStep /> },
  ];

  return (
    <div className="space-y-5">
      <PageHero title="Personalización" back={{ href: "/admin", label: "Volver a Inicio" }} subtitle="Recorré las secciones con «Siguiente» o saltá directo a la que quieras desde arriba. Todo lo que cargues se ve en tu página de reservas." />
      <PersonalizationFlow steps={steps} />
    </div>
  );
}
