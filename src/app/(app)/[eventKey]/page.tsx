import { redirect } from "next/navigation";

import { darfReiter, requireUser } from "@/lib/access";

/**
 * Einstieg ins Event. Für die Leitung beginnt der Wochenablauf bei der
 * Spielerliste; Mitglieder sehen nur die Wochenplanung und landen dort.
 */
export default async function EventIndex({
  params,
}: {
  params: { eventKey: string };
}) {
  const user = await requireUser();
  redirect(`/${params.eventKey}/${darfReiter(user, "spieler") ? "spieler" : "planung"}`);
}
