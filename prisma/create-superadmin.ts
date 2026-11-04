// Crea (o actualiza la contraseña de) un Super Admin. Solo se puede hacer desde la consola, nunca desde la web.
//   npm run superadmin:create -- tu@email.com "UnaClaveLarga123"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: npm run superadmin:create -- tu@email.com "tu-contraseña"');
    process.exitCode = 1;
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email inválido");
  if (password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.platformAdmin.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash },
    create: { email: email.toLowerCase(), passwordHash },
  });
  console.log(`Super Admin listo: ${admin.email}. Ingresá en /superadmin/login`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
