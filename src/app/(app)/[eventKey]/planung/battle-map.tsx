"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

import { ActionScope, ConfirmButton, useOptimisticRows } from "@/components/action";
import {
  groupsByUnlock,
  substituteGroup,
  unlockBadge,
  type PositionGroup,
} from "@/lib/event-layouts";
import { BAN_DURATION_WEEKS } from "@/lib/constants";
import {
  assignToSlot,
  clearSlot,
  closeWeek,
  setSubstitutePair,
  setTeamAssignment,
} from "@/server/actions/event-actions";
import type { AssignmentRow, PoolPlayer } from "@/server/event-service";

import { AutoAssignButton } from "./auto-assign-button";
import { LiveSync } from "./live-sync";

type Team = "A" | "B";

const SLOT_PREFIX = "slot";
const POOL_PREFIX = "pool";

function slotId(team: Team, positionKey: string, slotIndex: number) {
  return `${SLOT_PREFIX}:${team}:${positionKey}:${slotIndex}`;
}

function poolId(team: Team) {
  return `${POOL_PREFIX}:${team}`;
}

function parseSlotId(id: string) {
  const [prefix, team, positionKey, slotIndex] = id.split(":");
  if (prefix !== SLOT_PREFIX) return null;
  return { team: team as Team, positionKey, slotIndex: Number(slotIndex) };
}

/**
 * Schritt 2 der Wochenplanung. Wer in welchem Team spielt, steht schon fest –
 * hier werden nur noch die Positionen innerhalb des Teams verteilt. Team A
 * links, Team B rechts, jeweils mit dem eigenen, noch nicht platzierten Kader.
 */
