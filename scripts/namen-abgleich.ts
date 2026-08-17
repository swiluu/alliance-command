/**
 * Täglicher Namensabgleich über die Spielerprofile.
 *
 *   npm run abgleich:namen            # ändert
 *   npm run abgleich:namen -- --probe # meldet nur, ändert nichts
 *
 * Warum eigenständig neben `refresh-thp-ranking.ts`:
 *
 * Jenes Skript liest den **Tagesstand der Serverrangliste**. Der hat zwei
 * Grenzen, die sich nicht wegkonfigurieren lassen. Erstens reicht er nur bis
 * Platz 200 – elf aus unserem Kader liegen darunter und wurden nie geprüft.
 * Zweitens wird er erst gegen 08:30 veröffentlicht; ein Lauf davor sieht
 * zwangsläufig den Stand des Vortags.
 *
 * Dieses Skript fragt stattdessen **jedes Profil einzeln über seine
 * lastwarrank-ID** ab. Die ID ist stabil: wer sich im Spiel umbenennt, behält
 * sie. Damit findet der Abgleich jede Umbenennung, unabhängig von Platzierung
 * und Tagesstand.
 *
 * Geprüft wird **jede Stunde jedes Profil einzeln**. Das ist die verlässliche
 * Quelle: die Mitgliederliste der Allianz hinkt hinterher – als ein Spieler von
 * "Yarrrak Obama" zurück zu "Bob xD" wechselte, führte sein Profil den neuen
 * Namen bereits, die Liste stundenlang noch den alten.
 *
 * Der Preis sind rund hundert Abrufe je Stunde statt einem. Das ist bewusst so
 * gewählt: ein veralteter Name führt jeden in die Irre, der gerade im
 * Dashboard arbeitet, und ein Name kann sich jederzeit ändern. Die Quelle ist
 * die eigene Seite auf demselben Rechner.
 *
 * Die Mitgliederliste bleibt als Rückfallebene: Spieler, deren Profil sich
 * nicht lesen lässt, bekommen wenigstens den Namen aus ihr.
 */
import { PrismaClient } from "@prisma/client";

import { merkeLauf, schreibeStoerung } from "@/lib/stoerung";

const prisma = new PrismaClient();

const BASIS = process.env.LWR_BASE_URL ?? "http://localhost:3777";
/** Kennung der eigenen Allianz bei der Quelle. */
const ALLIANZ = process.env.LWR_ALLIANCE_ID ?? "045c559760b245c9adc74db53510af09";
const NUR_PROBE = process.argv.includes("--probe");
/** Wie viele Profile gleichzeitig. Bewusst klein. */
const GLEICHZEITIG = 3;
/** Pause zwischen zwei Gruppen. */
const PAUSE_MS = 400;
const ZEITLIMIT_MS = 30_000;
/**
 * Wie viele Spieler je Lauf einzeln geprüft werden – ohne Angabe alle.
 *
 * Über NAMEN_EINZELN lässt sich die Zahl senken, falls die Quelle einmal
 * geschont werden muss. Dann rotiert das Fenster mit der Stunde, damit über
 * den Tag trotzdem jeder drankommt.
 */
const EINZELN_JE_LAUF = Number(process.env.NAMEN_EINZELN ?? 0) || Number.POSITIVE_INFINITY;

/**
 * Platzhaltername eines gelöschten Accounts.
 *
 * Wird ein Account im Spiel gelöscht, führt die Quelle statt des Namens
 * "Kommandant" plus Kennung – im englischen Client "Commander". Das ist
 * endgültig: anders als ein Allianzwechsel kommt dieser Spieler nicht zurück.
 *
 * Der Name im Kader bleibt trotzdem der letzte echte. "Kommandant30ef81580"
 * sagt beim Lesen niemandem etwas, und die Spur, wer das war, wäre weg.
 * Festgehalten wird die Löschung stattdessen am Spieler.
 */
const GELOESCHT = /^(Kommandant|Commander)[0-9a-f]{6,}$/i;

type Ergebnis =
  | { art: "name"; name: string }
  | { art: "geloescht" }
  | { art: "unbekannt" }
  | { art: "fehler"; grund: string };

/**
 * Liest den aktuellen Namen aus dem Profil.
 *
 * Über das JSON-LD der Seite und nicht über den Titel: dort stehen Name und
 * ID zusammen, sodass sich prüfen lässt, ob die Antwort wirklich zum
 * angefragten Spieler gehört. Ein vertauschtes Profil würde sonst einen
 * falschen Namen in den Kader schreiben.
 */
