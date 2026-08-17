import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { buildAuthOptions } from "@/lib/auth";

type Ctx = { params: { nextauth: string[] } };

// Der Credentials-Callback braucht die DB-Session-Sonderbehandlung
// (siehe src/lib/auth.ts). Erkennbar ist er nur an der Request-URL.
function handler(req: NextRequest, ctx: Ctx) {
  const segments = ctx.params.nextauth ?? [];
  const isCredentialsCallback =
    req.method === "POST" &&
    segments[0] === "callback" &&
    segments[1] === "credentials";

  return NextAuth(req as never, ctx as never, buildAuthOptions(isCredentialsCallback));
}

export { handler as GET, handler as POST };
