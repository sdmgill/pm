import { useCallback, useRef, useState } from "react";
import { api, ApiError, type BoardSnapshot } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

// Owns the board and its server version. Saves are sent one at a time; edits made
// while a save is in flight are coalesced and sent with the version that save returns.
export const useBoardSync = () => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef<number | null>(null);
  const pendingRef = useRef<BoardData | null>(null);
  const savingRef = useRef(false);

  const applySnapshot = useCallback((snapshot: BoardSnapshot) => {
    setBoard(snapshot.board);
    versionRef.current = snapshot.version;
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      applySnapshot(await api.getBoard());
    } catch {
      setError("Unable to load your board right now.");
    } finally {
      setIsLoading(false);
    }
  }, [applySnapshot]);

  const flush = useCallback(async () => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);

    try {
      while (pendingRef.current && versionRef.current !== null) {
        const nextBoard = pendingRef.current;
        pendingRef.current = null;
        const snapshot = await api.saveBoard(nextBoard, versionRef.current);
        versionRef.current = snapshot.version;
      }
    } catch (error) {
      pendingRef.current = null;
      if (error instanceof ApiError && error.status === 409) {
        setError("Board changed in another session. Reloaded latest state.");
        await reload();
      } else {
        setError("Unable to save board right now.");
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [reload]);

  const updateBoard = useCallback(
    (nextBoard: BoardData) => {
      setBoard(nextBoard);
      setError(null);
      pendingRef.current = nextBoard;
      void flush();
    },
    [flush]
  );

  const reset = useCallback(() => {
    setBoard(null);
    setError(null);
    versionRef.current = null;
    pendingRef.current = null;
  }, []);

  return { board, isLoading, isSaving, error, reload, updateBoard, applySnapshot, reset };
};
