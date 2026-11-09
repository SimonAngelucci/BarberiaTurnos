import { BusinessSection } from "./_sections/Business";
import { DesignSection } from "./_sections/Design";
import { ProfileSection } from "./_sections/Profile";

export const dynamic = "force-dynamic";

const NAV = [
  { id: "negocio", label: "Negocio" },
  { id: "diseno", label: "Diseño" },
  { id: "mi-pagina", label: "Mi página" },
];

/** Personalización: Negocio, Diseño y Mi página en una sola pantalla, una sección debajo de la otra. */
export default async function CustomizePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Personalización</h1>
        <nav aria-label="Secciones" className="sticky top-0 z-20 -mx-1 mt-2 flex gap-1 overflow-x-auto bg-white/90 px-1 py-2 backdrop-blur">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="whitespace-nowrap rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-neutral-400">
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <section id="negocio" className="scroll-mt-16">
        <BusinessSection welcome={welcome} />
      </section>
      <section id="diseno" className="scroll-mt-16">
        <DesignSection />
      </section>
      <section id="mi-pagina" className="scroll-mt-16">
        <ProfileSection />
      </section>
    </div>
  );
}