export function BattleMap({
  eventKey,
  week,
  groups,
  pool,
  assignments,
  canEdit,
  slotsPerTeam,
  showUnlocks,
}: {
  eventKey: string;
  week: number;
  groups: PositionGroup[];
  pool: PoolPlayer[];
  assignments: AssignmentRow[];
  canEdit: boolean;
  slotsPerTeam: number;
  showUnlocks: boolean;
}) {
  /**
   * Zuteilungen werden sofort lokal umgestellt und erst danach zum Server
   * geschickt – ein Roundtrip plus Neuaufbau der Seite ist zu lang, um den
   * Koordinator beim Verteilen warten zu lassen.
   */
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const { rows, mutate } = useOptimisticRows(assignments);

  const mainGroupList = useMemo(() => groupsByUnlock(groups), [groups]);
  const subGroup = useMemo(() => substituteGroup(groups), [groups]);

  // Tap-to-select: Ersatz für Drag & Drop auf reinen Touch-Geräten.
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ name: string; thpRaw: string | null } | null>(
    null,
  );

  const sensors = useSensors(
    // 8px Toleranz: unterhalb davon bleibt es ein Klick/Tap.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const poolById = useMemo(() => {
    const m = new Map<string, PoolPlayer>();
    for (const p of pool) m.set(p.playerId, p);
    return m;
  }, [pool]);

  const bySlot = useMemo(() => {
    const map = new Map<string, AssignmentRow>();
    for (const a of rows) {
      if (a.team && a.positionKey && a.slotIndex !== null) {
        map.set(slotId(a.team, a.positionKey, a.slotIndex), a);
      }
    }
    return map;
  }, [rows]);

  /** Pro Team: zugeteilt, aber noch auf keiner Position. */
  const benchByTeam = useMemo(() => {
    const m: Record<Team, AssignmentRow[]> = { A: [], B: [] };
    for (const a of rows) {
      if (a.team && a.positionKey === null) m[a.team].push(a);
    }
    for (const team of ["A", "B"] as Team[]) {
      m[team].sort((x, y) => {
        // Nach THP, stärkster zuerst: beim Besetzen der Positionen wird zuerst
        // gefragt, wer schlagkräftig ist. Die Priorität aus der Fairness steht
        // weiterhin als Kennzeichen an jedem Eintrag – sie bestimmt nur nicht
        // mehr die Reihenfolge. Wer keinen Wert hat, steht am Ende: eine
        // fehlende Zahl ist keine Null.
        // Direkt aus der Zuteilung, nicht über den Pool: dort steht nur, wer
        // angemeldet ist, und ein Wert von dort fehlte genau dann, wenn er
        // gebraucht wird.
        const tx = x.thpValue ?? -1;
        const ty = y.thpValue ?? -1;
        return ty - tx || x.playerName.localeCompare(y.playerName, "de");
      });
    }
    return m;
  }, [rows, poolById]);

  /**
   * Wer auf einer Hauptposition steht – nur die kann ein Ersatz ablösen.
   *
   * Hängt an `rows`, nicht an `assignments`: `rows` ist der optimistische
   * Stand und wird erst in einem Effekt nachgezogen. Mit `assignments` als
   * Abhängigkeit rechnete die Liste im selben Durchlauf noch mit den alten
   * Zeilen und wurde danach nie wieder neu gebaut – wer frisch auf eine
   * Hauptposition gerutscht war, fehlte dann in der Raus-Auswahl, und das
   * Feld zeigte "—", obwohl die Paarung gespeichert war.
   */
  const mainByTeam = useMemo(() => {
    const m: Record<Team, AssignmentRow[]> = { A: [], B: [] };
    for (const a of rows) {
      if (a.team && a.positionKey && !a.isSubstitute) m[a.team].push(a);
    }
    for (const t of ["A", "B"] as Team[]) {
      m[t].sort((x, y) => x.playerName.localeCompare(y.playerName, "de"));
    }
    return m;
  }, [rows]);

  const counts = useMemo(() => {
    let a = 0;
    let b = 0;
    for (const x of rows) {
      if (x.team === "A") a++;
      else if (x.team === "B") b++;
    }
    return { a, b, total: a + b };
  }, [rows]);

  /** Baut die Zeile für einen Spieler – aus der bestehenden Zuteilung oder dem Pool. */
  function rowFor(playerId: string, current: AssignmentRow[]): AssignmentRow | null {
    const existing = current.find((r) => r.playerId === playerId);
    if (existing) return existing;
    const p = poolById.get(playerId);
    if (!p) return null;
    return {
      id: `optimistic:${playerId}`,
      playerId,
      playerName: p.name,
      thpRaw: p.thpRaw,
      thpValue: p.thpValue,
      team: null,
      positionKey: null,
      slotIndex: null,
      isSubstitute: false,
      replacesPlayerId: null,
      replacesName: null,
      isHunterBuild: p.isHunterBuild,
    };
  }

  /** Raus↔Rein setzen – ebenfalls sofort sichtbar. */
  function onPair(substitutePlayerId: string, replacesPlayerId: string | null) {
    if (!canEdit) return;
    mutate(
      (current) => {
        const target = replacesPlayerId
          ? current.find((r) => r.playerId === replacesPlayerId)
          : null;
        return current.map((r) => {
          if (r.playerId === substitutePlayerId) {
            return {
              ...r,
              replacesPlayerId,
              replacesName: target?.playerName ?? null,
            };
          }
          // Ein Hauptspieler wird höchstens einmal abgelöst.
          if (replacesPlayerId && r.isSubstitute && r.replacesPlayerId === replacesPlayerId) {
            return { ...r, replacesPlayerId: null, replacesName: null };
          }
          return r;
        });
      },
      () => setSubstitutePair(eventKey, substitutePlayerId, replacesPlayerId),
    );
  }

  function place(playerId: string, target: string) {
    if (!canEdit) return;
    setSelected(null);

    if (target.startsWith(POOL_PREFIX)) {
      const team = target.split(":")[1] as Team;
      // Zurück in den Team-Kader: Position freigeben, Team behalten.
      mutate(
        (current) => {
          const row = rowFor(playerId, current);
          if (!row) return current;
          return [
            ...current.filter((r) => r.playerId !== playerId),
            { ...row, team, positionKey: null, slotIndex: null, isSubstitute: false },
          ];
        },
        () => setTeamAssignment(eventKey, playerId, team),
      );
      return;
    }

    const slot = parseSlotId(target);
    if (!slot) return;

    mutate(
      (current) => {
        const row = rowFor(playerId, current);
        if (!row) return current;
        return [
          // Wer den Slot bisher hatte, verliert nur die Position, nicht das Team.
          ...current
            .filter((r) => r.playerId !== playerId)
            .map((r) =>
              r.team === slot.team &&
              r.positionKey === slot.positionKey &&
              r.slotIndex === slot.slotIndex
                ? { ...r, positionKey: null, slotIndex: null, isSubstitute: false, replacesPlayerId: null, replacesName: null }
                : r,
            ),
          {
            ...row,
            team: slot.team,
            positionKey: slot.positionKey,
            slotIndex: slot.slotIndex,
            isSubstitute: Boolean(subGroup && slot.positionKey === subGroup.key),
          },
        ];
      },
      () => assignToSlot(eventKey, playerId, slot.team, slot.positionKey, slot.slotIndex),
    );
  }

  function onDragStart(e: DragStartEvent) {
    const playerId = String(e.active.id).replace("player:", "");
    const p = poolById.get(playerId);
    const a = rows.find((x) => x.playerId === playerId);
    setDragging(
      p
        ? { name: p.name, thpRaw: p.thpRaw }
        : a
          ? { name: a.playerName, thpRaw: a.thpRaw }
          : null,
    );
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    place(String(e.active.id).replace("player:", ""), String(e.over.id));
  }

  /**
   * Gibt eine Position frei. Der Spieler bleibt im Team und rutscht in den
   * Kader daneben; ganz aus dem Team nimmt ihn nur die Team-Zuteilung.
   */
  function freeSlot(target: string, occupied: AssignmentRow) {
    if (!canEdit) return;
    const slot = parseSlotId(target);
    if (!slot) return;
    setSelected(null);
    mutate(
      (current) =>
        current.map((r) =>
          r.playerId === occupied.playerId
            ? {
                ...r,
                positionKey: null,
                slotIndex: null,
                isSubstitute: false,
                replacesPlayerId: null,
                replacesName: null,
              }
            : r,
        ),
      () => clearSlot(eventKey, slot.team, slot.positionKey, slot.slotIndex),
    );
  }

  /**
   * Klick auf einen Slot. Ohne Vormerkung wird der Spieler vorgemerkt (siehe
   * Slot), mit Vormerkung wird gesetzt – ausser man tippt den vorgemerkten
   * Spieler erneut an, dann wird seine Position freigegeben.
   */
  function onSlotClick(target: string, occupied?: AssignmentRow) {
    if (!canEdit) return;
    const slot = parseSlotId(target);

    if (occupied && selected === occupied.playerId) {
      setSelected(null);
      freeSlot(target, occupied);
      return;
    }
    if (selected) place(selected, target);
  }

  const unassigned = pool.filter((p) => !rows.some((a) => a.playerId === p.playerId));

  return (
    <ActionScope>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <TeamCounter label="Team A" value={counts.a} max={slotsPerTeam} />
          <TeamCounter label="Team B" value={counts.b} max={slotsPerTeam} />
          <TeamCounter label={t("total")} value={counts.total} max={slotsPerTeam * 2} />
          {unassigned.length > 0 && (
            <Link
              href={`/${eventKey}/teams`}
              className="tag border-sand-dim text-sand hover:border-sand"
              title={t("withoutTeamTitle")}
            >
              {t("withoutTeam", { count: unassigned.length })}
            </Link>
          )}
          <LiveSync eventKey={eventKey} week={week} paused={dragging !== null} />
          <div className="flex-1" />
          {canEdit && <AutoAssignButton eventKey={eventKey} />}
          {canEdit && (
            <ConfirmButton
              className="btn btn-primary"
              label={t("closeWeek")}
              title={t("closeWeekTitle", { week })}
              message={t("closeWeekMessage", {
                week,
                next: week + 1,
                ban: BAN_DURATION_WEEKS,
              })}
              confirmLabel={t("closeWeekConfirm")}
              onConfirm={() => closeWeek(eventKey)}
            />
          )}
        </div>

        {selected && (
          <div className="mb-3 rounded border border-sand-dim bg-sand/10 px-3 py-2 text-sm text-sand">
            <strong>{poolById.get(selected)?.name}</strong> {t("armed")}{" "}
            <button type="button" className="underline" onClick={() => setSelected(null)}>
              {tc("cancel")}
            </button>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          {(["A", "B"] as Team[]).map((team) => (
            <TeamBoard
              key={team}
              eventKey={eventKey}
              team={team}
              groups={mainGroupList}
              subGroup={subGroup}
              bySlot={bySlot}
              bench={benchByTeam[team]}
              mainPlayers={mainByTeam[team]}
              poolById={poolById}
              canEdit={canEdit}
              selected={selected}
              showUnlocks={showUnlocks}
              onSlotClick={onSlotClick}
              onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
              onClear={freeSlot}
              onPair={onPair}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="rounded border border-sand bg-panel px-2 py-1 text-sm text-sand shadow-panel">
              {dragging.name}
              {dragging.thpRaw && (
                <span className="ml-2 font-mono text-[11px] text-muted">
                  {dragging.thpRaw}
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </ActionScope>
  );
}

function TeamCounter({ label, value, max }: { label: string; value: number; max: number }) {
  const full = value >= max;
  return (
    <div
      className={`panel px-3 py-2 font-mono text-sm border ${
        full ? "border-ok/60 text-ok" : "border-sand-dim/60 text-sand"
      }`}
    >
      <span className="text-muted">{label}:</span> {value} / {max}
    </div>
  );
}

// ── Battle-Map pro Team ─────────────────────────────────────

function TeamBoard({
  eventKey,
  team,
  groups,
  subGroup,
  bySlot,
  bench,
  mainPlayers,
  poolById,
  canEdit,
  selected,
  showUnlocks,
  onSlotClick,
  onSelect,
  onClear,
  onPair,
}: {
  eventKey: string;
  team: Team;
  groups: PositionGroup[];
  subGroup?: PositionGroup;
  bySlot: Map<string, AssignmentRow>;
  bench: AssignmentRow[];
  mainPlayers: AssignmentRow[];
  poolById: Map<string, PoolPlayer>;
  canEdit: boolean;
  selected: string | null;
  showUnlocks: boolean;
  onSlotClick: (target: string, occupied?: AssignmentRow) => void;
  onSelect: (playerId: string) => void;
  onClear: (target: string, occupied: AssignmentRow) => void;
  onPair: (substitutePlayerId: string, replacesPlayerId: string | null) => void;
}) {
  const t = useTranslations("plan");
  const { setNodeRef, isOver } = useDroppable({ id: poolId(team), disabled: !canEdit });

  // Der noch nicht platzierte Kader steht als hohe Spalte aussen: bei Team A
  // links, bei Team B rechts. So bleibt er beim Ziehen dauerhaft sichtbar,
  // statt als schmaler Streifen über den Positionen zu kleben.
  const benchPanel = (
    <div
      ref={setNodeRef}
      className={`rounded border p-2 lg:sticky lg:top-4 lg:self-start ${
        isOver ? "border-sand bg-sand/5" : "border-line bg-panel-2/40"
      }`}
      aria-label={t("benchAria", { team })}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
        <h3 className="text-xs uppercase tracking-wider text-muted">{t("benchTitle")}</h3>
        <span className="tag">{bench.length}</span>
      </div>

      {bench.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted">{t("benchEmpty")}</p>
      ) : (
        <ul className="space-y-1 lg:max-h-[62vh] lg:overflow-y-auto">
          {bench.map((b) => (
            <li key={b.id}>
              <BenchChip
                assignment={b}
                poolEntry={poolById.get(b.playerId)}
                canEdit={canEdit}
                selected={selected === b.playerId}
                onSelect={() => onSelect(b.playerId)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="panel" aria-label={t("boardAria", { team })}>
      <div className="panel-head">
        <h2 className="text-base">
          <span className="text-sand">Team {team}</span>
          <span className="text-muted text-xs ml-2">{t("lineup")}</span>
        </h2>
        <span className="tag">{t("stillOpen", { count: bench.length })}</span>
      </div>

      <div
        className={`p-3 grid gap-3 ${
          team === "A"
            ? "lg:grid-cols-[minmax(0,230px)_minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(0,230px)]"
        }`}
      >
        {team === "A" && benchPanel}

        <div className="min-w-0">
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <PositionCard
                key={g.key}
                team={team}
                group={g}
                bySlot={bySlot}
                canEdit={canEdit}
                selected={selected}
                showUnlock={showUnlocks}
                onSlotClick={onSlotClick}
                onSelect={onSelect}
                onClear={onClear}
              />
            ))}
          </div>

          {subGroup && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-muted">
                  <span aria-hidden>{subGroup.icon}</span> {subGroup.label}
                  {subGroup.labelEn && <span> / {subGroup.labelEn}</span>}
                </h3>
                <span className="tag">{t("subJoins")}</span>
              </div>

              {/* Reihenfolge und Beschriftung wie im Sheet und im Ankündigungsbild:
                  links wer rausgeht, rechts wer dafür reinkommt. */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1.5 items-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-danger">
                    {t("out")}
                  </div>
                  <div className="text-[10px] text-muted">{t("outHint")}</div>
                </div>
                <div />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ok">{t("in")}</div>
                  <div className="text-[10px] text-muted">{t("inHint")}</div>
                </div>

                {Array.from({ length: subGroup.slots }, (_, i) => {
                  const occupied = bySlot.get(slotId(team, subGroup.key, i));
                  return (
                    <Fragment key={i}>
                      <RotationSelect
                        eventKey={eventKey}
                        substitute={occupied}
                        candidates={mainPlayers}
                        canEdit={canEdit}
                        onChange={onPair}
                      />
                      <span className="text-sand text-xs" aria-hidden>
                        →
                      </span>
                      <Slot
                        id={slotId(team, subGroup.key, i)}
                        index={i}
                        occupied={occupied}
                        canEdit={canEdit}
                        armed={Boolean(selected)}
                        selected={selected}
                        onClick={onSlotClick}
                        onSelect={onSelect}
                        onClear={onClear}
                      />
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {team === "B" && benchPanel}
      </div>
    </section>
  );
}

function BenchChip({
  assignment,
  poolEntry,
  canEdit,
  selected,
  onSelect,
}: {
  assignment: AssignmentRow;
  poolEntry?: PoolPlayer;
  canEdit: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const tp = useTranslations("priority");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player:${assignment.playerId}`,
    disabled: !canEdit,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={onSelect}
      disabled={!canEdit}
      aria-pressed={selected}
      title={poolEntry ? `${poolEntry.tag.icon} ${tp(poolEntry.tag.key)}` : undefined}
      className={`w-full flex items-center justify-between gap-2 rounded border px-2 py-2 md:py-1.5 text-left text-xs transition-colors ${
        selected
          ? "border-sand bg-sand/15 text-sand"
          : "border-line bg-panel hover:border-sand-dim"
      } ${isDragging ? "opacity-40" : ""} ${canEdit ? "cursor-grab" : "cursor-default"}`}
    >
      <span className="leading-tight min-w-0">
        <span className="block truncate">
          {assignment.playerName}

        </span>
        <span className="block font-mono text-[10px] text-muted">
          {assignment.thpRaw ?? "–"}
        </span>
      </span>
      {poolEntry && (
        <span className={`tag shrink-0 ${poolEntry.tag.cls}`}>{poolEntry.tag.icon}</span>
      )}
    </button>
  );
}

function PositionCard({
  team,
  group,
  bySlot,
  canEdit,
  selected,
  showUnlock,
  onSlotClick,
  onSelect,
  onClear,
}: {
  team: Team;
  group: PositionGroup;
  bySlot: Map<string, AssignmentRow>;
  canEdit: boolean;
  selected: string | null;
  showUnlock: boolean;
  onSlotClick: (target: string, occupied?: AssignmentRow) => void;
  onSelect: (playerId: string) => void;
  onClear: (target: string, occupied: AssignmentRow) => void;
}) {
  const t = useTranslations("plan");
  const te = useTranslations("event");
  const occupants = Array.from({ length: group.slots }, (_, i) =>
    bySlot.get(slotId(team, group.key, i)),
  );
  // Die Jäger-Pflicht hängt an der Position, nicht am Spieler: wer hier steht,
  // stellt einen Jäger-Marsch. Es gibt deshalb nichts zu bemängeln, nur
  // anzusagen.
  const needHunters = group.requiredHunterCount ?? 0;

  return (
    <div
      className={`rounded border border-line bg-panel-2/60 p-2 ${
        group.fullWidth ? "sm:col-span-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-xs font-medium leading-tight">
          <span aria-hidden className="mr-1">
            {group.icon}
          </span>
          {group.label}
          {group.labelEn && (
            <span className="text-muted font-normal"> / {group.labelEn}</span>
          )}
        </h3>
        <div className="flex flex-col items-end gap-1">
          {showUnlock && (
            <span
              className={`tag ${
                group.unlockDelayMinutes > 0 ? "border-sand-dim text-sand" : ""
              }`}
            >
              {(() => {
                const b = unlockBadge(group.unlockDelayMinutes);
                return te(b.key, { minutes: b.minutes });
              })()}
            </span>
          )}
          {needHunters > 0 && (
            <span
              className="tag border-sand-dim text-sand"
              title={t("hunterTitle", { count: needHunters })}
            >
              🎯 {t("hunterBadge", { count: needHunters })}
            </span>
          )}
        </div>
      </div>

      <div className={`grid gap-1.5 ${group.fullWidth ? "sm:grid-cols-2" : ""}`}>
        {occupants.map((occupied, i) => (
          <Slot
            key={i}
            id={slotId(team, group.key, i)}
            index={i}
            occupied={occupied}
            canEdit={canEdit}
            armed={Boolean(selected)}
            selected={selected}
            onClick={onSlotClick}
            onSelect={onSelect}
            onClear={onClear}
          />
        ))}
      </div>
    </div>
  );
}

function Slot({
  id,
  index,
  occupied,
  canEdit,
  armed,
  selected,
  onClick,
  onSelect,
  onClear,
}: {
  id: string;
  index: number;
  occupied?: AssignmentRow;
  canEdit: boolean;
  armed: boolean;
  selected: string | null;
  onClick: (target: string, occupied?: AssignmentRow) => void;
  onSelect: (playerId: string) => void;
  onClear: (target: string, occupied: AssignmentRow) => void;
}) {
  const t = useTranslations("plan");
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canEdit });
  // Besetzte Slots sind selbst ziehbar – so lässt sich direkt umsortieren.
  const draggable = useDraggable({
    id: `player:${occupied?.playerId ?? id}`,
    disabled: !canEdit || !occupied,
  });

  const state = occupied
    ? "border-ok/40 bg-ok/10 text-ink"
    : armed
      ? "border-sand/60 bg-sand/5 text-muted"
      : "border-dashed border-line text-muted";

  const isSelected = occupied && selected === occupied.playerId;

  return (
    <div ref={setNodeRef} className="relative min-w-0">
      <button
        ref={occupied ? draggable.setNodeRef : undefined}
        {...(occupied ? draggable.listeners : {})}
        {...(occupied ? draggable.attributes : {})}
        type="button"
        disabled={!canEdit}
        onClick={() => {
          // Belegter Slot ohne Vormerkung: Spieler vormerken statt leeren,
          // damit sich innerhalb des Teams direkt tauschen lässt.
          if (occupied && !selected) {
            onSelect(occupied.playerId);
            return;
          }
          onClick(id, occupied);
        }}
        title={
          occupied
            ? t("slotOccupied", {
                name: `${occupied.playerName}${occupied.thpRaw ? ` · ${occupied.thpRaw}` : ""}`,
              })
            : t("slotEmpty")
        }
        className={`w-full rounded border py-2 md:py-1 pl-2 text-left text-xs transition-colors ${
          occupied && canEdit ? "pr-8" : "pr-2"
        } ${state} ${
          isOver ? "border-sand bg-sand/20" : ""
        } ${isSelected ? "border-sand bg-sand/15" : ""} ${
          canEdit ? "hover:border-sand-dim cursor-grab" : "cursor-default"
        } ${draggable.isDragging ? "opacity-40" : ""}`}
      >
        {occupied ? (
          <span className="block leading-tight">
            <span className="block truncate">
              {occupied.playerName}

            </span>
            <span className="block font-mono text-[10px] text-muted">
              {occupied.thpRaw ?? "–"}
            </span>
          </span>
        ) : (
          <span className="opacity-60">P{index + 1}</span>
        )}
      </button>

      {/* Ein Klick gibt die Position frei – ohne den Umweg über das Vormerken. */}
      {occupied && canEdit && (
        <button
          type="button"
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded px-2 py-2 md:py-1 text-xs leading-none text-muted hover:bg-danger/20 hover:text-danger"
          title={t("removeFromSlot", { name: occupied.playerName })}
          aria-label={t("removeFromSlot", { name: occupied.playerName })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClear(id, occupied);
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * "Raus" zum jeweiligen Ersatzspieler: welchen Spieler auf einer Hauptposition
 * er ablöst. Entspricht der Rotations-Spalte neben der Ersatzbank im
 * Original-Sheet.
 */
function RotationSelect({
  substitute,
  candidates,
  canEdit,
  onChange,
}: {
  eventKey: string;
  substitute?: AssignmentRow;
  candidates: AssignmentRow[];
  canEdit: boolean;
  onChange: (substitutePlayerId: string, replacesPlayerId: string | null) => void;
}) {
  const t = useTranslations("plan");

  if (!substitute) {
    return <span className="text-xs text-muted opacity-50 px-2">—</span>;
  }

  if (!canEdit) {
    return (
      <span className="text-xs truncate px-1" title={substitute.replacesName ?? undefined}>
        {substitute.replacesName ?? "—"}
      </span>
    );
  }

  return (
    <select
      className="input py-2 text-base md:py-1 md:text-xs"
      value={substitute.replacesPlayerId ?? ""}
      aria-label={t("replaces", { name: substitute.playerName })}
      onChange={(e) => onChange(substitute.playerId, e.target.value || null)}
    >
      <option value="">—</option>
      {candidates.map((c) => (
        <option key={c.playerId} value={c.playerId}>
          {c.playerName}
        </option>
      ))}
    </select>
  );
}
