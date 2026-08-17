"use client";

import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ActionScope, ConfirmButton, useOptimisticRows } from "@/components/action";
import { advanceRotation, reorderRotation, toggleR4Rotation } from "@/server/actions/zug-actions";

type QueueEntry = {
  id: string;
  playerId: string;
  name: string;
  position: number;
  lastDrivenKW: number | null;
  driverCount: number;
};

export function RotationList({
  queue,
  candidates,
  currentKW,
  canEdit,
}: {
  queue: QueueEntry[];
  candidates: { id: string; name: string }[];
  currentKW: number;
  canEdit: boolean;
}) {
  const t = useTranslations("zug");
  // Umsortieren und Aufnehmen greifen sofort; gespeichert wird im Hintergrund.
  const { rows: items, mutate } = useOptimisticRows(queue);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const from = items.findIndex((i) => i.playerId === active.id);
    const to = items.findIndex((i) => i.playerId === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(items, from, to);
    mutate(
      () => next,
      () => reorderRotation(next.map((i) => i.playerId)),
    );
  }

  return (
    <ActionScope>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-head flex-wrap">
            <div>
              <h2 className="text-lg">{t("rotationHeading")}</h2>
              <p className="text-xs text-muted font-mono">
                {t("rotationSubline", { count: items.length, kw: currentKW })}
              </p>
            </div>
            {canEdit && items.length > 1 && (
              <ConfirmButton
                className="btn text-xs"
                label={t("advance")}
                title={t("advance")}
                message={t("advanceMessage", { name: items[0]?.name ?? "" })}
                onConfirm={() => advanceRotation()}
              />
            )}
          </div>

          <div className="p-3">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t("rotationEmpty")}</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={items.map((i) => i.playerId)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="space-y-1">
                    {items.map((item, i) => (
                      <SortableRow
                        key={item.playerId}
                        item={item}
                        index={i}
                        canEdit={canEdit}
                        currentKW={currentKW}
                        onRemove={() =>
                          mutate(
                            (cur) => cur.filter((q) => q.playerId !== item.playerId),
                            () => toggleR4Rotation(item.playerId),
                          )
                        }
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            )}
            <p className="mt-4 text-xs text-muted">{t("rotationHint")}</p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="text-lg">{t("addHeading")}</h2>
            <span className="tag">{candidates.length}</span>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
            {candidates
              .filter((c) => !items.some((i) => i.playerId === c.id))
              .map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    mutate(
                      (cur) => [
                        ...cur,
                        {
                          id: `optimistic:${c.id}`,
                          playerId: c.id,
                          name: c.name,
                          position: cur.length + 1,
                          lastDrivenKW: null,
                          driverCount: 0,
                        },
                      ],
                      () => toggleR4Rotation(c.id),
                    )
                  }
                  className="w-full flex items-center justify-between gap-2 rounded border border-line bg-panel-2 px-3 py-2.5 text-sm text-left hover:border-sand-dim disabled:opacity-40"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="tag shrink-0">{t("addToRotation")}</span>
                </button>
              </li>
            ))}
            {candidates.length === 0 && (
              <li className="py-6 text-center text-sm text-muted">{t("allInRotation")}</li>
            )}
          </ul>
        </section>
      </div>
    </ActionScope>
  );
}

function SortableRow({
  item,
  index,
  canEdit,
  currentKW,
  onRemove,
}: {
  item: QueueEntry;
  index: number;
  canEdit: boolean;
  currentKW: number;
  onRemove: () => void;
}) {
  const t = useTranslations("zug");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.playerId, disabled: !canEdit });

  const gap = item.lastDrivenKW === null ? null : currentKW - item.lastDrivenKW;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded border border-line bg-panel-2 px-2 py-1.5 text-sm ${
        isDragging ? "opacity-60 border-sand" : ""
      }`}
    >
      <span className="font-mono text-xs text-muted w-6 shrink-0">{index + 1}</span>
      {canEdit && (
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="cursor-grab text-muted hover:text-sand shrink-0 px-2 py-1 -my-1 touch-none"
          aria-label={t("moveAria", { name: item.name })}
        >
          ⋮⋮
        </button>
      )}
      <span className="flex-1 truncate">{item.name}</span>
      <span className="tag shrink-0" title={t("driverCountTitle")}>
        {item.driverCount}×
      </span>
      <span
        className={`tag shrink-0 ${gap !== null && gap >= 4 ? "border-ok/50 text-ok" : ""}`}
        title={t("lastDrivenTitle")}
      >
        {item.lastDrivenKW === null ? t("never") : t("weekShort", { kw: item.lastDrivenKW })}
      </span>
      {canEdit && (
        <button
          type="button"
          className="text-muted hover:text-danger shrink-0 px-2 py-1 -my-1"
          onClick={onRemove}
          aria-label={t("removeAria", { name: item.name })}
        >
          ✕
        </button>
      )}
    </li>
  );
}
