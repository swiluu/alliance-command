import { PrismaClient } from "@prisma/client";

// Im Dev-Modus überlebt der Client den Hot-Reload, sonst reisst SQLite
// bei jedem Reload neue Verbindungen auf.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Der Kader: aktiv und kein externes Allianzmitglied. Alles ausserhalb
 * des Zug-Moduls rechnet mit dieser Menge.
 */
export const KADER = { leftAt: null, isExternal: false } as const;