async function holeNamen(lwrId: number): Promise<Ergebnis> {
  let res: Response;
  try {
    res = await fetch(`${BASIS}/player/${lwrId}`, {
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      headers: { "User-Agent": "alliance-command/namen-abgleich" },
    });
  } catch (e) {
    return { art: "fehler", grund: e instanceof Error ? e.message : String(e) };
  }

  if (res.status === 404) return { art: "unbekannt" };
  if (!res.ok) return { art: "fehler", grund: `HTTP ${res.status}` };

  const html = await res.text();
  const block = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!block) return { art: "fehler", grund: "kein JSON-LD im Profil" };

  try {
    const daten = JSON.parse(block[1]) as { name?: string; identifier?: string };
    if (!daten.name) return { art: "fehler", grund: "kein Name im JSON-LD" };
    if (String(daten.identifier) !== String(lwrId)) {
      return { art: "fehler", grund: `Profil gehört zu #${daten.identifier}` };
    }
    if (GELOESCHT.test(daten.name)) return { art: "geloescht" };
    return { art: "name", name: daten.name };
  } catch {
    return { art: "fehler", grund: "JSON-LD unlesbar" };
  }
}

/**
 * Alle Namen der Allianz auf einmal, als Zuordnung Profil-ID → Name.
 *
 * Schlägt der Abruf fehl, wird nicht abgebrochen: der Abgleich fällt dann auf
 * die Einzelabfrage zurück und dauert eben länger.
 */
async function holeAllianzNamen(): Promise<Map<number, string>> {
  const namen = new Map<number, string>();
  try {
    const res = await fetch(`${BASIS}/api/alliance/${ALLIANZ}`, {
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      headers: { "User-Agent": "alliance-command/namen-abgleich" },
    });
    if (!res.ok) return namen;
    const daten = (await res.json()) as { members?: { public_id: number; name: string }[] };
    for (const m of daten.members ?? []) {
      // Platzhalter gelöschter Accounts gar nicht erst aufnehmen.
      if (typeof m.public_id === "number" && m.name && !GELOESCHT.test(m.name)) {
        namen.set(m.public_id, m.name);
      }
    }
  } catch {
    /* Rückfall auf Einzelabfragen. */
  }
  return namen;
}

