import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { personaById, type Persona, type Role } from "./personas";

const COOKIE = "lh_session";
export const DEMO_SAFE_COOKIE = "lh_demo_safe";

function secret() {
  return process.env.SESSION_SECRET || createHash("sha256").update(`lighthouse:${process.env.DATABASE_URL ?? "dev"}`).digest("hex");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function encodeSession(personaId: string) {
  const body = Buffer.from(JSON.stringify({ pid: personaId, iat: Date.now() })).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(token: string | undefined): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { pid, iat } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (Date.now() - iat > 1000 * 60 * 60 * 24 * 14) return null;
    return pid;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Persona | null> {
  const jar = await cookies();
  return personaById(decodeSession(jar.get(COOKIE)?.value) ?? undefined) ?? null;
}

export async function requireSession(): Promise<Persona> {
  const p = await getSession();
  if (!p) redirect("/login");
  return p;
}

export async function requireRole(...roles: Role[]): Promise<Persona> {
  const p = await requireSession();
  if (!roles.includes(p.role)) throw new Error(`This action requires: ${roles.join(" or ")}`);
  return p;
}

export async function setSessionCookie(personaId: string) {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(personaId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export async function isDemoSafe(): Promise<boolean> {
  return (await cookies()).get(DEMO_SAFE_COOKIE)?.value === "1";
}

export function adminPin() {
  return process.env.ADMIN_PIN || "4210";
}
