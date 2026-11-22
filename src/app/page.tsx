import { Icon, type IconName } from "@/components/ui/Icon";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { money } from "@/lib/format";
import { AppLogo } from "@/components/AppLogo";
import { ThemeCycleButton } from "@/components/ui/ThemeToggle";
import { CtaLink } from "@/components/landing/CtaLink";
import { PhoneMockup, ScheduleChips } from "@/components/landing/Mockups";

// Los planes salen de la base (se editan en el Super Admin); la página se regenera sola cada pocos minutos.
export const revalidate = 300;

const TITLE = "Turnos online para tu negocio: agenda llena, sin llamadas ni mensajes";
const DESC =
  "Creá la página de reservas de tu negocio en minutos. Tus clientes reservan solos, recibís recordatorios por WhatsApp y vos decidís cada horario. Para barberías, estética, uñas, tatuajes y consultorios. 1 mes gratis, sin tarjeta.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESC, type: "website", locale: "es_AR" },
  twitter: { card: "summary", title: TITLE, description: DESC },
};

const BTN_PRIMARY = "inline-flex items-center justify-center rounded-full bg-brand px-7 py-3.5 text-base font-semibold text-brand-fg shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0";
const BTN_LIGHT = "inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-base font-semibold text-neutral-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-neutral-100";
const BTN_GHOST = "inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-7 py-3.5 text-base font-semibold text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-50";

type PlanCard = { slug: string; name: string; description: string; price: string; limit: string; features: string[] };

async function loadPlans(): Promise<PlanCard[]> {
  try {
    const rows = await prisma.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] });
    return rows.map((p) => ({
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: money(p.priceCents, p.currency),
      limit: p.maxBarbers === null ? "Profesionales ilimitados" : `Hasta ${p.maxBarbers} ${p.maxBarbers === 1 ? "profesional" : "profesionales"}`,
      features: p.features,
    }));
  } catch {
    return []; // sin planes no se muestran precios: nunca se inventan
  }
}

const STEPS = [
  { n: "1", title: "Creá tu negocio", text: "Registrate con tu email y poné el nombre. En un minuto tenés tu panel y tu link propio." },
  { n: "2", title: "Cargá servicios y horarios", text: "Precio y duración de cada servicio, los días y horas que atendés, y quiénes atienden." },
  { n: "3", title: "Compartí tu link", text: "Ponelo en Instagram, WhatsApp o Google. Tus clientes reservan solos, a cualquier hora." },
  { n: "4", title: "Recibí turnos", text: "Te avisamos de cada turno nuevo y tus clientes reciben confirmación y recordatorio por WhatsApp." },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "globe", title: "Página propia, profesional", text: "Portada, galería de fotos y videos cortos, reseñas, mapa y contacto. Con tu logo y tus colores." },
  { icon: "calendar", title: "Reserva online en 2 pasos", text: "El cliente elige servicio, profesional, día y horario, y confirma. Sin llamadas, sin ida y vuelta." },
  { icon: "message", title: "WhatsApp automático", text: "Confirmación al reservar y recordatorios antes del turno, para que se cancelen menos." },
  { icon: "credit-card", title: "Señas y pagos con Mercado Pago", text: "Cobrá una seña o el total al reservar, directo en tu cuenta de Mercado Pago, o dejá pagar en el local." },
  { icon: "repeat", title: "Reprogramar y cancelar", text: "Tus clientes cambian su turno con un código, hasta el plazo que vos definas." },
  { icon: "users", title: "Varios profesionales", text: "Cada uno con su foto, su descripción y su propia agenda de días y horarios." },
  { icon: "star", title: "Reseñas con tu aprobación", text: "Tus clientes dejan su opinión y vos elegís qué se publica." },
  { icon: "palette", title: "Para tu rubro", text: "Barbería, estética, uñas, tatuajes, consultorio u otro: íconos y textos que se adaptan a lo que hacés." },
];

