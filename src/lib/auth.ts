import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";
import { randomUUID } from "crypto";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { cookies } from "next/headers";

import { prisma } from "./db";
import { meldeFehler } from "@/server/error-log";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage

/**
 * Schutz gegen Durchprobieren von Passwörtern.
 *
 * Gesperrt wird das **Konto**, nicht die Herkunft: wer ein bestimmtes Konto
 * angreift, wechselt sonst einfach die Adresse. Die Sperre bleibt bewusst
 * kurz – eine lange liesse sich missbrauchen, um jemandem den Zugang zu
 * nehmen, indem man absichtlich falsch rät. Gegen das breite Abklappern
 * vieler Konten von einer Stelle aus steht zusätzlich eine Begrenzung im
 * Webserver.
 */
const MAX_FEHLVERSUCHE = 8;
const SPERRE_MS = 15 * 60 * 1000;

/**
 * Ein gültiger bcrypt-Hash, der zu keinem Passwort gehört. Er dient nur dazu,
 * bei unbekanntem Benutzernamen dieselbe Rechenzeit zu verbrauchen wie bei
 * einem bekannten – sonst verriete die Antwortzeit, welche Namen existieren.
 */
const LEERLAUF_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO1Vd0m0kM3wJ1kAqM1qC0Jm3vJ0YQmqK";

const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
export const SESSION_COOKIE = useSecureCookies
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

/**
 * Sessions liegen in der Datenbank (Tabelle `Session`), nicht als JWT im Cookie.
 *
 * NextAuth v4 lehnt `session.strategy = "database"` ab, sobald der einzige
 * Provider ein Credentials-Provider ist – die Prüfung schlägt bei *jedem*
 * Request zu, nicht nur beim Login. Deshalb bleibt die Strategie nach aussen
 * "jwt", und `jwt.encode`/`jwt.decode` werden zum Session-Store umgebaut:
 *
 *   encode → legt eine Session-Zeile an und gibt deren Token zurück
 *   decode → schlägt den Token in der Tabelle nach und liefert die User-ID
 *
 * Im Cookie steht damit ein undurchsichtiger Token, kein signiertes JWT mit
 * Nutzdaten. Das hat die Eigenschaften, auf die es ankommt: Sessions sind
 * serverseitig einsehbar und jederzeit widerrufbar (z.B. beim Zurücksetzen
 * eines Passworts, siehe admin-actions.ts).
 *
 * `isCredentialsCallback` liefert der Route-Handler, der die URL kennt.
 */
export function buildAuthOptions(isCredentialsCallback = false): NextAuthOptions {
  return {
    adapter: PrismaAdapter(prisma),
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE,
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    providers: [
      CredentialsProvider({
        name: "Zugangsdaten",
        credentials: {
          username: { label: "Benutzername", type: "text" },
          password: { label: "Passwort", type: "password" },
        },
        async authorize(credentials) {
          const username = credentials?.username?.trim();
          const password = credentials?.password;
          if (!username || !password) return null;

          const user = await prisma.user.findUnique({ where: { username } });
          if (!user) {
            // Auch bei unbekanntem Namen rechnen, damit die Antwortzeit nicht
            // verrät, ob es das Konto überhaupt gibt.
            await compare(password, LEERLAUF_HASH);
            return null;
          }

          // Gesperrt? Dann gar nicht erst prüfen – sonst liesse sich die
          // Sperre durch blosses Weiterraten aussitzen.
          if (user.lockedUntil && user.lockedUntil > new Date()) return null;

          const ok = await compare(password, user.passwordHash);

          if (!ok) {
            const versuche = user.failedLogins + 1;
            const sperren = versuche >= MAX_FEHLVERSUCHE;
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLogins: sperren ? 0 : versuche,
                lockedUntil: sperren ? new Date(Date.now() + SPERRE_MS) : null,
              },
            });
            if (sperren) {
              await meldeFehler({
                source: "Anmeldung",
                fehler: new Error(
                  `Konto "${user.username}" nach ${MAX_FEHLVERSUCHE} Fehlversuchen ` +
                    `für ${SPERRE_MS / 60000} Minuten gesperrt.`,
                ),
                userName: user.displayName,
              });
            }
            return null;
          }

          // Erfolgreich: Zähler und Sperre zurücksetzen.
          if (user.failedLogins > 0 || user.lockedUntil) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLogins: 0, lockedUntil: null },
            });
          }

          return { id: user.id, name: user.displayName, email: null };
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        return token;
      },
      async session({ session, token }) {
        const userId = token?.sub;
        if (!userId) return session;

        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            displayName: true,
            isSuperadmin: true,
            isMember: true,
            isR4: true,
            playerId: true,
            locale: true,
            mustChangePassword: true,
          },
        });
        // Gelöschter User → keine gültige Session mehr.
        if (!dbUser) return session;

        session.user = {
          ...session.user,
          id: dbUser.id,
          username: dbUser.username,
          name: dbUser.displayName,
          isSuperadmin: dbUser.isSuperadmin,
          isMember: dbUser.isMember,
          isR4: dbUser.isR4,
          playerId: dbUser.playerId,
          locale: dbUser.locale,
          mustChangePassword: dbUser.mustChangePassword,
        };
        return session;
      },
    },
    jwt: {
      async encode({ token, maxAge }) {
        const userId = token?.sub;
        if (!userId) return "";

        const expires = new Date(Date.now() + (maxAge ?? SESSION_MAX_AGE) * 1000);

        // Beim Login immer eine frische Zeile – ein altes Cookie im Browser
        // darf sich nicht an die neue Anmeldung hängen.
        if (!isCredentialsCallback) {
          const existing = cookies().get(SESSION_COOKIE)?.value;
          if (existing) {
            const row = await prisma.session.findUnique({
              where: { sessionToken: existing },
            });
            if (row && row.userId === userId && row.expires > new Date()) {
              // Gleitende Verlängerung, solange die Session benutzt wird.
              await prisma.session.update({
                where: { sessionToken: existing },
                data: { expires },
              });
              return existing;
            }
          }
        }

        const sessionToken = randomUUID();
        await prisma.session.create({ data: { sessionToken, userId, expires } });
        return sessionToken;
      },

      async decode({ token }) {
        if (!token) return null;

        const row = await prisma.session.findUnique({
          where: { sessionToken: token },
          select: { userId: true, expires: true },
        });
        if (!row) return null;

        if (row.expires <= new Date()) {
          await prisma.session.deleteMany({ where: { sessionToken: token } });
          return null;
        }
        return { sub: row.userId };
      },
    },
    events: {
      async signOut() {
        // Abmelden heisst: die Zeile ist weg, der Token wertlos.
        const token = cookies().get(SESSION_COOKIE)?.value;
        if (token) await prisma.session.deleteMany({ where: { sessionToken: token } });
      },
    },
    secret: process.env.NEXTAUTH_SECRET,
  };
}

export const authOptions = buildAuthOptions();
