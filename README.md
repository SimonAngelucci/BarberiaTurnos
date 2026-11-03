# Barbería Turnos

Sistema de reservas para barberías: reserva pública mobile-first, panel admin protegido, recordatorios por WhatsApp y protección anti-overbooking.

## 1. Arquitectura

```
Cliente (móvil/PWA)            Admin
      │                           │
      ▼                           ▼
┌──────────────────── Next.js 15 (App Router) ────────────────────┐
│ /                 UI de reserva (client component)              │
│ /api/availability  slots libres      /api/appointments  reserva │
│ /admin/*          server components + server actions            │
│ /api/cron/dispatch  despacha la outbox (Vercel Cron / externo)  │
└───────────┬───────────────────────────────────────┬─────────────┘
            ▼                                       ▼
   PostgreSQL (Prisma)                   WhatsApp Cloud API (Meta)
   · EXCLUDE constraint anti-overlap     · plantillas aprobadas
   · tabla Message = outbox
```

Decisiones clave:
- **Monolito Next.js**: un deploy, server actions para el admin, sin API separada.
- **Anti-overbooking en dos capas**: (1) `isSlotAvailable` valida contra la agenda; (2) la constraint `EXCLUDE USING gist` de Postgres (`prisma/constraints.sql`) rechaza solapamientos aun con requests simultáneos. El API traduce el error a `409`.
- **Outbox pattern**: el mensaje se inserta en `Message` junto al turno; `dispatchDue()` lo envía con claim atómico (`PENDING→SENDING`), 3 reintentos con backoff. Si WhatsApp cae, no se pierde nada. Los recordatorios de turnos cancelados se descartan.
- **Zona horaria**: todo en UTC en la base; horarios de agenda en minutos locales; conversiones con Luxon usando `Business.timezone`.
- **Multi-tenant ready**: todo cuelga de `businessId`. Hoy `getBusiness()` devuelve el primero; luego se resuelve por subdominio.
- **Auth**: JWT (`jose`) en cookie httpOnly + middleware + `requireAdmin()` en cada page/action.

## 2. Modelo de datos

Ver [prisma/schema.prisma](prisma/schema.prisma). Entidades: `Business`, `AdminUser`, `Barber`, `WorkingHour` (franjas por día, varias = horario cortado), `TimeOff` (bloqueos por barbero o globales), `Service`, `Customer` (único por teléfono), `Appointment`, `Message` (outbox).

## 3. Flujos

**Cliente**: servicio → (barbero) → día → horario → nombre/apellido/WhatsApp → confirmar → se crea el turno, se encola confirmación + recordatorios (por defecto 24h y 2h antes), se envía la confirmación al instante.

**Admin**: login → dashboard (hoy, próximos 7 días, métricas) → cancelar (notifica por WhatsApp) / marcar completado → Servicios (CRUD) → Horarios (días, franjas, bloqueos, barberos) → Negocio (marca, color, zona horaria, intervalo, mensajes).

## 4. Estructura

```
prisma/            schema, constraints.sql, seed
src/lib/           db, slots (disponibilidad), outbox, whatsapp, auth, format
src/app/           page (reserva), admin/*, api/*
src/components/    BookingFlow, LogoutButton
```

## 5. Puesta en marcha

```bash
npm install
cp .env.example .env        # completar DATABASE_URL, AUTH_SECRET, CRON_SECRET
npm run db:setup            # crea tablas + constraint anti-overbooking
npm run db:seed             # negocio demo, servicios, barbero, admin
npm run dev                 # http://localhost:3000  ·  /admin
```
Sin credenciales de WhatsApp los mensajes se imprimen en la consola del servidor.

## 6. Configurar WhatsApp (Meta Cloud API)

1. Entrá a <https://developers.facebook.com> → *Create App* → tipo **Business** → agregá el producto **WhatsApp**.
2. En *WhatsApp → API Setup* obtenés el **Phone Number ID** y un token temporal. Para producción: *Business Settings → System Users* → creá un usuario del sistema → generá un **token permanente** con permiso `whatsapp_business_messaging`.
3. Agregá y verificá el número real de la barbería (no puede estar activo en la app normal de WhatsApp).
4. **Plantillas** (obligatorio): los mensajes que inicia el negocio fuera de la ventana de 24h solo pueden ser plantillas aprobadas. En *WhatsApp Manager → Message templates* creá 3 plantillas, categoría *Utility*, idioma `es`, con estas variables en el cuerpo:
   - `turno_confirmado`: `Hola {{1}}! Tu turno de {{2}} quedó confirmado para el {{3}} a las {{4}} en {{5}}.`
   - `turno_recordatorio`: `Hola {{1}}, te recordamos tu turno de {{2}}: {{3}} a las {{4}} en {{5}}.`
   - `turno_cancelado`: `Hola {{1}}, tu turno de {{2}} del {{3}} a las {{4}} en {{5}} fue cancelado. Escribinos para reprogramar.`
5. En `.env`: `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_USE_TEMPLATES=true` y los nombres `WA_TPL_*`.
6. Probá reservando un turno con tu propio número. En modo prueba, Meta solo permite enviar a números agregados como destinatarios de prueba.

> Los textos editables en «Negocio → Mensajes» se usan en modo texto libre y como registro; con plantillas de Meta el texto lo define la plantilla aprobada.

Alternativas self-hosted (Evolution API/Baileys) funcionan cambiando solo `src/lib/whatsapp.ts`, pero no son oficiales y pueden bloquear el número.

## 7. Recordatorios programados

`/api/cron/dispatch` (con `Authorization: Bearer $CRON_SECRET`) envía los mensajes vencidos. `vercel.json` lo agenda cada 5 min. Nota: **Vercel Hobby solo permite crons diarios**; con Hobby usá un pinger externo gratuito (cron-job.org, GitHub Actions) o Railway/Render con `node-cron`.

## 8. Plan por fases

- **Fase 1 (MVP, este repo)**: reserva pública, anti-overbooking, WhatsApp (confirmación/recordatorios/cancelación), admin con dashboard, servicios, horarios, bloqueos, multi-barbero, branding.
- **Fase 2**: reprogramar turnos desde el admin (+ aviso), vista calendario día/semana/mes (FullCalendar), historial por cliente, link de cancelación para el cliente, rate limiting + captcha en la reserva, tests (slots y concurrencia).
- **Fase 3**: webhooks de WhatsApp (estado de entrega, respuestas), subida de logo, PWA instalable, reportes de ingresos, selector "cualquier barbero".
- **Fase 4**: multi-tenant (subdominios + roles por barbero), pagos/señas (Mercado Pago/Stripe), lista de espera.
