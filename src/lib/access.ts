import { ActionError } from "@/server/action-error";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { cache } from "react";

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";

import { authOptions } from "./auth";
import { MODULES, type AccessLevel, type ModuleKey } from "./constants";
import { prisma } from "./db";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  isSuperadmin: boolean;
  /** Selbst registriertes Allianzmitglied – Leserecht ohne eigene Zeilen. */
  isMember: boolean;
  /** R4-Rang: Mitglied mit Einblick in Fixplätze und Protokoll. */
  isR4: boolean;
  /** Verknüpfter Kadereintrag, falls vorhanden. */
  playerId: string | null;
  /** Sprache der Oberfläche – siehe src/i18n/config.ts. */
  locale: Locale;
  /** Erstpasswort noch nicht selbst gesetzt – siehe /passwort. */
  mustChangePassword: boolean;
};

/**
 * `cache` bündelt die Aufrufe innerhalb einer Anfrage. Layout, Seite und die
 * Sprachauflösung fragen alle nach dem Konto; ohne das wäre jede dieser
 * Stellen eine eigene Datenbankabfrage.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    username: session.user.username,
    displayName: session.user.name ?? session.user.username,
    isSuperadmin: session.user.isSuperadmin,
    isMember: session.user.isMember,
    isR4: session.user.isR4,
    playerId: session.user.playerId,
    locale: isLocale(session.user.locale) ? session.user.locale : DEFAULT_LOCALE,
    mustChangePassword: session.user.mustChangePassword,
  };
});

/** Leitet zum Login um, wenn niemand angemeldet ist. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const RANK: Record<AccessLevel, number> = { NONE: 0, READ: 1, EDIT: 2 };

/**
 * Module, die jedes selbst registrierte Konto lesen darf – ohne dass jemand
 * dafür die Matrix pflegen muss. Bei hundert Konten wäre das sonst Handarbeit
 * ohne Ende.
 *
 * In den beiden Events sieht ein Konto ohne R4-Rang nur die Wochenplanung
 * (siehe MITGLIED_TABS); in der VS-Auswertung nur die Rangliste, weil das
 * Erfassen ohnehin Schreibrecht verlangt. Der Zug steht bewusst nicht hier –
 * er hängt am Rang, nicht an der Registrierung.
 */
const MITGLIED_LESEN: readonly ModuleKey[] = [
  "wuestensturm",
  "schluchtsturm",
  "vs",
  "allianz",
];

/**
 * Reiter, die ein Mitglied innerhalb eines Events sieht. Es geht ihm um die
 * eigene Aufstellung – Spielerliste, Sperren und Fixplätze sind Sache der
 * Leitung.
 */
export const MITGLIED_TABS: readonly string[] = ["planung"];

/**
 * Ohne R4-Rang bleibt es bei der eigenen Aufstellung: in den taktischen Events
 * nur die Wochenplanung, und der Zug ist ganz zu.
 *
 * Massgeblich ist der Rang, nicht die Herkunft des Kontos. Wer den Zug plant
 * oder Fixplätze setzt, ist R4 – ob sein Konto von Hand angelegt wurde oder
 * über den Beitrittscode entstand, spielt dafür keine Rolle. Superadmins
 * stehen ohnehin darüber.
 */
function nurWochenplanung(user: SessionUser) {
  return !user.isSuperadmin && !user.isR4;
}

/**
 * Führungsdaten: Fixplätze und das Aktivitätsprotokoll. Ohne R4-Rang nicht
 * sichtbar.
 */
export function siehtFuehrungsdaten(user: SessionUser) {
  return !nurWochenplanung(user);
}

/** Darf dieser Nutzer den Reiter sehen? */
export function darfReiter(user: SessionUser, slug: string) {
  // Der R4-Rang sieht das ganze Event – weiterhin nur lesend.
  if (!nurWochenplanung(user)) return true;
  return MITGLIED_TABS.includes(slug);
}

/**
 * Die Stufen eines Kontos aus seinen Rohdaten – ohne Datenbankzugriff.
 *
 * Einzige Quelle der Wahrheit. Die Wächter fragen darüber, und die
 * Zugriffsverwaltung zeigt genau dasselbe an. Vorher rechnete die Seite mit
 * einer eigenen Kopie der Regeln; die lief auseinander, und die Matrix zeigte
 * eine Stufe, die so nicht galt.
 */