const OWNER: { icon: IconName; title: string; text: string }[] = [
  { icon: "clock", title: "Vista de Turnos en vivo", text: "Pantalla completa con los próximos turnos y colores de alerta según qué tan cerca está cada uno." },
  { icon: "bell", title: "Notificaciones en el panel", text: "Nuevos turnos, cancelaciones y reprogramaciones, sin tener que estar revisando." },
  { icon: "trending-up", title: "Economía", text: "Ingresos de la semana y del mes, comparados con el período anterior, más los ingresos manuales que quieras sumar." },
  { icon: "brain", title: "Aprende los tiempos de cada cliente", text: "Opcional: si un cliente suele tardar 35 min en un servicio de 45, la agenda lo reserva con su tiempo real." },
];

const FAQ = [
  { q: "¿Necesito tarjeta para empezar?", a: "No. Te registrás con tu email y tenés 1 mes de prueba gratis sin cargar ninguna tarjeta." },
  { q: "¿Qué pasa cuando termina el mes gratis?", a: "Elegís un plan desde tu panel. Si no lo hacés, tu cuenta pasa a modo solo lectura: no perdés tus datos, pero no recibe reservas nuevas hasta que elijas un plan." },
  { q: "¿Mis clientes tienen que instalar algo o crear una cuenta?", a: "No. Entran a tu link desde el celular o la compu, eligen el turno y listo. Solo piden nombre y WhatsApp." },
  { q: "¿Sirve para algo más que barberías?", a: "Sí. Está pensado para cualquier negocio con turnos: estética, uñas, tatuajes, consultorios y más. Elegís tu rubro en el panel." },
  { q: "¿Puedo elegir yo los horarios?", a: "Sí. Cargás los horarios que quieras para cada día de la semana y tus clientes ven exactamente esos. Cuando alguien reserva uno, ese horario deja de estar disponible para los demás." },
  { q: "¿Puedo cobrar señas?", a: "Sí, con tu propia cuenta de Mercado Pago. Elegís si el cliente paga una seña, el total o abona en el local." },
  { q: "¿Puedo cancelar cuando quiera?", a: "Sí, desde la sección Suscripción de tu panel. Seguís con acceso hasta el fin del período pago." },
];

