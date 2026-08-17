"use server";

import { ActionError } from "@/server/action-error";
import { revalidatePath } from "next/cache";

import { assertAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { MAX_PLAYERS, REG_NICHT_TEIL, TACTICAL_EVENTS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { runAction } from "@/server/action-result";

/**
 * Der Spieler-Stamm ist modulübergreifend: ein Spieler taucht in Wüstensturm,
 * Schluchtsturm und Zug gleichzeitig auf. Wer hier schreibt, verändert alle
 * Module – deshalb hängen diese Aktionen am eigenen Modul "allianz" und nicht
 * an den Event-Rechten.
 */

/** Nach einer Stammdaten-Änderung ist praktisch jede Seite betroffen. */
function revalidateEverywhere() {
  revalidatePath("/allianz");
  revalidatePath("/uebersicht");
  revalidatePath("/zug", "layout");
  for (const eventKey of TACTICAL_EVENTS) revalidatePath(`/${eventKey}`, "layout");
}

export async function addPlayer(
  name: string,
  allianceTag: string,
  notes: string,
  external = false,
) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const clean = name.trim();
    if (!clean) throw new ActionError("nameEmpty");

    // Externe zählen nicht gegen die Kadergrösse – sie besetzen keinen Platz.
    if (!external) {
      const count = await prisma.player.count({ where: { leftAt: null, isExternal: false } });
      if (count >= MAX_PLAYERS) throw new ActionError("maxPlayers", { max: MAX_PLAYERS });
    }

    const exists = await prisma.player.findUnique({ where: { name: clean } });
    if (exists) {
      // Kommt jemand zurück, bekommt er seinen alten Datensatz samt Historie.
      if (exists.leftAt) {
        await prisma.player.update({
          where: { id: exists.id },
          data: {
            leftAt: null,
            isExternal: external,
            allianceTag: allianceTag.trim() || exists.allianceTag,
          },
        });
        await logActivity(user, "Spieler reaktiviert", {
          module: "allianz",
          detail: `${clean} – war schon einmal dabei, Historie übernommen`,
        });
        revalidateEverywhere();
        return;
      }
      throw new ActionError("playerExists", { name: clean });
    }

    const player = await prisma.player.create({
      data: {
        name: clean,
        allianceTag: allianceTag.trim() || "[R3]",
        notes: notes.trim() || null,
        isExternal: external,
      },
    });

    // Zustände für jedes taktische Event anlegen, damit der Spieler überall
    // sofort auftaucht – abgemeldet und nicht gesperrt. Externe gehören nicht
    // in die taktischen Events, sie fahren nur Zug.
    for (const eventKey of external ? [] : TACTICAL_EVENTS) {
      await prisma.playerEventState.create({ data: { playerId: player.id, eventKey } });
      await prisma.registrationStatus.create({
        data: { playerId: player.id, eventKey, status: REG_NICHT_TEIL },
      });
    }

    await logActivity(user, external ? "Externen angelegt" : "Spieler hinzugefügt", {
      module: "allianz",
      detail: external ? `${clean} – nur Zug` : clean,
    });
    revalidateEverywhere();
  });
}

/**
 * Neuzugang aus dem lastwarrank-Alarm übernehmen.
 *
 * Die Übersicht kennt Name, THP und die stabile lwrId bereits – abgetippt
 * werden musste der Name trotzdem. Genau dabei sind in diesem Projekt schon
 * Tippfehler entstanden, die Einträge ins Leere laufen liessen. Hier wird
 * übernommen, was die Quelle liefert.
 */
export async function adoptFromRoster(
  lwrId: number,
  name: string,
  thpRaw: string | null,
) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const clean = name.trim();
    if (!clean) throw new ActionError("nameEmpty");
    if (!Number.isInteger(lwrId)) throw new ActionError("invalidPlayerId");

    const schonDa = await prisma.player.findFirst({
      where: { OR: [{ lwrId }, { name: clean }] },
    });
    if (schonDa && !schonDa.leftAt) {
      throw new ActionError("alreadyInRoster", { name: schonDa.name });
    }

    const count = await prisma.player.count({ where: { leftAt: null, isExternal: false } });
    if (count >= MAX_PLAYERS) throw new ActionError("maxPlayers", { max: MAX_PLAYERS });

    // War die Person schon einmal da, bekommt sie ihren alten Datensatz samt
    // Historie zurück – wie beim manuellen Hinzufügen auch.
    if (schonDa?.leftAt) {
      await prisma.player.update({
        where: { id: schonDa.id },
        data: { leftAt: null, isExternal: false, lwrId, name: clean },
      });
      await logActivity(user, "Spieler reaktiviert", {
        module: "allianz",
        detail: `${clean} – aus dem lastwarrank-Alarm, Historie übernommen`,
      });
      revalidateEverywhere();
      return;
    }

    const player = await prisma.player.create({
      data: { name: clean, lwrId, thpRaw, thpUpdated: thpRaw ? new Date() : null },
    });

    for (const eventKey of TACTICAL_EVENTS) {
      await prisma.playerEventState.create({ data: { playerId: player.id, eventKey } });
      await prisma.registrationStatus.create({
        data: { playerId: player.id, eventKey, status: REG_NICHT_TEIL },
      });
    }

    await logActivity(user, "Neuzugang übernommen", {
      module: "allianz",
      detail: `${clean} (lastwarrank #${lwrId})`,
    });
    revalidateEverywhere();
  });
}

