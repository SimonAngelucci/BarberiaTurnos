import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Clave de cifrado de credenciales (Access Tokens de Mercado Pago).
 * Usa PAYMENTS_ENC_KEY si existe; si no, deriva una clave independiente a partir de AUTH_SECRET.
 */
function key(purpose: string) {
  const base = process.env.PAYMENTS_ENC_KEY || process.env.AUTH_SECRET;
  if (!base || base.length < 16) throw new Error("Falta AUTH_SECRET (o PAYMENTS_ENC_KEY) para cifrar credenciales");
  return createHash("sha256").update(`${purpose}:${base}`).digest();
}

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<datos> en base64url. */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("enc"), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(blob: string) {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Credencial con formato inválido");
  const d = createDecipheriv("aes-256-gcm", key("enc"), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** Token firmado para links públicos (ej. volver del checkout): no se puede adivinar ni reutilizar para otro id. */
export function signId(scope: string, id: string) {
  return createHmac("sha256", key("sign")).update(`${scope}:${id}`).digest("hex").slice(0, 32);
}

export function verifySignedId(scope: string, id: string, token: string | undefined) {
  if (!token) return false;
  const a = Buffer.from(signId(scope, id));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
