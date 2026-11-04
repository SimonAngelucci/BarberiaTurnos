import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { SUPER_COOKIE, verifySuperToken } from "@/lib/platform-auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // El panel necesita saber en qué página está (ej. la de suscripción nunca se bloquea en modo solo lectura).
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const next = () => NextResponse.next({ request: { headers } });

  if (pathname.startsWith("/superadmin")) {
    if (pathname === "/superadmin/login") return next();
    const sa = await verifySuperToken(req.cookies.get(SUPER_COOKIE)?.value);
    return sa ? next() : NextResponse.redirect(new URL("/superadmin/login", req.url));
  }

  if (pathname === "/admin/login") return next();
  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  return session ? next() : NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = { matcher: ["/admin/:path*", "/superadmin/:path*"] };
