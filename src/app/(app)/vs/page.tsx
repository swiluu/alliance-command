import { requireAccess } from "@/lib/access";
import { VS_WINDOW } from "@/lib/vs";
import { getVsRanking } from "@/server/vs-service";

import { VsView } from "./vs-view";

/** "2026-32" aus der Adresszeile in eine Woche zurückübersetzen. */
function parseBis(value: string | undefined) {
  const m = value?.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return undefined;
  return { year: Number(m[1]), kw: Number(m[2]) };
}

export default async function VsPage({
  searchParams,
}: {
  searchParams: { bis?: string };
}) {
  await requireAccess("vs", "READ");
  const ranking = await getVsRanking(parseBis(searchParams.bis));

  return (
    <VsView
      weeks={ranking.weeks}
      rows={ranking.rows}
      available={ranking.available}
      window={VS_WINDOW}
    />
  );
}