export function stufenAus(
  user: Pick<SessionUser, "isSuperadmin" | "isMember" | "isR4">,
  zeilen: { module: string; level: string }[],
): Record<ModuleKey, AccessLevel> {
  const map = Object.fromEntries(
    MODULES.map((m) => [m, user.isSuperadmin ? "EDIT" : "NONE"]),
  ) as Record<ModuleKey, AccessLevel>;

  if (user.isSuperadmin) return map;

  // Grundrecht aus der Rolle – eine Untergrenze, kein Deckel.
  if (user.isMember) for (const m of MITGLIED_LESEN) map[m] = "READ";

  // Die Matrix kommt obendrauf: sie kann mehr geben, aber nichts wegnehmen.
  // So bleibt das Leserecht jedes Registrierten garantiert, und wer eine
  // Aufgabe hat – etwa die VS-Wochen zu erfassen – bekommt dafür Bearbeiten.
  for (const zeile of zeilen) {
    if (!(MODULES as readonly string[]).includes(zeile.module)) continue;
    const m = zeile.module as ModuleKey;
    map[m] = hoehere(map[m], zeile.level as AccessLevel);
  }

  map.zug = zugStufe(user, map.zug);
  map.r2 = r2Stufe(user, map.r2);
  return map;
}

/** Die höhere von zwei Stufen. */
function hoehere(a: AccessLevel, b: AccessLevel): AccessLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Die R2-Markierung hängt am Rang: wer R4 ist, darf markieren.
 *
 * Ein R2 entsteht im Spiel und fällt dort auf – meist merkt es der R4, der
 * gerade die Anmeldungen durchgeht. Müsste er erst um das Recht bitten, wäre
 * die Markierung tagelang nicht gesetzt und die Wochenplanung stellte jemanden
 * auf, der nicht teilnehmen darf.
 *
 * Ohne R4 bleibt es bei dem, was in der Matrix steht – dort lässt sich das
 * Recht weiterhin einzeln vergeben.
 */
function r2Stufe(user: Pick<SessionUser, "isR4">, ausMatrix: AccessLevel): AccessLevel {
  return user.isR4 ? "EDIT" : ausMatrix;
}

/**
 * Der Zug hängt am Rang und nicht an der Matrix: mit R4 mindestens lesend,
 * ohne R4 gar nicht. Eine in der Matrix eingetragene höhere Stufe bleibt für
 * R4 erhalten – wer den Wochenplan pflegt, braucht sie.
 */
function zugStufe(
  user: Pick<SessionUser, "isR4">,
  ausMatrix: AccessLevel,
): AccessLevel {
  if (!user.isR4) return "NONE";
  return ausMatrix === "NONE" ? "READ" : ausMatrix;
}

export async function getAccessMap(
  user: SessionUser,
): Promise<Record<ModuleKey, AccessLevel>> {
  if (user.isSuperadmin) return stufenAus(user, []);
  const zeilen = await prisma.moduleAccess.findMany({
    where: { userId: user.id },
    select: { module: true, level: true },
  });
  return stufenAus(user, zeilen);
}

export async function getAccessLevel(
  user: SessionUser,
  module: ModuleKey,
): Promise<AccessLevel> {
  // Bewusst über dieselbe Rechnung wie die Karte. Zwei Wege zum selben
  // Ergebnis waren schon einmal zwei verschiedene Ergebnisse.
  return (await getAccessMap(user))[module];
}

export function hasAtLeast(level: AccessLevel, required: AccessLevel) {
  return RANK[level] >= RANK[required];
}

/**
 * Guard für Seiten (Server Components). Wirft den User auf /kein-zugriff,
 * wenn die Stufe nicht reicht.
 */
export async function requireAccess(module: ModuleKey, required: AccessLevel = "READ") {
  const user = await requireUser();
  const level = await getAccessLevel(user, module);
  if (!hasAtLeast(level, required)) redirect(`/kein-zugriff?modul=${module}`);
  return { user, level };
}

/**
 * Wie requireAccess, prüft zusätzlich den Reiter. Mitglieder sehen innerhalb
 * eines Events nur die Wochenplanung – wer eine andere Adresse direkt aufruft,
 * landet auf der erlaubten.
 */
export async function requireEventTab(module: ModuleKey, slug: string) {
  const { user, level } = await requireAccess(module);
  if (!darfReiter(user, slug)) redirect(`/${module}/${MITGLIED_TABS[0]}`);
  return { user, level };
}

/**
 * Guard für Server Actions. Wirft einen Fehler statt umzuleiten – jede
 * schreibende Aktion muss hier durch, Client-seitiges Ausblenden zählt nicht.
 */
export async function assertAccess(module: ModuleKey, required: AccessLevel = "EDIT") {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("notSignedIn");
  const level = await getAccessLevel(user, module);
  if (!hasAtLeast(level, required)) {
    // Modul und Stufe gehören übersetzt in die Meldung – der interne
    // Schlüssel sagt dem Betrachter nichts. Nur im Fehlerfall geladen.
    const [tm, ta] = await Promise.all([
      getTranslations("modules"),
      getTranslations("access"),
    ]);
    throw new ActionError("noPermission", {
      module: tm(module),
      level: ta(required === "EDIT" ? "edit" : required === "READ" ? "read" : "none"),
    });
  }
  return user;
}

export async function assertSuperadmin() {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) throw new ActionError("superadminOnly");
  return user;
}