function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 px-5 py-16 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Heading({ eyebrow, title, text, light = false, center = true }: { eyebrow?: string; title: string; text?: string; light?: boolean; center?: boolean }) {
  return (
    <header className={`mb-10 max-w-2xl sm:mb-14 ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className={`mb-2 text-sm font-bold uppercase tracking-widest ${light ? "text-emerald-300" : "text-emerald-600"}`}>{eyebrow}</p>}
      <h2 className={`text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl ${light ? "text-white" : "text-neutral-900"}`}>{title}</h2>
      {text && <p className={`mt-3 text-lg ${light ? "text-neutral-300" : "text-neutral-600"}`}>{text}</p>}
    </header>
  );
}

export default async function Landing() {
  const plans = await loadPlans();
  const featured = plans.find((p) => p.slug === "pro") ?? plans[Math.floor(plans.length / 2)];

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="app-themed text-neutral-900" style={{ scrollBehavior: "smooth" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* Barra superior */}
      <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <AppLogo size={32} />
            Turnos
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-6 text-sm font-medium text-neutral-600 md:flex">
            <a href="#como-funciona" className="hover:text-neutral-900">Cómo funciona</a>
            <a href="#funciones" className="hover:text-neutral-900">Funciones</a>
            <a href="#planes" className="hover:text-neutral-900">Planes</a>
            <a href="#preguntas" className="hover:text-neutral-900">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeCycleButton />
            <Link href="/admin/login" className="rounded-full px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
              Ingresar
            </Link>
            <CtaLink where="header" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:brightness-110">
              Comenzar gratis
            </CtaLink>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-16 pt-12 sm:pb-24 sm:pt-20">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(16,185,129,0.14),transparent)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="animate-rise text-center lg:text-left">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-sm font-semibold text-emerald-800">
                <Icon name="gift" size={16} />1 mes gratis · Sin tarjeta
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Llená tu agenda y dejá de coordinar turnos <span className="text-emerald-600">a mano</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 sm:text-xl lg:mx-0">
                Tu propia página de reservas, lista en minutos. Tus clientes eligen su turno solos, reciben recordatorios por WhatsApp y vos ahorrás horas de mensajes y llamadas.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <CtaLink where="hero" className={BTN_PRIMARY}>
                  Comenzar mi mes gratis
                </CtaLink>
                <a href="#como-funciona" className={BTN_GHOST}>
                  Ver cómo funciona
                </a>
              </div>
              <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-neutral-600 lg:justify-start">
                <li className="flex items-center gap-1.5"><Icon name="check" size={16} className="text-emerald-600" />Listo en minutos</li>
                <li className="flex items-center gap-1.5"><Icon name="check" size={16} className="text-emerald-600" />Funciona en el celular</li>
                <li className="flex items-center gap-1.5"><Icon name="check" size={16} className="text-emerald-600" />Sin instalar nada</li>
              </ul>
            </div>
            <div className="animate-rise" style={{ animationDelay: "120ms" }}>
              <PhoneMockup />
              <p className="mt-4 text-center text-xs text-neutral-400">Vista de ejemplo de una página de reservas</p>
            </div>
          </div>
        </section>

        {/* Confianza / rubros */}
        <section aria-label="Para qué negocios" className="border-y border-neutral-200 bg-neutral-50 px-5 py-8">
          <div className="mx-auto max-w-6xl text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-neutral-500">Pensado para negocios que trabajan con turnos</p>
            <ul className="flex flex-wrap justify-center gap-2.5 text-sm font-semibold">
              {([["scissors", "Barberías"], ["palette", "Uñas"], ["sparkles", "Estética"], ["pencil", "Tatuajes"], ["stethoscope", "Consultorios"], ["plus", "Y más servicios"]] as [IconName, string][]).map(([icon, r]) => (
                <li key={r} className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2">
                  <Icon name={icon} size={16} className="text-emerald-600" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Cómo funciona */}
        <Section id="como-funciona">
          <Heading eyebrow="Cómo funciona" title="De cero a recibir turnos en 4 pasos" text="Sin técnicos ni configuraciones complicadas." />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-brand-fg">{s.n}</span>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-neutral-600">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <CtaLink where="steps" className={BTN_PRIMARY}>
              Crear mi negocio ahora
            </CtaLink>
          </div>
        </Section>

        {/* Eficiencia */}
        <Section id="eficiencia" className="bg-neutral-900 text-white">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Heading
                light
                center={false}
                eyebrow="Vos mandás"
                title="Tus horarios, exactamente como los querés"
                text="Cargá la hora que quieras, el día que quieras, tantas veces como necesites. Tus clientes ven justo esos horarios: la app no los recalcula ni los esconde."
              />
              <ul className="space-y-3 text-neutral-200">
                <li className="flex gap-3">
                  <Icon name="check" size={18} className="mt-0.5 text-emerald-400" />
                  <span>
                    <strong className="text-white">Sin límites:</strong> 07:30, 09:10, 10:45… los horarios que se te ocurran, distintos para cada día de la semana.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Icon name="check" size={18} className="mt-0.5 text-emerald-400" />
                  <span>
                    <strong className="text-white">Editás uno por uno:</strong> cambiás, quitás o copiás los horarios de un día a toda la semana.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Icon name="check" size={18} className="mt-0.5 text-emerald-400" />
                  <span>
                    <strong className="text-white">Nunca se reserva dos veces el mismo horario:</strong> cuando alguien lo toma, desaparece para los demás. También podés bloquear fechas completas.
                  </span>
                </li>
              </ul>              <div className="mt-8">
                <CtaLink where="efficiency" className={BTN_LIGHT}>
                  Probarlo gratis
                </CtaLink>
              </div>
            </div>
            <div className="rounded-3xl bg-white p-5 text-neutral-900 shadow-2xl sm:p-7">
              <ScheduleChips />
              <p className="mt-5 text-xs text-neutral-400">Ejemplo ilustrativo de los horarios que podés cargar en un día.</p>
            </div>
          </div>
        </Section>

        {/* Funcionalidades */}
        <Section id="funciones">
          <Heading eyebrow="Todo incluido" title="Lo que tus clientes ven… y lo que vos controlás" text="Una herramienta completa para vender más turnos y trabajar con más orden." />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-2xl border border-neutral-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-lg">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Icon name={f.icon} size={24} />
                </span>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-neutral-600">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Panel del dueño */}
        <Section className="bg-neutral-50">
          <Heading eyebrow="Tu panel" title="Controlá tu negocio desde el celular o la compu" text="Todo lo importante a la vista, sin planillas ni libretas." />
          <ul className="grid gap-5 sm:grid-cols-2">
            {OWNER.map((o) => (
              <li key={o.title} className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
                  <Icon name={o.icon} size={24} />
                </span>
                <div>
                  <h3 className="font-bold">{o.title}</h3>
                  <p className="mt-1 text-neutral-600">{o.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* Planes */}
        <Section id="planes">
          <Heading eyebrow="Planes" title="Empezá gratis. Elegí tu plan después." text="Todos los planes incluyen 1 mes de prueba gratis, sin tarjeta." />
          {plans.length > 0 ? (
            <ul className={`mx-auto grid max-w-5xl gap-6 ${plans.length === 1 ? "max-w-md" : plans.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
              {plans.map((p) => {
                const hot = p.slug === featured?.slug && plans.length > 1;
                return (
                  <li key={p.slug} className={`relative flex flex-col rounded-3xl border p-7 ${hot ? "border-neutral-900 bg-neutral-900 text-white shadow-2xl md:-translate-y-3" : "border-neutral-200 bg-white"}`}>
                    {hot && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-neutral-900">Más elegido</span>}
                    <h3 className="text-xl font-extrabold">{p.name}</h3>
                    {p.description && <p className={`mt-1 text-sm ${hot ? "text-neutral-300" : "text-neutral-500"}`}>{p.description}</p>}
                    <p className="mt-5 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight">{p.price}</span>
                      <span className={hot ? "text-neutral-300" : "text-neutral-500"}>/mes</span>
                    </p>
                    <p className={`mt-1 text-sm font-semibold ${hot ? "text-emerald-300" : "text-emerald-700"}`}>1 mes gratis para probar</p>
                    <ul className={`mt-5 flex-1 space-y-2 text-sm ${hot ? "text-neutral-200" : "text-neutral-700"}`}>
                      <li className="flex gap-2">
                        <Icon name="check" size={18} className="mt-0.5 text-emerald-500" />
                        {p.limit}
                      </li>
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Icon name="check" size={18} className="mt-0.5 text-emerald-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <CtaLink where={`plan-${p.slug}`} className={`mt-7 ${hot ? BTN_LIGHT : BTN_PRIMARY}`}>
                      Empezar gratis
                    </CtaLink>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mx-auto max-w-md rounded-3xl border border-neutral-200 p-8 text-center">
              <p className="text-lg font-bold">1 mes gratis, sin tarjeta</p>
              <p className="mt-1 text-neutral-600">Probá todo el sistema y elegí tu plan cuando termine la prueba.</p>
              <CtaLink where="plans-empty" className={`mt-6 ${BTN_PRIMARY}`}>
                Empezar gratis
              </CtaLink>
            </div>
          )}
          <p className="mt-8 text-center text-sm text-neutral-500">Podés cambiar de plan o cancelar cuando quieras desde tu panel.</p>
        </Section>

        {/* Preguntas */}
        <Section id="preguntas" className="bg-neutral-50">
          <Heading eyebrow="Preguntas frecuentes" title="Antes de empezar" />
          <div className="mx-auto max-w-3xl divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:hidden">
                  {f.q}
                  <span className="text-xl text-neutral-400 transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-neutral-600">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* CTA final */}
        <section className="px-5 py-16 sm:py-24">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2a3318] via-[#1d2413] to-[#0c1008] px-6 py-14 text-center text-white shadow-2xl sm:px-12">
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Tu próxima reserva puede estar llegando mientras trabajás</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-neutral-300">Creá tu negocio hoy, compartí tu link y empezá a recibir turnos. El primer mes es gratis y no pedimos tarjeta.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaLink where="final" className={BTN_LIGHT}>
                Comenzar mi mes gratis
              </CtaLink>
              <Link href="/admin/login" className="rounded-full px-6 py-3.5 font-semibold text-white/90 hover:text-white">
                Ya tengo cuenta →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-neutral-500 sm:flex-row">
          <span className="font-semibold text-neutral-700">Turnos</span>
          <nav aria-label="Pie" className="flex gap-5">
            <a href="#como-funciona" className="hover:text-neutral-900">Cómo funciona</a>
            <a href="#planes" className="hover:text-neutral-900">Planes</a>
            <Link href="/admin/login" className="hover:text-neutral-900">Ingresar</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
