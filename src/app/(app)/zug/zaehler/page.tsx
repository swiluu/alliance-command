import { requireAccess } from "@/lib/access";
import { isoWeekOf } from "@/lib/iso-week";
import { getCounters } from "@/server/zug-service";

import { CounterTable } from "./counter-table";

export default async function ZaehlerPage() {
  await requireAccess("zug", "READ");
  const jetzt = isoWeekOf();
  const rows = await getCounters(jetzt);

  return <CounterTable rows={rows} currentKW={jetzt.kw} />;
}
