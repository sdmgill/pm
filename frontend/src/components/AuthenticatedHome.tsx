"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

type AuthMeResponse = {
  authenticated: boolean;
  user: string | null;
};

type BoardApiResponse = {
  board: BoardData;
  version: number;
  updated_at: string;
};

const fallbackToLocalDemo = process.env.NEXT_PUBLIC_USE_LOCAL_DEMO_AUTH === "1";

export const AuthenticatedHome = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("user");
  const [password, setPassword] = useState("password");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [boardLoadError, setBoardLoadError] = useState<string | null>(null);
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [isBoardSaving, setIsBoardSaving] = useState(false);
  const boardVersionRef = useRef<number | null>(null);

  const applyBoardSnapshot = useCallback((snapshot: BoardApiResponse) => {
    setBoard(snapshot.board);
    boardVersionRef.current = snapshot.version;
  }, []);

  const loadBoard = useCallback(async () => {
    setBoardLoadError(null);
    setIsBoardLoading(true);

    try {
      const response = await fetch("/api/board", { method: "GET" });
      if (!response.ok) {
        throw new Error("Unable to load board data");
      }

      const snapshot = (await response.json()) as BoardApiResponse;
      applyBoardSnapshot(snapshot);
    } catch {
      if (fallbackToLocalDemo) {
        setBoard(initialData);
        boardVersionRef.current = 1;
      } else {
        setBoardLoadError("Unable to load your board right now.");
      }
    } finally {
      setIsBoardLoading(false);
    }
  }, [applyBoardSnapshot]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/auth/me", { method: "GET" });
        if (!response.ok) {
          throw new Error("Unable to validate session");
        }

        const data = (await response.json()) as AuthMeResponse;
        setIsAuthenticated(data.authenticated);
      } catch {
        if (fallbackToLocalDemo) {
          setIsAuthenticated(true);
        } else {
          setError("Unable to connect to authentication service.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void checkAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadBoard();
  }, [isAuthenticated, loadBoard]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError("Invalid username or password.");
        return;
      }

      setIsAuthenticated(true);
    } catch {
      setError("Unable to sign in right now.");
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await fetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout network errors and still clear UI state for safety.
    }

    setIsAuthenticated(false);
    setPassword("password");
    setBoard(null);
    boardVersionRef.current = null;
    setBoardLoadError(null);
    setIsBoardLoading(false);
    setIsBoardSaving(false);
  };

  const handleBoardChange = async (nextBoard: BoardData) => {
    setBoard(nextBoard);

    const expectedVersion = boardVersionRef.current;
    if (expectedVersion === null && fallbackToLocalDemo) {
      return;
    }

    setIsBoardSaving(true);
    setBoardLoadError(null);

    try {
      const response = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: nextBoard, expected_version: expectedVersion }),
      });

      if (response.status === 409) {
        setBoardLoadError("Board changed in another session. Reloading latest state.");
        await loadBoard();
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to save board data");
      }

      const snapshot = (await response.json()) as BoardApiResponse;
      applyBoardSnapshot(snapshot);
    } catch {
      if (!fallbackToLocalDemo) {
        setBoardLoadError("Unable to save board right now.");
      }
    } finally {
      setIsBoardSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[640px] items-center justify-center px-6">
        <p className="text-sm text-[var(--gray-text)]">Checking session...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[640px] items-center justify-center px-6">
        <section className="w-full rounded-[28px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            PM MVP
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Sign in
          </h1>
          <p className="mt-3 text-sm text-[var(--gray-text)]">
            Use the demo credentials to access your board.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-[var(--navy-dark)]" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="w-full rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />

            <label className="block text-sm font-medium text-[var(--navy-dark)]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="w-full rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              className="w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white"
              type="submit"
            >
              Sign in
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-[var(--stroke)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--navy-dark)]">Signed in as user</p>
            {isBoardLoading ? (
              <p className="text-xs text-[var(--gray-text)]">Loading board...</p>
            ) : null}
            {isBoardSaving ? (
              <p className="text-xs text-[var(--gray-text)]">Saving changes...</p>
            ) : null}
            {boardLoadError ? (
              <p className="text-xs text-red-700">{boardLoadError}</p>
            ) : null}
          </div>
          <button
            className="rounded-lg border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)]"
            onClick={handleLogout}
            type="button"
          >
            Log out
          </button>
        </div>
      </header>
      {isBoardLoading || !board ? (
        <main className="mx-auto flex min-h-[60vh] max-w-[640px] items-center justify-center px-6">
          <p className="text-sm text-[var(--gray-text)]">Loading board...</p>
        </main>
      ) : (
        <KanbanBoard board={board} onBoardChange={handleBoardChange} />
      )}
    </>
  );
};
