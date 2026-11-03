type SendInput = {
  to: string; // E.164 con +
  body: string;
  templateName?: string | null;
  params?: string[] | null;
};

/**
 * Envío vía WhatsApp Cloud API (Meta).
 * - Sin WA_ACCESS_TOKEN: modo consola (desarrollo).
 * - WA_USE_TEMPLATES=true: plantillas aprobadas (requerido para escribirle a un cliente
 *   fuera de la ventana de 24h, que es el caso de confirmaciones y recordatorios).
 */
export async function sendWhatsApp(input: SendInput): Promise<{ id: string }> {
  const token = process.env.WA_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.log(`[WhatsApp:consola] → ${input.to}\n${input.body}\n`);
    return { id: "console" };
  }

  const useTemplates = process.env.WA_USE_TEMPLATES === "true" && input.templateName;
  const to = input.to.replace(/^\+/, "");

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

  const res = await fetch(
    `https://graph.facebook.com/${process.env.WA_API_VERSION ?? "v21.0"}/${phoneId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `WhatsApp HTTP ${res.status}`);
  return { id: json.messages?.[0]?.id ?? "unknown" };
}
