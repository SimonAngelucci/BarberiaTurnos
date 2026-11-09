import { headers } from "next/headers";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { payConfig } from "@/lib/payments";
import { resolveConfig } from "@/lib/page-config";
import { DesignEditor } from "@/components/page/DesignEditor";
import { asBusinessType } from "@/lib/service-icons";

export async function DesignSection() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const [services, barbers] = await Promise.all([
    prisma.service.findMany({ where: { businessId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Diseño de tu página</h1>
        <p className="text-sm opacity-70">Editá cómo ven tus clientes la página de reservas. Los cambios se publican cuando tocás «Guardar y publicar».</p>
      </div>
      <DesignEditor
        initial={resolveConfig(b.pageConfig)}
        business={{ name: b.name, tagline: b.tagline, logoUrl: b.logoUrl, primaryColor: b.primaryColor, bgColor: b.bgColor }}
        publicUrl={`${proto}://${host}/b/${b.slug}`}
        booking={{
          slug: b.slug,
          timezone: b.timezone,
          currency: b.currency,
          maxAdvanceDays: Math.min(b.maxAdvanceDays, 60),
          pay: payConfig(b),
          businessType: asBusinessType(b.businessType),
          services: services.map((s) => ({ id: s.id, name: s.name, description: s.description, priceCents: s.priceCents, durationMin: s.durationMin, iconKey: s.iconKey, iconUrl: s.iconUrl })),
          barbers: barbers.map((x) => ({ id: x.id, name: x.name, photoUrl: x.photoUrl, bio: x.bio })),
        }}
      />
    </div>
  );
}
