import { FormEvent, useState } from "react";
import type { BoardSummary } from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  activeBoardId: number;
  onSelect: (boardId: number) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

const buttonClass =
  "rounded-lg border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)]";

export const BoardSwitcher = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [mode, setMode] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const activeBoard = boards.find((board) => board.id === activeBoardId);

  const openForm = (nextMode: "create" | "rename") => {
    setMode(nextMode);
    setName(nextMode === "rename" ? (activeBoard?.name ?? "") : "");
    setIsConfirmingDelete(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await (mode === "create" ? onCreate(trimmed) : onRename(trimmed));
    setMode(null);
  };

  const handleDelete = async () => {
    await onDelete();
    setIsConfirmingDelete(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Board"
        className="rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)]"
        value={activeBoardId}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {board.name}
          </option>
        ))}
      </select>

      {mode ? (
        <form className="flex items-center gap-2" onSubmit={handleSubmit}>
          <input
            aria-label="Board name"
            className="rounded-lg border border-[var(--stroke)] px-3 py-2 text-sm"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <button
            className="rounded-lg bg-[var(--secondary-purple)] px-3 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            {mode === "create" ? "Create" : "Save"}
          </button>
          <button className={buttonClass} type="button" onClick={() => setMode(null)}>
            Cancel
          </button>
        </form>
      ) : isConfirmingDelete ? (
        <>
          <span className="text-sm text-[var(--navy-dark)]">
            Delete &ldquo;{activeBoard?.name}&rdquo;?
          </span>
          <button
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={handleDelete}
          >
            Confirm delete
          </button>
          <button className={buttonClass} type="button" onClick={() => setIsConfirmingDelete(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button className={buttonClass} type="button" onClick={() => openForm("create")}>
            New board
          </button>
          <button className={buttonClass} type="button" onClick={() => openForm("rename")}>
            Rename
          </button>
          <button
            className={buttonClass}
            type="button"
            disabled={boards.length <= 1}
            onClick={() => setIsConfirmingDelete(true)}
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
};
