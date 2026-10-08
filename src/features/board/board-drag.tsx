import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import type { ActivityState } from "#/features/activities/model";

const states: ActivityState[] = [
  "available",
  "inProgress",
  "waiting",
  "completed",
  "deferred",
  "dismissed",
];
const columnCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.code)) return;
  event.preventDefault();
  const current = String(context.over?.id ?? context.active?.data.current?.state);
  const index = states.indexOf(current as ActivityState);
  const next =
    states[
      Math.min(states.length - 1, Math.max(0, index + (event.code === "ArrowRight" ? 1 : -1)))
    ];
  const rect = next ? context.droppableRects.get(next) : undefined;
  return rect ? { x: rect.left + rect.width / 2, y: currentCoordinates.y } : undefined;
};
export function BoardDrag({
  children,
  move,
  disabled,
}: {
  children: ReactNode;
  move: (id: string, state: ActivityState) => void;
  disabled: boolean;
}) {
  const [dragContent, setDragContent] = useState<ReactNode>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );
  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setDragContent(active.data.current?.content)}
      onDragCancel={() => setDragContent(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press space to pick up a task, left and right arrows to choose its status, and space to drop. Escape cancels.",
        },
      }}
      onDragEnd={({ active, over }) => {
        setDragContent(null);
        if (
          !disabled &&
          over &&
          states.includes(over.id as ActivityState) &&
          active.data.current?.state !== over.id
        )
          move(String(active.id), over.id as ActivityState);
      }}
    >
      {children}
      <DragOverlay>
        {dragContent && <div className="rounded-2xl border bg-card shadow-lg">{dragContent}</div>}
      </DragOverlay>
    </DndContext>
  );
}
export function BoardDropColumn({
  state,
  label,
  children,
}: {
  state: ActivityState;
  label: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`flex w-[320px] min-w-[300px] shrink-0 snap-start flex-col overflow-y-auto border-r pb-5 ${isOver ? "bg-accent" : ""}`}
    >
      {children}
    </section>
  );
}
export function BoardDragCard({
  id,
  state,
  disabled,
  open,
  children,
}: {
  id: string;
  state: ActivityState;
  disabled: boolean;
  open: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id,
    data: { state, content: children },
    disabled,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={open}
      className={`group rounded-2xl border border-black/5 bg-white text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring dark:bg-card ${isDragging ? "opacity-30" : ""}`}
    >
      {children}
    </button>
  );
}