async function main() {
  const kader = await prisma.player.findMany({
    where: { leftAt: null, lwrId: { not: null } },
    select: { id: true, name: true, lwrId: true },
    orderBy: { name: "asc" },
  });

  const ohneId = await prisma.player.count({
    where: { leftAt: null, lwrId: null },
  });

  console.log(
    `Namensabgleich über Profile · ${kader.length} Spieler mit ID` +
      (ohneId ? `, ${ohneId} ohne ID (übersprungen)` : "") +
      (NUR_PROBE ? " · PROBE, es wird nichts geändert" : ""),
  );

  // Ein Abruf für alle: die Mitgliederliste der Allianz.
  const ausListe = await holeAllianzNamen();

  // Wer diesmal zusätzlich einzeln geprüft wird. Das Fenster wandert mit der
  // Stunde, damit über den Tag jeder drankommt.
  const menge = Math.min(EINZELN_JE_LAUF, kader.length);
  const stunde = new Date().getHours();
  const start = menge >= kader.length ? 0 : (stunde * menge) % Math.max(1, kader.length);
  const dran = new Set(
    Array.from({ length: menge }, (_, i) => kader[(start + i) % kader.length].id),
  );

  const treffer: { spieler: (typeof kader)[number]; ergebnis: Ergebnis }[] = [];
  const fehlen: typeof kader = [];

  for (const s of kader) {
    const name = ausListe.get(s.lwrId!);
    // Einzeln nachschlagen, wenn einer der drei Fälle zutrifft:
    //   – der Spieler steht nicht in der Liste,
    //   – er ist diese Stunde ohnehin an der Reihe,
    //   – oder die Liste widerspricht unserem Kader.
    //
    // Der dritte Fall ist der wichtigste: die Liste hinkt hinterher. Ihr blind
    // zu folgen hiesse, einen frisch geänderten Namen wieder auf den alten
    // zurückzusetzen. Bei einer Abweichung entscheidet deshalb immer das
    // Profil, nie die Liste.
    const strittig = name !== undefined && name !== s.name;
    if (name && !dran.has(s.id) && !strittig) {
      treffer.push({ spieler: s, ergebnis: { art: "name", name } });
    } else {
      fehlen.push(s);
    }
  }

  console.log(
    `  ${treffer.length} über die Mitgliederliste, ${fehlen.length} einzeln geprüft`,
  );

  for (let i = 0; i < fehlen.length; i += GLEICHZEITIG) {
    const gruppe = fehlen.slice(i, i + GLEICHZEITIG);
    const teil = await Promise.all(
      gruppe.map(async (s) => ({ spieler: s, ergebnis: await holeNamen(s.lwrId!) })),
    );
    treffer.push(...teil);
    if (i + GLEICHZEITIG < fehlen.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const umbenannt: string[] = [];
  const geloescht: string[] = [];
  const blockiert: string[] = [];
  const unbekannt: string[] = [];
  const fehler: string[] = [];

  for (const { spieler, ergebnis } of treffer) {
    if (ergebnis.art === "geloescht") {
      // Der Name bleibt. Vermerkt wird nur, dass der Account weg ist – und
      // das nur einmal, nicht bei jedem stündlichen Lauf erneut.
      geloescht.push(`${spieler.name} (#${spieler.lwrId})`);
      if (!NUR_PROBE) {
        const schon = await prisma.player.findUnique({
          where: { id: spieler.id },
          select: { accountDeletedAt: true },
        });
        if (!schon?.accountDeletedAt) {
          await prisma.player.update({
            where: { id: spieler.id },
            data: { accountDeletedAt: new Date() },
          });
          await prisma.activityLog.create({
            data: {
              userName: "Automatik",
              module: "allianz",
              action: "Account gelöscht",
              detail: `${spieler.name} – das Spielprofil #${spieler.lwrId} führt nur noch einen Platzhalter`,
            },
          });
        }
      }
      continue;
    }
    if (ergebnis.art === "unbekannt") {
      unbekannt.push(`${spieler.name} (#${spieler.lwrId})`);
      continue;
    }
    if (ergebnis.art === "fehler") {
      fehler.push(`${spieler.name} (#${spieler.lwrId}): ${ergebnis.grund}`);
      continue;
    }
    if (ergebnis.name === spieler.name) continue;

    // Der Name ist im Kader eindeutig. Ist er schon vergeben, lieber melden
    // als überschreiben – das wäre ein stiller Datensalat.
    const belegt = await prisma.player.findFirst({
      where: { name: ergebnis.name, NOT: { id: spieler.id } },
      select: { id: true },
    });
    if (belegt) {
      blockiert.push(`${spieler.name} → ${ergebnis.name} (Name schon vergeben)`);
      continue;
    }

    if (!NUR_PROBE) {
      await prisma.player.update({
        where: { id: spieler.id },
        data: { name: ergebnis.name },
      });
      // Hängt ein Konto am Spieler, wandert sein Anzeigename mit.
      await prisma.user.updateMany({
        where: { playerId: spieler.id },
        data: { displayName: ergebnis.name },
      });
      await prisma.activityLog.create({
        data: {
          userName: "Automatik",
          module: "allianz",
          action: "Spieler umbenannt",
          detail: `${spieler.name} → ${ergebnis.name} (Profil #${spieler.lwrId})`,
        },
      });
      // Zusätzlich am Spieler festhalten: das Protokoll wird beschnitten,
      // die Namenshistorie soll bleiben.
      await prisma.nameChange.create({
        data: {
          playerId: spieler.id,
          vorher: spieler.name,
          nachher: ergebnis.name,
          quelle: "abgleich",
        },
      });
    }
    umbenannt.push(`${spieler.name} → ${ergebnis.name}`);
  }

  console.log(`\n✓ ${umbenannt.length} Umbenennung(en)${NUR_PROBE ? " gefunden" : ""}`);
  if (geloescht.length) {
    console.log(`\n· ${geloescht.length} gelöschte(r) Account(s) – Name bleibt:`);
    for (const z of geloescht) console.log(`   ${z}`);
  }
  for (const z of umbenannt) console.log(`   ${z}`);
  if (blockiert.length) {
    console.log(`\n! ${blockiert.length} nicht übernommen:`);
    for (const z of blockiert) console.log(`   ${z}`);
  }
  if (unbekannt.length) {
    console.log(`\n· ${unbekannt.length} Profil(e) unbekannt bei der Quelle:`);
    for (const z of unbekannt) console.log(`   ${z}`);
  }
  if (fehler.length) {
    console.log(`\n✗ ${fehler.length} Fehler:`);
    for (const z of fehler) console.log(`   ${z}`);
  }

  if (NUR_PROBE) return;

  // Konnte ein Teil der Profile nicht gelesen werden, bleiben deren Namen
  // veraltet – das gehört gemeldet. Ein einzelner Ausfall ist kein Drama,
  // aber niemand soll es erst merken, wenn ein falscher Name auffällt.
  if (fehler.length > 0) {
    await schreibeStoerung(prisma, {
      source: "Namensabgleich",
      fehler: new Error(
        `${fehler.length} von ${kader.length} Profilen nicht lesbar – diese Namen bleiben veraltet.\n` +
          fehler.slice(0, 20).join("\n"),
      ),
    });
  }

  await merkeLauf(prisma, "namen-abgleich");
}

main()
  .catch(async (e) => {
    console.error("✗ Abgleich fehlgeschlagen:", e instanceof Error ? e.message : e);
    await schreibeStoerung(prisma, { source: "Namensabgleich", fehler: e });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
