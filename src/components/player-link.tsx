"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Ein Spielername, der zum Profil führt.
 *
 * Die Profilseite gab es schon lange, nur führte kein sichtbarer Weg dorthin –
 * die Namen waren an manchen Stellen zwar verlinkt, sahen aber aus wie
 * gewöhnlicher Text. Deshalb hier eine dezente, aber dauerhaft sichtbare
 * Unterstreichung statt eines Effekts, der erst beim Darüberfahren erscheint:
 * am Handy gibt es kein Darüberfahren, und dort wird die Liste am häufigsten
 * gelesen.
 *
 * Das Profil selbst prüft die Rechte eigenständig und zeigt jedem nur, was er
 * ohnehin sehen darf – ein Link von hier öffnet also keine Hintertür.
 */
export function PlayerLink({
  playerId,
  name,
  className = "",
  children,
}: {
  playerId: string;
  /** Für den Tooltip; die Beschriftung kommt aus `children` oder von hier. */
  name: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("profile");

  return (
    <Link
      href={`/spieler/${playerId}`}
      title={t("openProfile", { name })}
      className={`underline decoration-line decoration-dotted underline-offset-[3px] hover:text-sand hover:decoration-sand-dim ${className}`}
    >
      {children ?? name}
    </Link>
  );
}
