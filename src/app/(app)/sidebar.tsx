"use client";

import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { ALLIANZ_TAG } from "@/lib/allianz";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LocaleSwitch } from "@/components/locale-switch";
import { MODULES, MODULE_META, type AccessLevel, type ModuleKey } from "@/lib/constants";
import type { SessionUser } from "@/lib/access";

/** Farbiger Punkt für die Zugriffsstufe: grün = Edit, sand = Read, grau = kein Zugriff. */
function AccessDot({ level }: { level: AccessLevel }) {
  const t = useTranslations("access");
  const cls = level === "EDIT" ? "bg-ok" : level === "READ" ? "bg-sand" : "bg-line";
  const title = level === "EDIT" ? t("edit") : level === "READ" ? t("read") : t("none");
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-black/40 md:h-2 md:w-2 ${cls}`}
      title={title}
      aria-label={title}
    />
  );
}

/**
 * Auf dem Handy bekommt die Navigation eine eigene, volle Zeile unter dem Logo –
 * gequetscht neben Logo und Konto-Knöpfen blieb für die Einträge zu wenig Platz.
 * Ab `md` steht sie als Spalte links.
 */
export function Sidebar({
  user,
  access,
}: {
  user: SessionUser;
  access: Record<ModuleKey, AccessLevel>;
}) {
  const t = useTranslations("nav");
  const tm = useTranslations("modules");
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  /** Gleiche Optik für alle Einträge – am Handy als deutlich sichtbarer Chip. */
  const itemClass = (active: boolean) =>
    `flex items-center gap-2 whitespace-nowrap rounded border px-3 py-2.5 text-sm transition-colors md:py-2 ${
      active
        ? "border-sand bg-sand/15 text-sand font-medium"
        : "border-line bg-panel-2 text-ink hover:border-sand-dim hover:text-sand md:border-transparent md:bg-transparent"
    }`;

  return (
    <nav
      aria-label={t("label")}
      className="border-b border-line bg-panel md:w-60 md:shrink-0 md:min-h-screen md:border-b-0 md:border-r"
    >
      <div className="md:sticky md:top-0 md:px-4 md:py-5">
        {/* Kopfzeile: am Handy Logo und Konto nebeneinander */}
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 md:block md:p-0">
          <Link href="/uebersicht" className="block shrink-0">
            <div className="font-display text-2xl leading-none tracking-[0.18em] text-sand">
              {ALLIANZ_TAG}
            </div>
            <div className="font-display text-[11px] tracking-[0.3em] text-muted">
              COMMAND
            </div>
          </Link>

          <div className="flex items-center gap-1 md:hidden">
            <LocaleSwitch />
            {user.playerId ? (
              <Link
                href={`/spieler/${user.playerId}`}
                className="max-w-[9rem] truncate text-xs text-muted underline decoration-line decoration-dotted underline-offset-[3px] hover:text-sand"
                title={t("ownProfile")}
              >
                {user.displayName}
              </Link>
            ) : (
              <span className="max-w-[9rem] truncate text-xs text-muted" title={user.displayName}>
                {user.displayName}
              </span>
            )}
            <Link href="/passwort" className="btn px-2 py-2 text-xs" title={t("changePassword")}>
              🔒
            </Link>
            <button
              type="button"
              className="btn px-2 py-2 text-xs"
              title={t("signOut")}
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              ⏻
            </button>
          </div>
        </div>

        {/* Navigation: am Handy eigene Zeile über die volle Breite */}
        <ul className="scroll-x flex gap-1.5 overflow-x-auto px-4 pb-3 md:mt-6 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0">
          <li>
            <Link href="/uebersicht" className={itemClass(isActive("/uebersicht"))}>
              <span aria-hidden>▦</span>
              <span>{t("overview")}</span>
            </Link>
          </li>

          {/*
            Das eigene Profil gleich hinter der Übersicht: es beantwortet die
            häufigste Frage überhaupt – bin ich diese Woche eingeteilt. Nur für
            Konten mit Kadereintrag; ohne den führte der Eintrag ins Leere.
          */}
          {user.playerId && (
            <li>
              <Link
                href={`/spieler/${user.playerId}`}
                className={itemClass(pathname === `/spieler/${user.playerId}`)}
              >
                <span aria-hidden>👤</span>
                <span>{t("ownProfile")}</span>
              </Link>
            </li>
          )}

          <li>
            <Link href="/abwesenheit" className={itemClass(isActive("/abwesenheit"))}>
              <span aria-hidden>🌴</span>
              <span>{t("absence")}</span>
            </Link>
          </li>

          <li>
            <Link href="/fairness" className={itemClass(isActive("/fairness"))}>
              <span aria-hidden>⚖</span>
              <span>{t("fairness")}</span>
            </Link>
          </li>

          {/* Serverstellung neben die THP-Rangliste: beides beantwortet die
              Frage "wo stehen wir", einmal nach innen, einmal nach aussen. */}
          <li>
            <Link href="/serverstellung" className={itemClass(isActive("/serverstellung"))}>
              <span aria-hidden>🌍</span>
              <span>{t("standing")}</span>
            </Link>
          </li>

          <li>
            <Link href="/rangliste" className={itemClass(isActive("/rangliste"))}>
              <span aria-hidden>🏆</span>
              <span>{t("ranking")}</span>
            </Link>
          </li>

          {/*
            Nur zeigen, worauf jemand Zugriff hat. Ein ausgegrauter Eintrag
            nennt zwar ehrlich, was es gäbe – für Mitglieder ist das aber nur
            Rauschen über Dinge, die sie nichts angehen.
          */}
          {MODULES.filter((m) => access[m] !== "NONE").map((m) => {
            const meta = MODULE_META[m];
            const level = access[m];

            return (
              <li key={m}>
                <Link href={meta.href} className={itemClass(isActive(meta.href))}>
                  <AccessDot level={level} />
                  <span aria-hidden>{meta.icon}</span>
                  <span>{tm(m)}</span>
                </Link>
              </li>
            );
          })}

          {user.isSuperadmin && (
            <li className="md:mt-4 md:border-t md:border-line md:pt-4">
              <Link href="/zugriff" className={itemClass(isActive("/zugriff"))}>
                <span aria-hidden>🔑</span>
                <span>{t("accessAdmin")}</span>
              </Link>
            </li>
          )}
        </ul>

        {/* Konto-Bereich nur am Desktop – am Handy steht er oben in der Kopfzeile */}
        <div className="hidden md:mt-8 md:block md:border-t md:border-line md:pt-4">
          <div className="mb-2 truncate text-xs text-muted" title={user.displayName}>
            {user.playerId ? (
              <Link
                href={`/spieler/${user.playerId}`}
                className="underline decoration-line decoration-dotted underline-offset-[3px] hover:text-sand"
                title={t("ownProfile")}
              >
                {user.displayName}
              </Link>
            ) : (
              user.displayName
            )}
            {user.isSuperadmin && <span className="tag ml-2">{t("superadmin")}</span>}
          </div>
          <div className="mb-2">
            <LocaleSwitch className="w-full justify-center" />
          </div>
          <div className="flex gap-1">
            <Link href="/passwort" className="btn flex-1 text-xs" title={t("changeOwnPassword")}>
              {t("password")}
            </Link>
            <button
              type="button"
              className="btn flex-1 text-xs"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
