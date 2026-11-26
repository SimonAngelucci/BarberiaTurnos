type SendInput = {
  to: string; // E.164 con +
  body: string;
  templateName?: string | null;
  params?: string[] | null;
};

/**
 * Envío vía WhatsApp Cloud API (Meta). Todo corre en el servidor: el token nunca llega al navegador.
 * - Sin token o sin ID de número: modo consola (desarrollo) — imprime el mensaje y NO lo envía.
 * - WA_USE_TEMPLATES=true: plantillas aprobadas (requerido para escribirle a un cliente
 *   fuera de la ventana de 24h, que es el caso de confirmaciones y recordatorios).
 */
export async function sendWhatsApp(input: SendInput): Promise<{ id: string }> {
  // WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID se aceptan como nombres alternativos.
  const token = process.env.WA_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.log(`[WhatsApp:consola] (faltan WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID: NO se envía) → ${input.to}\n${input.body}\n`);
    return { id: "console" };
  }

  const useTemplates = process.env.WA_USE_TEMPLATES === "true" && !!input.templateName;
  if (process.env.WA_USE_TEMPLATES === "true" && !input.templateName) {
    console.warn(`[WhatsApp] Aviso: este mensaje no tiene plantilla configurada, se envía como texto libre (Meta no lo entrega si el cliente no escribió en las últimas 24 h) → ${input.to}`);
  }
  // Solo dígitos, formato internacional sin "+": 5492473506255
  const to = input.to.replace(/\D/g, "");

  const payload = useTemplates
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: process.env.WA_TEMPLATE_LANG ?? "es" },
          components: [
            {
              type: "body",
              parameters: (input.params ?? []).map((text) => ({ type: "text", text })),
            },
          ],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: input.body } };

  const what = useTemplates ? `plantilla ${input.templateName}` : "texto libre";
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${process.env.WA_API_VERSION ?? "v21.0"}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error(`[WhatsApp] Error: no se pudo conectar con Meta (${what} → ${to}):`, e);
    throw e;
  }
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) {
    console.error(`[WhatsApp] Error: ${what} → ${to} · HTTP ${res.status} ·`, JSON.stringify(json));
    throw new Error(json.error?.message ?? `WhatsApp HTTP ${res.status}`);
  }
  console.log(`[WhatsApp] Enviado: ${what} → ${to} · respuesta de Meta:`, JSON.stringify(json));
  return { id: json.messages?.[0]?.id ?? "unknown" };
}
