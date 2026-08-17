/**
 * Legt den initialen Superadmin und die beiden Event-Konfigurationen an.
 * Idempotent – mehrfaches Ausführen ändert nichts Bestehendes.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

import { TACTICAL_EVENTS } from "../src/lib/constants";
import { EVENT_LAYOUTS } from "../src/lib/event-layouts";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_ADMIN_USER?.trim() || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD;
  const displayName = process.env.SEED_ADMIN_NAME?.trim() || "Allianz-Admin";

  if (!password || password.length < 8) {
    throw new Error(
      "SEED_ADMIN_PASSWORD fehlt oder ist zu kurz (mindestens 8 Zeichen). Siehe .env.example.",
    );
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`• Superadmin "${username}" existiert bereits – unverändert gelassen.`);
  } else {
    await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: await hash(password, 12),
        isSuperadmin: true,
      },
    });
    console.log(`✓ Superadmin "${username}" angelegt.`);
  }

  for (const [i, eventKey] of TACTICAL_EVENTS.entries()) {
    const layout = EVENT_LAYOUTS[eventKey];
    await prisma.eventConfig.upsert({
      where: { eventKey },
      create: {
        eventKey,
        displayName: layout.displayName,
        totalWeeks: layout.totalWeeks,
        positionLayout: JSON.stringify(layout.groups),
        sortOrder: i,
      },
      // Layout-Änderungen im Code sollen beim Seed durchschlagen.
      update: {
        displayName: layout.displayName,
        totalWeeks: layout.totalWeeks,
        positionLayout: JSON.stringify(layout.groups),
        sortOrder: i,
      },
    });
    await prisma.season.upsert({
      where: { eventKey },
      create: { eventKey, currentWeek: 1 },
      update: {},
    });
    console.log(`✓ Event "${eventKey}" konfiguriert (${layout.groups.length} Gruppen).`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
