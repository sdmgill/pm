"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import {
  createId,
  initialData,
  isCelebrationCooldownElapsed,
  moveCard,
  resolveMoveColumnIds,
  shouldCelebrateDoneMove,
  type BoardData,
} from "@/lib/kanban";

const DONE_COLUMN_ID = "col-done";
const CELEBRATION_COOLDOWN_MS = 2200;
const CELEBRATION_VISIBLE_MS = 1000;

type ConfettiPiece = {
  id: string;
  dx: number;
  dy: number;
  rotation: number;
  delay: number;
  color: string;
};

type CelebrationState = {
  cardId: string;
  originX: number;
  originY: number;
  pieces: ConfettiPiece[];
};

const confettiColors = ["#ecad0a", "#209dd7", "#753991", "#032147"];

const buildConfettiPieces = (): ConfettiPiece[] => {
  return Array.from({ length: 18 }, (_, index) => ({
    id: `piece-${index}`,
    dx: (Math.random() - 0.5) * 240,
    dy: 130 + Math.random() * 90,
    rotation: Math.random() * 360,
    delay: Math.random() * 140,
    color: confettiColors[index % confettiColors.length],
  }));
};

type KanbanBoardProps = {
  board?: BoardData;
  onBoardChange?: (nextBoard: BoardData) => void;
};

export const KanbanBoard = ({ board, onBoardChange }: KanbanBoardProps) => {
  const [localBoard, setLocalBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const boardRegionRef = useRef<HTMLDivElement | null>(null);
  const celebrationTimeoutRef = useRef<number | null>(null);
  const lastCelebrationAtRef = useRef(0);

  const currentBoard = board ?? localBoard;

  const updateBoard = (nextBoard: BoardData) => {
    if (!board) {
      setLocalBoard(nextBoard);
    }
    onBoardChange?.(nextBoard);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => currentBoard.cards, [currentBoard.cards]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => setPrefersReducedMotion(media.matches);
    applyPreference();

    media.addEventListener?.("change", applyPreference);
    return () => {
      media.removeEventListener?.("change", applyPreference);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current !== null) {
        window.clearTimeout(celebrationTimeoutRef.current);
      }
    };
  }, []);

  const getCelebrationOrigin = (event: DragEndEvent, toColumnId: string) => {
    const boardRect = boardRegionRef.current?.getBoundingClientRect();
    if (!boardRect) {
      return { x: 160, y: 120 };
    }

    const translated = event.active.rect.current.translated;
    if (translated) {
      const x = translated.left + translated.width / 2 - boardRect.left;
      const y = translated.top + translated.height / 2 - boardRect.top;
      return { x, y };
    }

    const targetColumn = boardRegionRef.current?.querySelector(
      `[data-testid=\"column-${toColumnId}\"]`
    ) as HTMLElement | null;
    if (targetColumn) {
      const rect = targetColumn.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - boardRect.left,
        y: rect.top + 84 - boardRect.top,
      };
    }

    return { x: boardRect.width - 180, y: 130 };
  };

  const triggerDoneCelebration = (
    event: DragEndEvent,
    cardId: string,
    toColumnId: string
  ) => {
    const now = Date.now();
    if (
      !isCelebrationCooldownElapsed(
        lastCelebrationAtRef.current,
        now,
        CELEBRATION_COOLDOWN_MS
      )
    ) {
      return;
    }
    lastCelebrationAtRef.current = now;

    const origin = getCelebrationOrigin(event, toColumnId);
    setCelebration({
      cardId,
      originX: origin.x,
      originY: origin.y,
      pieces: prefersReducedMotion ? [] : buildConfettiPieces(),
    });

    if (celebrationTimeoutRef.current !== null) {
      window.clearTimeout(celebrationTimeoutRef.current);
    }
    celebrationTimeoutRef.current = window.setTimeout(() => {
      setCelebration(null);
    }, CELEBRATION_VISIBLE_MS);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const { fromColumnId, toColumnId } = resolveMoveColumnIds(
      currentBoard.columns,
      active.id as string,
      over.id as string
    );

    const nextBoard = {
      ...currentBoard,
      columns: moveCard(currentBoard.columns, active.id as string, over.id as string),
    };
    updateBoard(nextBoard);

    if (shouldCelebrateDoneMove(fromColumnId, toColumnId, DONE_COLUMN_ID)) {
      triggerDoneCelebration(event, active.id as string, toColumnId as string);
    }
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    const nextBoard = {
      ...currentBoard,
      columns: currentBoard.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    };
    updateBoard(nextBoard);
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    const nextBoard = {
      ...currentBoard,
      cards: {
        ...currentBoard.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: currentBoard.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    };
    updateBoard(nextBoard);
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    const nextBoard = {
      ...currentBoard,
      cards: Object.fromEntries(
        Object.entries(currentBoard.cards).filter(([id]) => id !== cardId)
      ),
      columns: currentBoard.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    };
    updateBoard(nextBoard);
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const isDoneCelebrating = Boolean(celebration);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {currentBoard.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <div ref={boardRegionRef} className="relative">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5">
              {currentBoard.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => currentBoard.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  isCelebrating={isDoneCelebrating && column.id === DONE_COLUMN_ID}
                  celebratedCardId={
                    isDoneCelebrating && column.id === DONE_COLUMN_ID
                      ? celebration?.cardId ?? null
                      : null
                  }
                  reducedMotion={prefersReducedMotion}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {celebration && !prefersReducedMotion ? (
            <div className="celebration-layer" data-testid="done-confetti">
              {celebration.pieces.map((piece) => {
                const style = {
                  left: `${celebration.originX}px`,
                  top: `${celebration.originY}px`,
                  "--dx": `${piece.dx}px`,
                  "--dy": `${piece.dy}px`,
                  "--rot": `${piece.rotation}deg`,
                  "--delay": `${piece.delay}ms`,
                  "--color": piece.color,
                } as CSSProperties;
                return <span key={piece.id} className="confetti-piece" style={style} />;
              })}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};
