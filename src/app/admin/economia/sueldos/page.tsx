import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { loadSalaries } from "@/lib/salary-db";
import { SueldosView } from "./view";

export const dynamic = "force-dynamic";

/** Sueldos de los profesionales: solo el administrador del negocio (requireAdmin) y solo de su propio negocio. */
export default async function SueldosPage() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const [{ today, list }, services] = await Promise.all([
    loadSalaries(businessId, b.timezone, new Date()),
    prisma.service.findMany({ where: { businessId, archived: false }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return <SueldosView today={today} list={list} services={services} tz={b.timezone} currency={b.currency} />;
}
