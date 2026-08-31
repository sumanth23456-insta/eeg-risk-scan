import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

/** Fallback credentials used only when project secrets are not configured. */
const FALLBACK_USERNAME = "researcher";
const FALLBACK_PASSWORD = "neurorisk2026";

function sessionConfig() {
  return {
    password:
      process.env["SESSION_SECRET"] ??
      "neurorisk-dev-session-secret-change-me-please-32+",
    name: "neurorisk-gate",
    maxAge: 60 * 60 * 12,
    // "none" so the cookie survives the cross-site preview iframe; requires secure.
    cookie: { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" },
  };
}

type GateSession = { unlocked?: boolean; username?: string };

function matches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const user = process.env["SITE_USERNAME"] ?? FALLBACK_USERNAME;
    const pass = process.env["SITE_PASSWORD"] ?? FALLBACK_PASSWORD;

    const ok = matches(data.username.trim().toLowerCase(), user.toLowerCase()) && matches(data.password, pass);
    if (!ok) return { ok: false as const };

    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true, username: user });
    return { ok: true as const };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { unlocked: Boolean(session.data.unlocked), username: session.data.username ?? null };
});

/**
 * Loader guard: asks the server for gate status and redirects in the loader
 * itself (throwing the redirect inside the server fn surfaces as a raw
 * Response error on the client).
 */
export async function requireUnlocked() {
  const status = await getGateStatus();
  if (!status.unlocked) throw redirect({ to: "/unlock" });
  return status;
}
