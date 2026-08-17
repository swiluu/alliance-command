import { getTranslations } from "next-intl/server";

import { getAccessMap, requireUser } from "@/lib/access";
import { TACTICAL_EVENTS, type EventKey } from "@/lib/constants";
import { getFairnessReport } from "@/server/fairness";

import { FairnessView } from "./fairness-view";

export async function generateMetadata() {
  const t = await getTranslations("fairness");
  return { title: t("title") };
}

export default async function FairnessPage() {
  const user = await requireUser();
  const access = await getAccessMap(user);

  // Gezeigt wird nur, wofür jemand ohnehin Leserecht hat – die Seite fasst
  // bestehende Daten zusammen, sie öffnet keine neuen.
  const events = TACTICAL_EVENTS.filter((e) => access[e] !== "NONE") as EventKey[];
  const mitZug = access.zug !== "NONE";

  const report = await getFairnessReport(events, mitZug);
  const t = await getTranslations("fairness");
  const tm = await getTranslations("modules");

  return (
    <div className="max-w-[1100px] mx-auto">
      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
        <h1 className="text-3xl text-sand">{t("heading")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>
      </header>

      {events.length === 0 && !mitZug ? (
        <div className="panel p-8 text-center text-sm text-muted">{t("noModules")}</div>
      ) : (
        <FairnessView
          report={report}
          labels={Object.fromEntries(events.map((e) => [e, tm(e)]))}
          mitZug={mitZug}
        />
      )}
    </div>
  );
}
