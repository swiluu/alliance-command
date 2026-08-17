"use server";

import { assertAccess } from "@/lib/access";
import { isEventKey } from "@/lib/constants";
import { prisma } from "@/lib/db";

/**
 * Kurzform des Aufstellungsstands einer Woche.
 *
 * Die Wochenplanung machen zwei Leute gleichzeitig. Bisher sah jeder nur seine
 * eigenen Änderungen und musste die Seite von Hand neu laden, um die des
 * anderen zu sehen – mit dem Risiko, jemanden zweimal zu setzen oder eine
 * Position doppelt zu besetzen.
 *
 * Statt jedes Mal die ganze Aufstellung zu übertragen, liefert diese Abfrage
 * nur eine kurze Zeichenkette. Ändert sie sich, holt die Seite die Daten
 * selbst nach. Bei rund hundertzwanzig Zeilen und einem Abruf alle paar
 * Sekunden ist das billiger als jede andere Lösung – und braucht weder eine
 * dauerhafte Verbindung noch zusätzliche Dienste.
 */
export async function planStand(eventKey: string, week: number): Promise<string> {
  if (!isEventKey(eventKey)) return "";
  // Lesen genügt: wer die Planung sehen darf, darf auch wissen, ob sie sich
  // geändert hat.
  await assertAccess(eventKey, "READ");

  const zeilen = await prisma.weeklyAssignment.findMany({
    where: { eventKey, week },
    orderBy: { id: "asc" },
    select: {
      id: true,
      playerId: true,
      team: true,
      positionKey: true,
      slotIndex: true,
      isSubstitute: true,
      replacesPlayerId: true,
    },
  });

  // Jede Angabe, die auf dem Brett sichtbar ist, fliesst ein – sonst bliebe
  // eine Änderung unbemerkt, die man sehen kann.
  return zeilen
    .map(
      (z) =>
        `${z.id}:${z.playerId}:${z.team ?? ""}:${z.positionKey ?? ""}:` +
        `${z.slotIndex ?? ""}:${z.isSubstitute ? 1 : 0}:${z.replacesPlayerId ?? ""}`,
    )
    .join("|");
}
