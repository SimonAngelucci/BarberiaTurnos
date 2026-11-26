/**
 * Clave para reconocer a la misma persona aunque haya escrito su número distinto. En Argentina un celular se puede escribir con o
 * sin el 9 después del 54 (+54 9 2473 50 6255 / +54 2473 50 6255): son el mismo teléfono y antes generaban dos clientes.
 * La clave es solo dígitos, sin el 9 de celular. Para otros países es el número tal cual (solo dígitos).
 */
export function phoneKey(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("549") ? "54" + d.slice(3) : d;
}

/** Las formas con las que ese mismo teléfono pudo haberse guardado (E.164 con +). Sirve para buscar al cliente existente. */
export function phoneVariants(e164: string): string[] {
  const d = e164.replace(/\D/g, "");
  if (d.startsWith("549")) return [`+${d}`, `+54${d.slice(3)}`];
  if (d.startsWith("54")) return [`+${d}`, `+549${d.slice(2)}`];
  return [`+${d}`];
}