/**
 * Zwischen Kader und externem Allianzmitglied umschalten.
 *
 * Externe fahren Zug und bekommen VIP, gehören aber nicht zum Kader: sie
 * zählen nicht gegen die Obergrenze und erscheinen weder in Wüstensturm und
 * Schluchtsturm noch im lastwarrank-Abgleich.
 */
export async function setPlayerExternal(playerId: string, external: boolean) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.isExternal === external) return;

    if (!external) {
      const count = await prisma.player.count({ where: { leftAt: null, isExternal: false } });
      if (count >= MAX_PLAYERS) throw new ActionError("maxPlayers", { max: MAX_PLAYERS });

      // Erst beim Eintritt in den Kader entstehen die Event-Zustände.
      for (const eventKey of TACTICAL_EVENTS) {
        await prisma.playerEventState.upsert({
          where: { playerId_eventKey: { playerId, eventKey } },
          create: { playerId, eventKey },
          update: {},
        });
        await prisma.registrationStatus.upsert({
          where: { playerId_eventKey: { playerId, eventKey } },
          create: { playerId, eventKey, status: REG_NICHT_TEIL },
          update: {},
        });
      }
    }

    await prisma.player.update({ where: { id: playerId }, data: { isExternal: external } });

    await logActivity(user, external ? "Als extern markiert" : "In den Kader übernommen", {
      module: "allianz",
      detail: player.name,
    });
    revalidateEverywhere();
  });
}

/**
 * Spieler aus der Allianz nehmen.
 *
 * Es wird **grundsätzlich nichts gelöscht**, sondern nur als ausgetreten
 * markiert. Ein echtes Löschen würde über die Kaskaden alle Zuteilungen,
 * Historie-Einträge, Sperren und Zug-Tage mitreissen – vergangene Wochen
 * zeigten dann Lücken statt der Leute, die damals gespielt haben. Kommt jemand
 * zurück, steht mit `reactivatePlayer` alles unverändert wieder da.
 *
 * Wirklich entfernen lässt sich nur ein Datensatz ganz ohne Spuren, und das
 * ausschliesslich über `purgePlayer`.
 */
export async function deletePlayer(playerId: string) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        _count: { select: { rotations: true, assignments: true, bans: true } },
      },
    });
    if (!player) throw new ActionError("playerNotFound");

    const zugDays = await prisma.zugDay.count({
      where: {
        OR: [
          { plannedDriverId: playerId },
          { actualDriverId: playerId },
          { vipPlayerId: playerId },
        ],
      },
    });
    const spuren =
      player._count.rotations + player._count.assignments + player._count.bans + zugDays;

    // Aus laufenden und künftigen Wochen herausnehmen, Vergangenes stehen lassen.
    const seasons = await prisma.season.findMany();
    await prisma.$transaction([
      prisma.player.update({ where: { id: playerId }, data: { leftAt: new Date() } }),
      prisma.registrationStatus.updateMany({
        where: { playerId },
        data: { status: REG_NICHT_TEIL },
      }),
      ...seasons.map((s) =>
        prisma.weeklyAssignment.deleteMany({
          where: { playerId, eventKey: s.eventKey, week: { gte: s.currentWeek } },
        }),
      ),
      // Aus der R4-Warteschlange raus: sie filtert Ausgetretene nicht, sonst
      // stünde jemand als nächster Zugführer da, der nicht mehr dabei ist.
      prisma.r4RotationQueue.deleteMany({ where: { playerId } }),
      // Der Zug-Eintrag bleibt. Er hält nur das R4-Kennzeichen, und alle
      // Stellen, die ihn lesen, blenden Ausgetretene ohnehin aus. Kommt die
      // Person zurück, ist ihre Zug-Zugehörigkeit damit sofort wieder da –
      // sonst wäre sie beim Reaktivieren still verloren.
    ]);

    await logActivity(user, "Spieler ausgetreten", {
      module: "allianz",
      detail:
        spuren > 0
          ? `${player.name} – Historie bleibt erhalten (${spuren} Einträge)`
          : `${player.name} – ohne Einträge, steht unter „Ehemalige“`,
    });
    revalidateEverywhere();
  });
}

