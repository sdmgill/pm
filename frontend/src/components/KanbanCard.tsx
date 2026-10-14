import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string) => void;
  isCelebrating?: boolean;
  reducedMotion?: boolean;
};

export const KanbanCard = ({
  card,
  onDelete,
  onEdit,
  isCelebrating = false,
  reducedMotion = false,
}: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ title: card.title, details: card.details });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setDraft({ title: card.title, details: card.details });
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      return;
    }
    onEdit(card.id, title, draft.details.trim());
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]",
        isCelebrating && !reducedMotion && "done-card-celebrate",
        isCelebrating && reducedMotion && "done-card-highlight"
      )}
      {...(isEditing ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
      data-celebrating={isCelebrating ? "true" : "false"}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            aria-label="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            autoFocus
            required
          />
          <textarea
            value={draft.details}
            onChange={(event) => setDraft((prev) => ({ ...prev, details: event.target.value }))}
            aria-label="Card details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 break-words">
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              {card.details}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              aria-label={`Edit ${card.title}`}
              title="Edit"
            >
              <svg {...iconProps}>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
              aria-label={`Delete ${card.title}`}
              title="Delete"
            >
              <svg {...iconProps}>
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
