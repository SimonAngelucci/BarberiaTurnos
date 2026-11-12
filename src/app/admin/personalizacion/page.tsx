import { FEATURES } from "@/lib/features";
import { BusinessSection } from "./_sections/Business";
import { DesignSection } from "./_sections/Design";
import { ProfileSection } from "./_sections/Profile";

export const dynamic = "force-dynamic";

/**
 * Personalización: Negocio, Diseño (si está activo, ver src/lib/features.ts) y Mi página en una sola pantalla, una sección
 * debajo de la otra. Las secciones conservan su id (#negocio, #diseno, #mi-pagina) para los links directos; ya no hay barra
 * flotante de atajos.
 */
export default async function CustomizePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Personalización</h1>
      <section id="negocio" className="scroll-mt-4">
        <BusinessSection welcome={welcome} />
      </section>
      {FEATURES.DESIGN_EDITOR && (
        <section id="diseno" className="scroll-mt-4">
          <DesignSection />
        </section>
      )}
      <section id="mi-pagina" className="scroll-mt-4">
        <ProfileSection />
      </section>
    </div>
  );
}
