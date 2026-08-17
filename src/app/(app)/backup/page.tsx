import { getTranslations } from "next-intl/server";

import { requireAccess } from "@/lib/access";
import { KEEP_BACKUPS, backupStats, listBackups } from "@/server/backup-service";

import { BackupList } from "./backup-list";

export async function generateMetadata() {
  const t = await getTranslations("backup");
  return { title: t("title") };
}

export default async function BackupPage() {
  const { level } = await requireAccess("backup", "READ");
  const [files, stats] = await Promise.all([listBackups(), backupStats()]);
  const t = await getTranslations("backup");
  const te = await getTranslations("event");

  return (
    <div className="max-w-[1000px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
          <h1 className="text-3xl text-sand">{t("heading")}</h1>
          <p className="mt-1 text-sm text-muted">{t("intro", { keep: KEEP_BACKUPS })}</p>
        </div>
        {level === "READ" && (
          <span className="tag border-sand-dim text-sand">{te("readOnly")}</span>
        )}
      </header>

      <BackupList
        files={files.map((f) => ({
          name: f.name,
          size: f.size,
          createdAt: f.createdAt.toISOString(),
          reason: f.reason,
        }))}
        stats={{
          count: stats.count,
          totalSize: stats.totalSize,
          dbSize: stats.dbSize,
        }}
        canEdit={level === "EDIT"}
      />
    </div>
  );
}