/**
 * Endgültiges Löschen – abgeschaltet.
 *
 * Wer aus dem Kader genommen wird, bleibt als „Ehemaliger“ stehen, ausnahmslos.
 * Das war die ausdrückliche Vorgabe: ein Abgang soll nachvollziehbar bleiben,
 * auch Jahre später und auch dann, wenn der Datensatz nie an einer Woche, einer
 * Sperre oder einer Zugfahrt hing.
 *
 * Die Aktion bleibt bestehen und weist ab, statt ersatzlos zu verschwinden:
 * sollte sie doch noch irgendwo aufgerufen werden, ist die Antwort eindeutig
 * und nicht ein stiller Erfolg.
 */
export async function purgePlayer(_playerId: string) {
  return runAction(async () => {
    await assertAccess("allianz", "EDIT");
    throw new ActionError("purgeDisabled");
  });
}

/** Ein Ehemaliger kommt zurück: Datensatz samt Historie wieder aktivieren. */
export async function reactivatePlayer(playerId: string) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new ActionError("playerNotFound");
    if (!player.leftAt) return;

    const active = await prisma.player.count({ where: { leftAt: null, isExternal: false } });
    if (active >= MAX_PLAYERS) throw new ActionError("maxActivePlayers", { max: MAX_PLAYERS });

    await prisma.player.update({ where: { id: playerId }, data: { leftAt: null } });
    await logActivity(user, "Spieler reaktiviert", {
      module: "allianz",
      detail: player.name,
    });
    revalidateEverywhere();
  });
}

/**
 * Setzt oder beendet den R2-Zustand eines Spielers.
 *
 * Festgehalten wird ein Zeitraum, kein Schalter: markieren öffnet einen
 * Eintrag, aufheben schliesst ihn. Dadurch bleibt nachvollziehbar, wen es wann
 * getroffen hat und wie oft – ein Schalter hätte die Vergangenheit jedes Mal
 * überschrieben.
 *
 * Der Rang gilt im Spiel für beide Events, deshalb hängt der Eintrag am
 * Spieler. Gesperrt wird nichts: die Anmeldung bleibt möglich, damit beim
 * wöchentlichen Gegenprüfen sichtbar bleibt, wer sich gemeldet hat.
 */
export async function togglePlayerR2(playerId: string) {
  return runAction(async () => {
    const user = await assertAccess("r2", "EDIT");

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { name: true },
    });
    if (!player) throw new ActionError("playerNotFound");

    const offen = await prisma.r2Record.findFirst({
      where: { playerId, until: null },
      orderBy: { since: "desc" },
    });

    if (offen) {
      await prisma.r2Record.update({
        where: { id: offen.id },
        data: { until: new Date(), liftedBy: user.displayName },
      });
    } else {
      await prisma.r2Record.create({
        data: { playerId, markedBy: user.displayName },
      });
    }

    await logActivity(user, offen ? "R2 aufgehoben" : "R2 markiert", {
      module: "r2",
      detail: player.name,
    });

    revalidatePath("/r2");
    // Beide Events zeigen das Kennzeichen in ihrer Spielerliste.
    revalidatePath("/wuestensturm", "layout");
    revalidatePath("/schluchtsturm", "layout");
  });
}

export async function renamePlayer(playerId: string, newName: string) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const clean = newName.trim();
    if (!clean) throw new ActionError("nameEmpty");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new ActionError("playerNotFound");

    const clash = await prisma.player.findUnique({ where: { name: clean } });
    if (clash && clash.id !== playerId) throw new ActionError("playerExists", { name: clean });

    await prisma.player.update({ where: { id: playerId }, data: { name: clean } });

    // Hängt ein Konto an diesem Spieler, wandert sein Anzeigename mit. Sonst
    // stünde in der Zugriffsverwaltung und in der Seitenleiste weiter der alte
    // Name – der Anmeldename bleibt davon unberührt.
    await prisma.user.updateMany({
      where: { playerId },
      data: { displayName: clean },
    });

    await logActivity(user, "Spieler umbenannt", {
      module: "allianz",
      detail: `${player.name} → ${clean}`,
    });
    // Und in die Namenshistorie am Spieler – anders als das Protokoll wird
    // sie nicht beschnitten und steht auf seinem Profil.
    await prisma.nameChange.create({
      data: {
        playerId,
        vorher: player.name,
        nachher: clean,
        quelle: user.displayName,
      },
    });
    revalidateEverywhere();
  });
}

/**
 * Raus↔Rein.
 *
 * `resetHistory` entscheidet, was fachlich passiert:
 *
 *   true  – echter Mitgliederwechsel. Der Vorgänger tritt aus (bleibt mit
 *           seiner Historie in vergangenen Wochen sichtbar), der Nachfolger
 *           wird als neuer Spieler angelegt und startet bei null.
 *   false – derselbe Mensch, neuer Account. Der Datensatz wird nur umbenannt,
 *           Historie und Sperren laufen mit. Nur hier ist es richtig, dass
 *           auch vergangene Wochen den neuen Namen zeigen.
 */
export async function replacePlayer(
  playerId: string,
  newName: string,
  resetHistory = false,
) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const clean = newName.trim();
    if (!clean) throw new ActionError("nameEmpty");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new ActionError("playerNotFound");

    const clash = await prisma.player.findUnique({ where: { name: clean } });
    if (clash && clash.id !== playerId && !clash.leftAt) {
      throw new ActionError("existsAsOwn", { name: clean });
    }

    if (!resetHistory) {
      // Account-Wechsel: derselbe Datensatz, neuer Name.
      await prisma.player.update({
        where: { id: playerId },
        data: { name: clean, lwrId: null, thpRaw: null, thpValue: null, thpUpdated: null },
      });
      await logActivity(user, "Spieler ersetzt", {
        module: "allianz",
        detail: `${player.name} → ${clean} · Historie übernommen`,
      });
      revalidateEverywhere();
      return;
    }

    // Mitgliederwechsel: Vorgänger tritt aus, Nachfolger kommt neu dazu.
    const seasons = await prisma.season.findMany();
    await prisma.$transaction([
      prisma.player.update({ where: { id: playerId }, data: { leftAt: new Date() } }),
      prisma.registrationStatus.updateMany({
        where: { playerId },
        data: { status: REG_NICHT_TEIL },
      }),
      ...seasons.map((s) =>
        prisma.weeklyAssignment.deleteMany({
          where: { playerId, eventKey: s.eventKey, week: { gte: s.currentWeek } },
        }),
      ),
      // Aus der R4-Warteschlange raus: sie filtert Ausgetretene nicht, sonst
      // stünde jemand als nächster Zugführer da, der nicht mehr dabei ist.
      prisma.r4RotationQueue.deleteMany({ where: { playerId } }),
      // Der Zug-Eintrag bleibt. Er hält nur das R4-Kennzeichen, und alle
      // Stellen, die ihn lesen, blenden Ausgetretene ohnehin aus. Kommt die
      // Person zurück, ist ihre Zug-Zugehörigkeit damit sofort wieder da –
      // sonst wäre sie beim Reaktivieren still verloren.
    ]);

    if (clash?.leftAt) {
      // Der Nachfolger war früher schon einmal dabei.
      await prisma.player.update({ where: { id: clash.id }, data: { leftAt: null } });
    } else {
      const neu = await prisma.player.create({
        data: { name: clean, allianceTag: player.allianceTag },
      });
      for (const eventKey of TACTICAL_EVENTS) {
        await prisma.playerEventState.create({ data: { playerId: neu.id, eventKey } });
        await prisma.registrationStatus.create({
          data: { playerId: neu.id, eventKey, status: REG_NICHT_TEIL },
        });
      }
    }

    await logActivity(user, "Spieler ersetzt", {
      module: "allianz",
      detail: `Raus: ${player.name} (bleibt in der Historie) · Rein: ${clean}`,
    });
    revalidateEverywhere();
  });
}

export async function updatePlayerDetails(
  playerId: string,
  allianceTag: string,
  notes: string,
) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new ActionError("playerNotFound");

    await prisma.player.update({
      where: { id: playerId },
      data: {
        allianceTag: allianceTag.trim() || "[R3]",
        notes: notes.trim() || null,
      },
    });

    await logActivity(user, "Stammdaten geändert", {
      module: "allianz",
      detail: player.name,
    });
    revalidateEverywhere();
  });
}
